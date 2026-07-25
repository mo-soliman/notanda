"""Env-based configuration. All state lives under DATA_DIR."""

import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("NOTANDA_DATA_DIR", "/var/lib/notanda"))
DB_PATH = DATA_DIR / "notanda.db"
AUDIO_DIR = DATA_DIR / "audio"

# ASR backend: "transcribe_cli" (production) or "stub" (local dev without the model)
ASR_BACKEND = os.environ.get("NOTANDA_ASR_BACKEND", "transcribe_cli")
MODEL_PATH = os.environ.get("NOTANDA_MODEL_PATH", "/models/cohere-transcribe-arabic-07-2026-Q8_0.gguf")
TRANSCRIBE_BIN = os.environ.get("NOTANDA_TRANSCRIBE_BIN", "/usr/local/bin/transcribe-cli")
TRANSCRIBE_THREADS = int(os.environ.get("NOTANDA_TRANSCRIBE_THREADS", "3"))

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SUMMARY_MODEL = os.environ.get("NOTANDA_SUMMARY_MODEL", "claude-haiku-4-5")

CHUNK_SECONDS = 30  # client chunk cadence; start_ms = chunk_index * CHUNK_SECONDS * 1000 + VAD offset
MAX_CHUNK_BYTES = 10 * 1024 * 1024
ORPHAN_AUDIO_MAX_AGE_H = 24  # backstop sweep: no audio file may outlive this
