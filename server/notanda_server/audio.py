"""Audio decode + VAD segmentation.

The ASR model hallucinates on silence/noise (undocumented @@@ tags, invented
dialogue) at high token confidence, so nothing reaches it without passing
silero-VAD first.
"""

import subprocess
from dataclasses import dataclass

import numpy as np
from pysilero_vad import SileroVoiceActivityDetector

SAMPLE_RATE = 16_000
FRAME_SAMPLES = 512  # silero operates on 512-sample frames at 16 kHz (32 ms)

SPEECH_THRESHOLD = 0.5
PAD_MS = 200        # widen each span so word onsets/offsets aren't clipped
MERGE_GAP_MS = 300  # spans closer than this become one segment

_vad: SileroVoiceActivityDetector | None = None


def decode_to_pcm(webm_bytes: bytes) -> np.ndarray:
    """WebM/Opus (or any ffmpeg-readable audio) -> 16 kHz mono int16."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error",
         "-i", "pipe:0", "-ar", str(SAMPLE_RATE), "-ac", "1", "-f", "s16le", "pipe:1"],
        input=webm_bytes, capture_output=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode(errors='replace')[:500]}")
    return np.frombuffer(proc.stdout, dtype=np.int16)


@dataclass
class SpeechSpan:
    start_ms: int  # offset within this chunk
    end_ms: int
    audio: np.ndarray  # int16 @ 16 kHz


def find_speech(pcm: np.ndarray) -> list[SpeechSpan]:
    """Frame-level silero probabilities -> padded, merged speech spans."""
    global _vad
    if _vad is None:
        _vad = SileroVoiceActivityDetector()
    _vad.reset()

    frame_ms = FRAME_SAMPLES * 1000 // SAMPLE_RATE
    speech_frames: list[bool] = []
    for i in range(0, len(pcm) - FRAME_SAMPLES + 1, FRAME_SAMPLES):
        prob = _vad(pcm[i : i + FRAME_SAMPLES].tobytes())
        speech_frames.append(prob >= SPEECH_THRESHOLD)

    # frame flags -> raw [start_ms, end_ms) runs
    runs: list[list[int]] = []
    for idx, is_speech in enumerate(speech_frames):
        if not is_speech:
            continue
        t = idx * frame_ms
        if runs and t - runs[-1][1] <= MERGE_GAP_MS:
            runs[-1][1] = t + frame_ms
        else:
            runs.append([t, t + frame_ms])

    total_ms = len(pcm) * 1000 // SAMPLE_RATE
    spans: list[SpeechSpan] = []
    for start, end in runs:
        start = max(0, start - PAD_MS)
        end = min(total_ms, end + PAD_MS)
        if spans and start <= spans[-1].end_ms:  # padding may re-join neighbours
            spans[-1].end_ms = end
            spans[-1].audio = pcm[spans[-1].start_ms * SAMPLE_RATE // 1000 : end * SAMPLE_RATE // 1000]
            continue
        spans.append(SpeechSpan(start, end, pcm[start * SAMPLE_RATE // 1000 : end * SAMPLE_RATE // 1000]))
    return spans
