"""ASR seam: exactly one entry point, `transcribe(pcm) -> str`.

Backends (NOTANDA_ASR_BACKEND):
- "transcribe_cpp": Cohere Transcribe Arabic Q8_0 GGUF via the transcribe.cpp
  Python binding (`pip install /opt/notanda/transcribe.cpp/bindings/python`;
  needs the locally built libtranscribe — auto-discovered from the repo, or
  set TRANSCRIBE_LIBRARY). Model loads once and stays resident. The binding
  allows one run at a time per Model — fine, the worker is single-threaded.
- "transcribe_cli": subprocess fallback (`transcribe-cli -m model.gguf file.wav`)
  if the binding won't build on the box.
- "stub": instant fake output for local development without the model.
"""

import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from . import settings
from .audio import SAMPLE_RATE

# Tags the model emits on residual noise despite VAD (HF discussion #4).
HALLUCINATION_MARKERS = ("@@@ضوضاء", "@@@فراغ", "@@@")

_model = None


def transcribe(pcm: np.ndarray) -> str:
    """int16 mono 16 kHz -> transcript text ('' if nothing usable)."""
    if settings.ASR_BACKEND == "stub":
        return f"[stub {len(pcm) / SAMPLE_RATE:.1f}s speech]"
    if settings.ASR_BACKEND == "transcribe_cli":
        return _run_cli(pcm)
    return _run_binding(pcm)


def clean(text: str, previous: str | None) -> str:
    """Post-ASR filter: hallucination tags and exact repeats -> ''."""
    text = text.strip()
    if not text or any(m in text for m in HALLUCINATION_MARKERS):
        return ""
    if previous is not None and text == previous.strip():
        return ""
    return text


def _run_binding(pcm: np.ndarray) -> str:
    global _model
    if _model is None:
        import transcribe_cpp

        _model = transcribe_cpp.Model(settings.MODEL_PATH)
    # One run at a time per Model (0.x); the worker is single-threaded so a
    # fresh short-lived session per span is fine.
    with _model.session(n_threads=settings.TRANSCRIBE_THREADS) as session:
        result = session.run(pcm.astype(np.float32) / 32768.0)
    return result.text.strip()


def _run_cli(pcm: np.ndarray) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "span.wav"
        _write_wav(wav, pcm)
        proc = subprocess.run(
            [settings.TRANSCRIBE_BIN, "-m", settings.MODEL_PATH, str(wav)],
            capture_output=True, timeout=600,
        )
    if proc.returncode != 0:
        raise RuntimeError(f"transcribe-cli failed: {proc.stderr.decode(errors='replace')[:500]}")
    return proc.stdout.decode(errors="replace").strip()


def _write_wav(path: Path, pcm: np.ndarray) -> None:
    data = pcm.tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(data))
    path.write_bytes(header + data)
