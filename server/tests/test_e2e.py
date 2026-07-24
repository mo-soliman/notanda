"""End-to-end server test with the stub ASR backend and real ffmpeg + VAD.

Exercises the full contract: key auth -> create meeting -> chunk upload
(idempotent) -> worker pipeline -> segments -> finish -> summary -> audio gone.
"""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

TMP = Path(tempfile.mkdtemp(prefix="notanda-test-"))
os.environ["NOTANDA_DATA_DIR"] = str(TMP)
os.environ["NOTANDA_ASR_BACKEND"] = "stub"

from fastapi.testclient import TestClient  # noqa: E402

from notanda_server import db, keys, worker  # noqa: E402
from notanda_server.api import app  # noqa: E402

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg required")


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def auth():
    key = keys.create("test")
    return {"Authorization": f"Bearer {key}"}


def _synth_webm(name: str, sentence: str) -> bytes:
    """A webm/opus chunk containing actual speech (synthesized), so VAD fires."""
    if not shutil.which("say"):  # linux CI: noise bursts won't reliably trip VAD
        pytest.skip("no speech synthesizer available")
    aiff = TMP / f"{name}.aiff"
    webm = TMP / f"{name}.webm"
    subprocess.run(["say", "-o", str(aiff), sentence], check=True)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(aiff),
         "-c:a", "libopus", "-b:a", "32k", str(webm)],
        check=True,
    )
    return webm.read_bytes()


@pytest.fixture(scope="module")
def speech_webm():
    return _synth_webm("speech1", "testing one two three, the meeting starts now")


@pytest.fixture(scope="module")
def speech_webm2():
    # Different length so the stub ASR text differs; identical text would be
    # (correctly) dropped by the cross-chunk repeat filter.
    return _synth_webm("speech2", "and here is a much longer second chunk of the meeting, with several additional words spoken")


def drain_worker():
    conn = db.connect()
    while (chunk := worker.claim_next_chunk(conn)) is not None:
        worker.process_chunk(conn, chunk)
    conn.close()


def test_auth_required(client):
    assert client.get("/v1/meetings").status_code == 401
    assert client.get("/v1/meetings", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_full_meeting_flow(client, auth, speech_webm, speech_webm2, monkeypatch):
    # create
    r = client.post("/v1/meetings", json={"title": "اجتماع تجريبي", "language": "ar"}, headers=auth)
    assert r.status_code == 201
    meeting = r.json()
    assert meeting["status"] == "recording"
    mid = meeting["id"]

    # upload two chunks on mic, one on sys; re-PUT chunk 0 to prove idempotency
    for stream, index, blob in [
        ("mic", 0, speech_webm), ("mic", 1, speech_webm2), ("sys", 0, speech_webm), ("mic", 0, speech_webm),
    ]:
        r = client.put(f"/v1/meetings/{mid}/chunks/{stream}/{index}", content=blob, headers=auth)
        assert r.status_code == 204
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) c FROM chunks WHERE meeting_id=?", (mid,)).fetchone()["c"] == 3

    # live polling before transcription: no segments, 3 pending
    r = client.get(f"/v1/meetings/{mid}/segments", headers=auth).json()
    assert r["segments"] == [] and r["pending_chunks"] == 3

    drain_worker()

    # segments exist, ordered, speakers mapped, audio files deleted
    r = client.get(f"/v1/meetings/{mid}/segments", headers=auth).json()
    assert r["pending_chunks"] == 0
    assert len(r["segments"]) >= 2
    assert {s["speaker"] for s in r["segments"]} == {"me", "them"}
    starts = [s["start_ms"] for s in r["segments"]]
    assert starts == sorted(starts)
    assert any(s["start_ms"] >= 30_000 for s in r["segments"])  # chunk index 1 offsets by 30 s
    assert list((TMP / "audio" / mid).glob("*.webm")) == []
    assert conn.execute(
        "SELECT COUNT(*) c FROM chunks WHERE meeting_id=? AND path IS NOT NULL", (mid,)
    ).fetchone()["c"] == 0

    # cursor polling: after_seq skips what we've seen
    last = r["last_seq"]
    assert client.get(f"/v1/meetings/{mid}/segments?after_seq={last}", headers=auth).json()["segments"] == []

    # finish -> summary (Anthropic mocked) -> complete
    monkeypatch.setattr(
        "notanda_server.worker.summarize.summarize",
        lambda transcript, language: {
            "overview_md": "ملخص تجريبي", "decisions": ["قرار"], "action_items": [{"text": "مهمة", "owner": None}],
        },
    )
    assert client.post(f"/v1/meetings/{mid}/finish", json={"duration_ms": 60000}, headers=auth).status_code == 202
    worker.finalize_meetings(conn)

    detail = client.get(f"/v1/meetings/{mid}", headers=auth).json()
    assert detail["status"] == "complete"
    assert detail["summary"]["overview_md"] == "ملخص تجريبي"
    assert detail["summary"]["model"]

    listing = client.get("/v1/meetings", headers=auth).json()["meetings"]
    assert listing[0]["id"] == mid and listing[0]["has_summary"] is True
    conn.close()


def test_summary_failure_marks_error_keeps_transcript(client, auth, speech_webm, monkeypatch):
    mid = client.post("/v1/meetings", json={}, headers=auth).json()["id"]
    client.put(f"/v1/meetings/{mid}/chunks/mic/0", content=speech_webm, headers=auth)
    drain_worker()
    client.post(f"/v1/meetings/{mid}/finish", json={}, headers=auth)

    monkeypatch.setattr("notanda_server.worker.SUMMARY_RETRIES", 1)
    monkeypatch.setattr(
        "notanda_server.worker.summarize.summarize",
        lambda *a: (_ for _ in ()).throw(RuntimeError("api down")),
    )
    conn = db.connect()
    worker.finalize_meetings(conn)
    detail = client.get(f"/v1/meetings/{mid}", headers=auth).json()
    assert detail["status"] == "error" and detail["summary"] is None
    assert client.get(f"/v1/meetings/{mid}/segments", headers=auth).json()["segments"]
    conn.close()


def test_chunk_rejected_after_completion(client, auth, speech_webm):
    conn = db.connect()
    mid = client.post("/v1/meetings", json={}, headers=auth).json()["id"]
    with conn:
        conn.execute("UPDATE meetings SET status='complete' WHERE id=?", (mid,))
    r = client.put(f"/v1/meetings/{mid}/chunks/mic/0", content=speech_webm, headers=auth)
    assert r.status_code == 409
    conn.close()
