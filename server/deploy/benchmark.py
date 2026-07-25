"""M0 benchmark: measures the exact production path (ffmpeg decode -> silero-VAD
-> transcribe.cpp) on this machine. Go/no-go gate for the Oracle ARM box.

    cd server && uv run python deploy/benchmark.py /path/to/real-arabic-meeting.m4a

Use a REAL meeting recording (Gulf dialect + code-switching), not clean read
speech. Interpretation: RTF <= 0.9 GO | 0.9-1.5 try Q4_K_M | > 1.5 escalate.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from notanda_server import asr, audio, settings  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    audio_file = Path(sys.argv[1])

    print(f"backend={settings.ASR_BACKEND}  model={settings.MODEL_PATH}  threads={settings.TRANSCRIBE_THREADS}")

    t0 = time.perf_counter()
    pcm = audio.decode_to_pcm(audio_file.read_bytes())
    decode_s = time.perf_counter() - t0
    audio_s = len(pcm) / audio.SAMPLE_RATE

    t0 = time.perf_counter()
    spans = audio.find_speech(pcm)
    vad_s = time.perf_counter() - t0
    speech_s = sum(s.end_ms - s.start_ms for s in spans) / 1000

    print(f"audio {audio_s:.0f}s | decode {decode_s:.1f}s | VAD {vad_s:.1f}s | "
          f"speech {speech_s:.0f}s in {len(spans)} spans ({speech_s / audio_s:.0%} of audio)")

    # One batched ASR process, exactly as the worker runs it per chunk.
    t0 = time.perf_counter()
    raw = asr.transcribe_batch([s.audio for s in spans])
    asr_s = time.perf_counter() - t0

    texts: list[str] = []
    for text in raw:
        texts.append(asr.clean(text, texts[-1] if texts else None))
    print(f"batched {len(spans)} spans in one process: {asr_s:.1f}s "
          f"({asr_s / max(speech_s, 0.1):.2f}x speech)")

    total_s = decode_s + vad_s + asr_s
    print(f"\nASR time {asr_s:.0f}s | pipeline total {total_s:.0f}s")
    print(f"post-VAD RTF (pipeline/audio): {total_s / audio_s:.2f}   <= 0.90 is GO")
    print(f"ASR-only RTF vs speech: {asr_s / max(speech_s, 0.1):.2f}")
    print("\n--- transcript (eyeball dialect quality) ---")
    print(" ".join(t for t in texts if t)[:1500])


if __name__ == "__main__":
    main()
