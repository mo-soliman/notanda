"""Transcription worker: single process, SQLite is the queue.

    python -m notanda_server.worker

Loop: claim oldest pending chunk -> decode -> VAD -> ASR -> segments -> delete
audio. When idle, finalize any finished meetings (summary), then sweep orphaned
audio. Crash-safe: `processing` chunks are re-queued on startup.
"""

import json
import logging
import sqlite3
import time
from pathlib import Path

from . import asr, audio, db, settings, summarize

log = logging.getLogger("notanda.worker")

SUMMARY_RETRIES = 3
SWEEP_INTERVAL_S = 600


def process_chunk(conn: sqlite3.Connection, chunk: sqlite3.Row) -> None:
    pcm = audio.decode_to_pcm(Path(chunk["path"]).read_bytes())
    spans = audio.find_speech(pcm)
    speaker = "me" if chunk["stream"] == "mic" else "them"
    base_ms = chunk["chunk_index"] * settings.CHUNK_SECONDS * 1000

    # Repeat-filter seed: the last thing this speaker said in an earlier chunk.
    prev_row = conn.execute(
        "SELECT text FROM segments WHERE meeting_id = ? AND speaker = ? ORDER BY seq DESC LIMIT 1",
        (chunk["meeting_id"], speaker),
    ).fetchone()
    previous = prev_row["text"] if prev_row else None

    rows = []
    texts = asr.transcribe_batch([s.audio for s in spans])  # one ASR process per chunk
    for span, raw in zip(spans, texts):
        text = asr.clean(raw, previous)
        if not text:
            continue
        previous = text
        rows.append((chunk["meeting_id"], chunk["id"], speaker, base_ms + span.start_ms, base_ms + span.end_ms, text))

    with conn:
        conn.executemany(
            "INSERT INTO segments (meeting_id, chunk_id, speaker, start_ms, end_ms, text) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.execute("UPDATE chunks SET status = 'done', path = NULL WHERE id = ?", (chunk["id"],))
    Path(chunk["path"]).unlink(missing_ok=True)  # audio never outlives transcription


def claim_next_chunk(conn: sqlite3.Connection) -> sqlite3.Row | None:
    with conn:
        chunk = conn.execute(
            "SELECT * FROM chunks WHERE status = 'pending' "
            "ORDER BY meeting_id, chunk_index, stream LIMIT 1"
        ).fetchone()
        if chunk:
            conn.execute("UPDATE chunks SET status = 'processing' WHERE id = ?", (chunk["id"],))
    return chunk


def finalize_meetings(conn: sqlite3.Connection) -> None:
    """Summarize meetings that are finished and fully transcribed."""
    meetings = conn.execute(
        "SELECT m.* FROM meetings m WHERE m.status = 'processing' "
        "AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.meeting_id = m.id "
        "                AND c.status IN ('pending', 'processing')) "
        "AND NOT EXISTS (SELECT 1 FROM summaries s WHERE s.meeting_id = m.id)"
    ).fetchall()
    for meeting in meetings:
        segments = conn.execute(
            "SELECT speaker, start_ms, text FROM segments WHERE meeting_id = ? ORDER BY start_ms, seq",
            (meeting["id"],),
        ).fetchall()
        if not segments:
            with conn:
                conn.execute("UPDATE meetings SET status = 'complete' WHERE id = ?", (meeting["id"],))
            continue

        transcript = summarize.format_transcript(segments)
        for attempt in range(SUMMARY_RETRIES):
            try:
                content = summarize.summarize(transcript, meeting["language"])
                with conn:
                    conn.execute(
                        "INSERT INTO summaries (meeting_id, model, content_json, created_at) "
                        "VALUES (?, ?, ?, ?)",
                        (meeting["id"], settings.SUMMARY_MODEL, json.dumps(content, ensure_ascii=False), db.now_iso()),
                    )
                    conn.execute("UPDATE meetings SET status = 'complete' WHERE id = ?", (meeting["id"],))
                break
            except Exception:
                log.exception("summary attempt %d failed for %s", attempt + 1, meeting["id"])
                if attempt == SUMMARY_RETRIES - 1:
                    with conn:  # transcript survives; only the summary is missing
                        conn.execute("UPDATE meetings SET status = 'error' WHERE id = ?", (meeting["id"],))
                else:
                    time.sleep(5 * (attempt + 1))


def sweep_orphans() -> None:
    """Backstop for the privacy guarantee: no audio file outlives 24 h."""
    cutoff = time.time() - settings.ORPHAN_AUDIO_MAX_AGE_H * 3600
    if not settings.AUDIO_DIR.exists():
        return
    for f in settings.AUDIO_DIR.rglob("*.webm"):
        if f.stat().st_mtime < cutoff:
            log.warning("sweeping orphaned audio %s", f)
            f.unlink(missing_ok=True)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    conn = db.connect()
    with conn:  # crash recovery: reclaim chunks a dead worker left mid-flight
        conn.execute("UPDATE chunks SET status = 'pending' WHERE status = 'processing'")
    log.info("worker up (backend=%s, threads=%d)", settings.ASR_BACKEND, settings.TRANSCRIBE_THREADS)

    last_sweep = 0.0
    while True:
        chunk = claim_next_chunk(conn)
        if chunk:
            try:
                process_chunk(conn, chunk)
                log.info("chunk %s/%s-%d done", chunk["meeting_id"], chunk["stream"], chunk["chunk_index"])
            except Exception as exc:
                log.exception("chunk %d failed", chunk["id"])
                with conn:
                    conn.execute(
                        "UPDATE chunks SET status = 'failed', error = ?, path = NULL WHERE id = ?",
                        (str(exc)[:1000], chunk["id"]),
                    )
                if chunk["path"]:
                    Path(chunk["path"]).unlink(missing_ok=True)
            continue  # drain audio before anything else

        finalize_meetings(conn)
        if time.time() - last_sweep > SWEEP_INTERVAL_S:
            sweep_orphans()
            last_sweep = time.time()
        time.sleep(1)


if __name__ == "__main__":
    main()
