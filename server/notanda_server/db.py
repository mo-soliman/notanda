"""SQLite access for both the API and the worker.

SQLite in WAL mode is the database *and* the job queue: the API inserts
`chunks` rows as `pending`; the single worker process claims and processes
them. One writer at a time per connection + busy_timeout keeps the two
processes out of each other's way.
"""

import secrets
import sqlite3
from datetime import datetime, timezone

from . import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS api_keys (
  id          INTEGER PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id          TEXT PRIMARY KEY,
  api_key_id  INTEGER NOT NULL REFERENCES api_keys(id),
  title       TEXT,
  language    TEXT NOT NULL DEFAULT 'ar',
  status      TEXT NOT NULL DEFAULT 'recording',
  created_at  TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id),
  stream      TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  path        TEXT,
  received_at TEXT NOT NULL,
  error       TEXT,
  UNIQUE (meeting_id, stream, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunks_pending ON chunks(status, meeting_id, chunk_index);

CREATE TABLE IF NOT EXISTS segments (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id),
  chunk_id    INTEGER NOT NULL REFERENCES chunks(id),
  speaker     TEXT NOT NULL,
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  text        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_meeting ON segments(meeting_id, start_ms);

CREATE TABLE IF NOT EXISTS summaries (
  id           INTEGER PRIMARY KEY,
  meeting_id   TEXT NOT NULL UNIQUE REFERENCES meetings(id),
  model        TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI may run a sync dependency and an async
    # endpoint on different threads; each connection still serves one request
    # (or the single worker loop) sequentially.
    conn = sqlite3.connect(settings.DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_meeting_id() -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # no lookalikes
    return "mtg_" + "".join(secrets.choice(alphabet) for _ in range(10))
