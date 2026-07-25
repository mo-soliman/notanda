"""ASR seam: one entry point, `transcribe_batch(spans) -> list[str]`.

Backends (NOTANDA_ASR_BACKEND):
- "transcribe_cli" (default): Cohere Transcribe Arabic Q8_0 GGUF through the
  transcribe.cpp CLI in batch mode — one process per chunk, all of that
  chunk's VAD spans in a single invocation, so the ~1.8 s model load is paid
  once per chunk rather than once per span.

  A subprocess is not just convenience: pysilero-vad ships its own bundled
  libggml, and in-process it wins the SONAME race against libtranscribe's,
  crashing the flash-attention kernel on a version mismatch. The process
  boundary keeps the two ggml builds apart for good.

- "stub": instant fake output for local development without the model.
"""

import json
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from . import settings
from .audio import SAMPLE_RATE

# Tags the model emits on residual noise despite VAD (HF discussion #4).
HALLUCINATION_MARKERS = ("@@@ضوضاء", "@@@فراغ", "@@@")


def transcribe_batch(spans: list[np.ndarray]) -> list[str]:
    """int16 mono 16 kHz spans -> one transcript each, same order."""
    if not spans:
        return []
    if settings.ASR_BACKEND == "stub":
        return [f"[stub {len(s) / SAMPLE_RATE:.1f}s speech]" for s in spans]
    return _run_cli_batch(spans)


def clean(text: str, previous: str | None) -> str:
    """Post-ASR filter: hallucination tags and exact repeats -> ''."""
    text = text.strip()
    if not text or any(m in text for m in HALLUCINATION_MARKERS):
        return ""
    if previous is not None and text == previous.strip():
        return ""
    return text


def _run_cli_batch(spans: list[np.ndarray]) -> list[str]:
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        paths = []
        for i, span in enumerate(spans):
            path = tmpdir / f"span-{i:04d}.wav"
            _write_wav(path, span)
            paths.append(path)
        list_file = tmpdir / "batch.list"
        list_file.write_text("\n".join(str(p) for p in paths) + "\n")

        proc = subprocess.run(
            [settings.TRANSCRIBE_BIN, "--batch", str(list_file), "--batch-jsonl",
             "-m", settings.MODEL_PATH, "--threads", str(settings.TRANSCRIBE_THREADS),
             "-l", "ar", "-q"],
            capture_output=True, timeout=1800,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"transcribe-cli failed: {proc.stderr.decode(errors='replace')[:500]}")

        # stdout interleaves JSONL results with plain-text runtime logs
        by_path: dict[str, str] = {}
        for line in proc.stdout.decode(errors="replace").splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "file" in rec:
                by_path[rec["file"]] = rec.get("text", "")
        return [by_path.get(str(p), "") for p in paths]


def _write_wav(path: Path, pcm: np.ndarray) -> None:
    data = pcm.tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(data))
    path.write_bytes(header + data)
