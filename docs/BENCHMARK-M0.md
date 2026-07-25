# M0 benchmark — Cohere Transcribe Arabic on the Oracle ARM box

**Verdict: GO.** Real-time factor is ~0.6 on the production path, well inside the ≤0.9 gate, on hardware that costs $0/month.

## Hardware

Oracle Cloud Always Free **Ampere A1**: 4 ARM OCPUs, 24 GB RAM, Ubuntu 24.04, 45 GB disk. Model: `cohere-transcribe-arabic-07-2026-Q8_0.gguf` (2.3 GB), transcribe.cpp built from source with NEON; no BLAS (`transcribe: no BLAS found — decoder uses scalar fallback`), 3 of 4 threads.

## Test material

5 minutes of **فنجان** (Fnjan) — a real Saudi podcast, dense conversational speech on a historical topic, taken 10:00–15:00 into episode 9327. This is genuine Gulf-dialect content, not read speech from a benchmark corpus.

## Results

| Path | Audio | Wall clock | RTF | Peak RSS |
|---|---|---|---|---|
| Single-pass CLI (whole 5 min at once) | 300 s | 6:17 | **1.26** | 7.7 GB |
| Batched short spans (production path) | 13 s in 2 spans | 10.0 s incl. 1.8 s model load | **~0.62** | — |

Per-span detail from the batch run: an 8 s span took 4.98 s (encode 4676 ms, decode 277 ms, mel 24 ms); a 5 s span took 3.04 s (encode 2856 ms, decode 172 ms). Encoding dominates; decoding is noise.

**Why the two rows differ so much.** The encoder's attention is quadratic in audio length, and a 300-second single pass also allocates a large KV cache — hence 7.7 GB resident and RTF 1.26. Production never does that: the client uploads 30-second chunks, VAD cuts each into a handful of short spans, and each span is encoded independently. The model itself reports `max audio: 400.0 s (context 1024 tok, ~32 MiB KV max)`, so 30 s chunks sit far inside the cheap regime.

VAD is not a bottleneck: silero processed the full 5 minutes in **1.9 s** and found 278 s of speech across 63 spans (93% of the audio — expected for a podcast; real meetings with silence will be lower, which only helps).

## Cost implication

At RTF ≈ 0.6 with 3 threads, one box transcribes roughly 1.6 hours of audio per wall-clock hour. Both meeting streams (mic + system) together contain about 1× the meeting's duration of actual speech after VAD, so the box handles **real-time transcription for a meeting with headroom to spare**, and the marginal cost of an audio-hour is **$0** until the free tier is outgrown. That compares with $0.21–0.46/hr for the third-party APIs surveyed in `RESEARCH.md` §7.

## Quality

Not formally scored (no reference transcript), but the output is coherent, correctly punctuated Modern Standard Arabic that matches the episode's actual content — a discussion of how Kufa was divided into sevenths by tribe:

> هؤلاء هم الذين فتحوا بلاد المشرق، هذه القبائل هي التي فتحت
> والى اخره سموهم اهل العاليه. كذلك الكوفه قسمت … الى اخماس … والكوفه قسمت اسباع حسب القبائل التي تسكن فيها

A real WER measurement against a hand-corrected reference is still worth doing before committing to marketing claims.

## Engineering findings

- **ggml symbol collision (important).** `pysilero-vad` bundles its own `libggml`, and in one process the dynamic linker hands that copy to `libtranscribe.so`, which then aborts inside the flash-attention kernel on a mask-padding assert. ASR therefore runs as a **subprocess** (`transcribe-cli --batch --batch-jsonl`), which also lets a whole chunk's spans share one ~1.8 s model load.
- `transcribe-cli` exposes `--timestamps segment|word`. Worth evaluating as a replacement for our VAD-derived coarse timing, which currently has 30-second-grid granularity.
- Build notes: `huggingface-cli` no longer exists (it's `hf`); transcribe.cpp needs `-DTRANSCRIBE_BUILD_SHARED=ON` and all `*.so` files shipped, not just `libtranscribe.so`; the image base must be `python:3.12-slim-trixie` because pysilero-vad's wheel needs GCC 13+ `libstdc++`.
