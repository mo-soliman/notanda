"""Notanda HTTP API. Contract: docs/API.md — keep the two in sync by hand.

Run: uvicorn notanda_server.api:app --host 127.0.0.1 --port 8000
"""

import json
import sqlite3
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Request, Response
from pydantic import BaseModel

from . import db, settings
from .keys import hash_key

app = FastAPI(title="Notanda API", docs_url=None, redoc_url=None)


def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def get_api_key_id(conn: Conn, authorization: Annotated[str, Header()] = "") -> int:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "invalid api key")
    row = conn.execute(
        "SELECT id FROM api_keys WHERE key_hash = ?",
        (hash_key(authorization.removeprefix("Bearer ").strip()),),
    ).fetchone()
    if not row:
        raise HTTPException(401, "invalid api key")
    return row["id"]


KeyId = Annotated[int, Depends(get_api_key_id)]


def get_meeting(conn: sqlite3.Connection, key_id: int, meeting_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM meetings WHERE id = ? AND api_key_id = ?", (meeting_id, key_id)
    ).fetchone()
    if not row:
        raise HTTPException(404, "meeting not found")
    return row


class CreateMeeting(BaseModel):
    title: str | None = None
    language: Literal["ar", "en"] = "ar"


class FinishMeeting(BaseModel):
    duration_ms: int | None = None


@app.post("/v1/meetings", status_code=201)
def create_meeting(body: CreateMeeting, conn: Conn, key_id: KeyId):
    meeting_id = db.new_meeting_id()
    created_at = db.now_iso()
    with conn:
        conn.execute(
            "INSERT INTO meetings (id, api_key_id, title, language, status, created_at) "
            "VALUES (?, ?, ?, ?, 'recording', ?)",
            (meeting_id, key_id, body.title, body.language, created_at),
        )
    return {
        "id": meeting_id,
        "title": body.title,
        "language": body.language,
        "status": "recording",
        "created_at": created_at,
    }


@app.put("/v1/meetings/{meeting_id}/chunks/{stream}/{index}", status_code=204)
async def upload_chunk(
    meeting_id: str,
    stream: Literal["mic", "sys"],
    index: Annotated[int, Path(ge=0)],
    request: Request,
    conn: Conn,
    key_id: KeyId,
):
    meeting = get_meeting(conn, key_id, meeting_id)
    if meeting["status"] not in ("recording", "processing"):
        raise HTTPException(409, f"meeting is {meeting['status']}")

    body = await request.body()
    if len(body) > settings.MAX_CHUNK_BYTES:
        raise HTTPException(413, "chunk too large")
    if not body:
        raise HTTPException(400, "empty chunk")

    chunk_dir = settings.AUDIO_DIR / meeting_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    path = chunk_dir / f"{stream}-{index}.webm"

    # Write the file before the row: the worker only sees chunks that exist on disk.
    path.write_bytes(body)
    try:
        with conn:
            conn.execute(
                "INSERT INTO chunks (meeting_id, stream, chunk_index, status, path, received_at) "
                "VALUES (?, ?, ?, 'pending', ?, ?)",
                (meeting_id, stream, index, str(path), db.now_iso()),
            )
    except sqlite3.IntegrityError:
        pass  # duplicate (meeting_id, stream, index): idempotent retry, keep first
    return Response(status_code=204)


@app.post("/v1/meetings/{meeting_id}/finish", status_code=202)
def finish_meeting(meeting_id: str, body: FinishMeeting, conn: Conn, key_id: KeyId):
    meeting = get_meeting(conn, key_id, meeting_id)
    if meeting["status"] == "recording":
        with conn:
            conn.execute(
                "UPDATE meetings SET status = 'processing', finished_at = ?, "
                "duration_ms = COALESCE(?, duration_ms) WHERE id = ?",
                (db.now_iso(), body.duration_ms, meeting_id),
            )
    return {"status": "processing" if meeting["status"] == "recording" else meeting["status"]}


@app.get("/v1/meetings")
def list_meetings(conn: Conn, key_id: KeyId):
    rows = conn.execute(
        "SELECT m.id, m.title, m.status, m.created_at, m.duration_ms, "
        "       EXISTS(SELECT 1 FROM summaries s WHERE s.meeting_id = m.id) AS has_summary "
        "FROM meetings m WHERE m.api_key_id = ? ORDER BY m.created_at DESC",
        (key_id,),
    ).fetchall()
    return {
        "meetings": [
            {**dict(r), "has_summary": bool(r["has_summary"])} for r in rows
        ]
    }


@app.get("/v1/meetings/{meeting_id}")
def meeting_detail(meeting_id: str, conn: Conn, key_id: KeyId):
    meeting = get_meeting(conn, key_id, meeting_id)
    summary_row = conn.execute(
        "SELECT model, content_json, created_at FROM summaries WHERE meeting_id = ?",
        (meeting_id,),
    ).fetchone()
    summary = None
    if summary_row:
        summary = json.loads(summary_row["content_json"])
        summary["generated_at"] = summary_row["created_at"]
        summary["model"] = summary_row["model"]
    return {
        "id": meeting["id"],
        "title": meeting["title"],
        "language": meeting["language"],
        "status": meeting["status"],
        "created_at": meeting["created_at"],
        "finished_at": meeting["finished_at"],
        "duration_ms": meeting["duration_ms"],
        "summary": summary,
    }


@app.get("/v1/meetings/{meeting_id}/segments")
def segments(meeting_id: str, conn: Conn, key_id: KeyId, after_seq: int = 0):
    get_meeting(conn, key_id, meeting_id)
    rows = conn.execute(
        "SELECT seq, speaker, start_ms, end_ms, text FROM segments "
        "WHERE meeting_id = ? AND seq > ? ORDER BY start_ms, seq",
        (meeting_id, after_seq),
    ).fetchall()
    pending = conn.execute(
        "SELECT COUNT(*) AS n FROM chunks WHERE meeting_id = ? AND status IN ('pending', 'processing')",
        (meeting_id,),
    ).fetchone()["n"]
    last_seq = conn.execute(
        "SELECT COALESCE(MAX(seq), ?) AS s FROM segments WHERE meeting_id = ?",
        (after_seq, meeting_id),
    ).fetchone()["s"]
    return {"segments": [dict(r) for r in rows], "last_seq": last_seq, "pending_chunks": pending}


@app.get("/healthz")
def healthz(conn: Conn):
    depth = conn.execute(
        "SELECT COUNT(*) AS n FROM chunks WHERE status IN ('pending', 'processing')"
    ).fetchone()["n"]
    return {"ok": True, "queue_depth": depth}
