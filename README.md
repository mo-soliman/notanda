# Notanda

Arabic-first AI meeting notes (Granola-style, no bot). Desktop app (macOS + Windows) records mic + system audio, uploads 30 s Opus chunks to a self-hosted backend that runs Cohere Transcribe Arabic (Q8_0 GGUF on transcribe.cpp), and produces a near-live transcript plus a post-meeting AI summary. Audio is deleted from the server the moment it's transcribed.

- Architecture & build plan: `docs/` (RESEARCH.md, RESEARCH-2-*.md), API contract in `docs/API.md`.
- `server/` — FastAPI ingestion API + transcription worker (Python, SQLite, silero-VAD, transcribe.cpp).
- `desktop/` — Electron + React + Tailwind (RTL Arabic-first UI).

## Run the server locally (no model needed)

```bash
cd server
uv sync
NOTANDA_DATA_DIR=/tmp/notanda NOTANDA_ASR_BACKEND=stub uv run python -m notanda_server.keys create dev   # prints an API key
NOTANDA_DATA_DIR=/tmp/notanda NOTANDA_ASR_BACKEND=stub uv run uvicorn notanda_server.api:app --port 8000 &
NOTANDA_DATA_DIR=/tmp/notanda NOTANDA_ASR_BACKEND=stub uv run python -m notanda_server.worker &
```

Tests: `cd server && uv run pytest`

## Run the desktop app

```bash
cd desktop
pnpm install
pnpm dev
```

In Settings: server URL `http://127.0.0.1:8000` + the API key from above. macOS will ask for Microphone and Screen Recording permissions on first record (screen recording is how Electron captures system audio in v1).

## Live deployment

Backend runs on the Oracle Ampere box at **https://api.novari.style** (temporary domain; TLS via certbot/Let's Encrypt, auto-renewing). Point the desktop app's Settings there with an API key from step 2 below.

```bash
ssh ubuntu@92.5.108.127
cd ~/notanda
docker compose ps                 # api + worker
docker compose logs -f worker     # transcription progress
docker compose up -d --build      # deploy after a git pull
```

Measured on this box: **RTF 0.69** end-to-end (~21 s to transcribe a 30 s chunk). See `docs/BENCHMARK-M0.md`.

## Deploy to the Oracle box (M0/M1)

```bash
# on the box, from the repo's server/ directory:
bash deploy/setup.sh            # apt deps, builds transcribe.cpp, downloads Q8_0 model, systemd + nginx vhost
uv run python deploy/benchmark.py /path/to/real-arabic-meeting.m4a   # the M0 go/no-go gate
uv run python -m notanda_server.keys create <label>
```

TLS: point a DNS A record (`api.novari.style` for now) at the box, then `sudo certbot --nginx -d api.novari.style`. Open 80/443 in the OCI VCN security list (local iptables rules are handled by setup.sh). Set `ANTHROPIC_API_KEY` in `/etc/notanda/env` for summaries.
