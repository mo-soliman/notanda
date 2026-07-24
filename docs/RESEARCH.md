# Arabic-First Meeting Notes App — Research & Recommendations

*Research date: July 24, 2026. Synthesized from four deep-research tracks: the ASR model, desktop stack, backend architecture, and market/pricing. All pricing and benchmark figures were pulled from primary sources (linked throughout) in July 2026.*

---

## 0. Executive summary

- **Your model pick is validated.** Cohere Transcribe Arabic (`CohereLabs/cohere-transcribe-arabic-07-2026`) is the #1 open-source Arabic ASR model: 25.87 avg WER vs 36.86 for Whisper large-v3, Apache 2.0, 2B params, covers Gulf/Najdi/Hijazi/Egyptian/Levantine/Maghrebi dialects and Arabic-English code-switching. Preferred over Whisper in 95.8% of human evals.
- **Your market thesis is validated.** Otter and Granola have *zero* Arabic support. Tools claiming "100+ languages" ride Whisper-class models that hit 35–72% WER on conversational dialectal Arabic. But you have regional competitors already (Maglis, Notah, Mudawin) — the wedge is open, not empty.
- **CPU inference works** (your preference): quantized GGUF/ONNX ports exist; a ~$30–50/mo Hetzner CPU box handles ~1,000–2,000 audio-hours/month. At higher volume, serverless GPU (L4) becomes 5–20× cheaper per audio-hour — plan CPU for MVP, GPU for scale.
- **Desktop stack: Electron.** Granola itself is Electron; the hardest problem (system-audio capture without a bot) has an off-the-shelf Electron module; Arabic RTL is trivial in Chromium. Two MIT-licensed open-source Granola clones (Meetily, Anarlog) exist to study.
- **Backend MVP: chunked near-real-time, not streaming.** Granola's "magic" (notes) is a post-meeting batch job — only the transcript is live. 30–60s HTTPS chunk uploads give a live-feeling transcript with no WebSocket complexity.
- **Pricing: per-seat, freemium.** Free = 5 meetings/month; Pro ≈ $15/user/mo; Business ≈ $28; Enterprise custom with **KSA/UAE data residency + on-prem** as the moat US incumbents structurally can't match. COGS ≈ $0.04–0.12/audio-hour → 80–93% gross margin.

---

## 1. The model: Cohere Transcribe Arabic

**Identity (confirmed).** Official name: Cohere Transcribe Arabic.
[HF model card](https://huggingface.co/CohereLabs/cohere-transcribe-arabic-07-2026) · [Cohere blog](https://cohere.com/blog/transcribe-arabic) · [HF release post](https://huggingface.co/blog/CohereLabs/cohere-transcribe-arabic-07-2026-release) · [docs](https://docs.cohere.com/docs/transcribe-arabic) · [live demo](https://huggingface.co/spaces/CohereLabs/cohere-transcribe-arabic-07-2026)

| Attribute | Value |
|---|---|
| License | Apache 2.0 (commercial use + derivatives OK) |
| Released | July 7, 2026 |
| Size | 2B params, BF16 weights ~4.1 GB |
| Architecture | **Not Whisper** — FastConformer encoder + autoregressive Transformer decoder, 16 kHz log-Mel input. Fine-tuned from `CohereLabs/cohere-transcribe-03-2026` (14-language base, #1 on Open ASR Leaderboard) |
| Serving | Native `transformers` class (`CohereAsrForConditionalGeneration`); `vllm serve --trust-remote-code` for batched GPU |

**Benchmarks** (Open Universal Arabic ASR Leaderboard, avg WER, lower = better):

| Model | Avg WER |
|---|---|
| **Cohere Transcribe Arabic** | **25.87** |
| Meta OmniASR-LLM-7B | 28.32 |
| Whisper large-v3 | 36.86 |

Per-dialect: Hijazi 16.24, Egyptian 19.16, code-switched Ar-En 27.84, Levantine 39.78 (weakest — a fine-tuning opportunity). Common Voice Arabic 5.82 vs Whisper's 17.83; Casablanca (hard conversational dialect) 49.7 vs 71.8.

**Gaps you must engineer around** (confirmed by Cohere staff in [discussion #1](https://huggingface.co/CohereLabs/cohere-transcribe-arabic-07-2026/discussions/1)):
- **No timestamps** → derive segment times from your VAD/chunk boundaries; forced alignment (CrispASR's aligner, ctc-forced-aligner) for word-level.
- **No diarization** → pyannote.audio 3.1 as a parallel pass (~1× real time on a few CPU cores; budget +20–50% on top of CPU ASR cost). Note: Granola-style capture gives you mic vs system-audio as *two separate tracks* = free two-party speaker attribution before any diarization.
- **No language auto-detect** → you pass `language="ar"` or `"en"` (the "matrix" language for code-switching).
- **No streaming API** → chunked processing (30 s chunks; built into the transformers pipeline). Long unchunked audio degrades and can OOM — always chunk.
- **Hallucinates on non-speech** → put silero-vad in front; also cuts compute 30–50% (meetings are heavily silence).

**Fine-tuning** (future differentiation): standard Seq2SeqTrainer + LoRA works; LoRA on 24 GB GPU, full fine-tune on one 80 GB GPU. A Moroccan Darija LoRA already exists ([amzilmustapha/cohere-darija-lora-10-7-26](https://huggingface.co/amzilmustapha/cohere-darija-lora-10-7-26)). Practitioner reports suggest full-parameter tuning beats LoRA for serious dialect gains. Levantine (39.78 WER) is the obvious first target.

---

## 2. Your CPU question: yes, viable — here's the honest math

Because it's **not Whisper-based, whisper.cpp and faster-whisper do NOT work.** The ecosystem that formed instead:

| Path | What | Sizes |
|---|---|---|
| **GGUF + [CrispASR](https://github.com/CrispStrobe/CrispASR)** | whisper.cpp-style C++/ggml runtime for this exact architecture (CPU/Metal/CUDA/Vulkan) | [Quants](https://huggingface.co/cstr/cohere-transcribe-arabic-07-2026-GGUF): F16 4.1 GB, Q8_0 2.4 GB, **Q4_K 1.5 GB** (Arabic imatrix-calibrated) |
| **ONNX** | [Masterx export](https://huggingface.co/Masterx/cohere-transcribe-arabic-07-2026-ONNX), fp32/int8/q4, ~16 ms/token on ONNX Runtime CPU | int8 decoder ~1–2 GB |
| INT8 bitsandbytes | [NAMAA-Space](https://huggingface.co/NAMAA-Space/cohere-transcribe-arabic-07-2026-int8) — **CUDA-only**, but proves quantization costs just +0.46 WER | — |
| sherpa-onnx | Supports the *base* model; Arabic variant unconfirmed but same architecture | — |

**Measured speed:** Q4 GGUF on a cheap 4-vCPU AVX2 VPS ≈ **1.4× real time** (~1.7 GB RAM). Extrapolated: 16 vCPUs ≈ 3–6× single-stream, ~5–8× aggregate with 4 workers × 4 threads. *(Extrapolation from one datapoint — run a 1-day benchmark on target hardware before committing.)*

**Cost per audio-hour:**

| Option | $/audio-hour | Notes |
|---|---|---|
| Hetzner 4–8 vCPU (~$0.03–0.12/hr) | **~$0.02–0.05** | A ~$30/mo box ≈ 1,000–2,000 audio-hrs/month. No cold starts, flat cost |
| AWS c7i.4xlarge (16 vCPU, $0.71/hr) | ~$0.14 | AWS is the expensive way to buy CPU |
| Serverless GPU L4 (Modal $0.80/hr, RunPod $0.69) | **~$0.005–0.015** | Batched vLLM; scale-to-zero; ~2 s cold-restore with Modal GPU snapshots |
| Commercial STT APIs | ~$0.36+ | Your floor to beat — you're 10–70× cheaper self-hosting |

**Recommendation:** start on a **Hetzner CPU box** (flat ~$30–50/mo, zero cold-start engineering, matches your preference, plenty for hundreds of users) and design the worker so the inference backend is swappable. When sustained volume makes utilization matter, move the same worker to **Modal/RunPod L4 + vLLM** — at scale, GPU is 5–20× cheaper per audio-hour, not more expensive.

---

## 3. Desktop app (first-timer, Windows + Mac)

**Stack: Electron + TypeScript/React.** Granola itself is Electron ([their job posting](https://www.granola.ai/jobs/electron) describes exactly your app: "Electron app with deep OS integrations including system audio capture"). Chromium gives you best-in-class Arabic RTL/bidi for free, mature tray/background/auto-update, and — decisively — the only off-the-shelf solution to the hardest problem:

**System audio capture (no bot) — the make-or-break feature:**
- **v1, both OSes:** [`electron-audio-loopback`](https://github.com/alectrocute/electron-audio-loopback) — driverless loopback `MediaStream` on macOS 12.3+/Windows 10+ via Chromium's built-in flags. No BlackHole, no virtual drivers.
- **v2, macOS:** graduate to **Core Audio process taps** (macOS 14.4+, `CATapDescription` + `AudioHardwareCreateProcessTap`) via a bundled Swift helper — [audiotee](https://github.com/makeusabrew/audiotee) streams system audio to stdout with a Node wrapper; [AudioCap](https://github.com/insidegui/AudioCap) is the canonical sample. Why: it uses the "System Audio Recording Only" TCC permission instead of Screen Recording, escaping macOS 15's periodic re-authorization nags. Add `NSAudioCaptureUsageDescription` + `NSMicrophoneUsageDescription` to Info.plist.
- **v2, Windows:** per-process WASAPI loopback (`ActivateAudioInterfaceAsync` + `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`, Win 10 20348+) to capture only Zoom/Teams or exclude your own app's sounds. [MS sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/). Gotchas: `GetMixFormat` returns `E_NOTIMPL` (specify format yourself); no packets arrive during silence (handle gaps); no OS permission prompt exists for loopback.
- **Architecture rule:** keep **mic and loopback as two separate streams** — that's you vs. everyone else, i.e., free speaker attribution.

**Distribution (~$220/year total):**
- macOS: Apple Developer Program $99/yr → Developer ID cert → hardened runtime → notarize (`notarytool`, automated by electron-builder) → DMG + ZIP. Keep signing identity stable — TCC permission grants are keyed to it.
- Windows: **Azure Trusted Signing ~$9.99/mo** — do *not* buy an EV cert; EV's instant SmartScreen bypass was removed in 2024. Expect SmartScreen warnings for the first days/weeks while reputation accrues.
- Auto-update: electron-updater over GitHub Releases or S3.

**Study/fork these (MIT):** [Meetily](https://github.com/Zackriya-Solutions/meetily) (closest full clone — Tauri, mic+system audio, local whisper), [Anarlog](https://github.com/fastrepl/anarlog) (polished local-first Granola alt), [Vibe](https://github.com/thewh1teagle/vibe) (model-download UX precedent), [screenpipe](https://github.com/screenpipe/screenpipe) (production 24/7 capture). If you'd rather buy than build capture: [Recall.ai Desktop SDK](https://www.recall.ai/blog/how-to-build-a-desktop-recording-app).

**Runner-up:** Tauri 2 — only if you want to learn Rust; the best clones are Tauri and forkable, but you'd write the capture layer in Rust yourself (cpal has no loopback yet) and its updater ecosystem is younger. **Avoid:** Flutter (loopback capture is a known gap), dual-native Swift+WinUI (two codebases, solo dev).

---

## 4. Backend architecture

**Key insight from how Granola actually works:** it captures on-device (no bot), streams to Deepgram/AssemblyAI for the live transcript, then generates notes **post-meeting** with an LLM over (user's rough notes + transcript), and **deletes audio immediately after transcription** ([security FAQ](https://docs.granola.ai/help-center/consent-security-privacy/security-privacy-data-faqs)). The product magic is a batch job; the live transcript is UX sugar.

**MVP: chunked near-real-time** — desktop app uploads 30–60 s Opus chunks (32 kbps ≈ 14 MB/audio-hr) over plain HTTPS during the meeting; each chunk transcribes on arrival; transcript appears in-app within ~10–30 s; meeting end triggers one cleanup + summary pass. No WebSockets, no session affinity, same code path as batch, clean upgrade to true streaming later (Voxtral Realtime, Apache 2.0, Arabic, sub-200 ms — [Mistral](https://mistral.ai/news/voxtral-transcribe-2/)).

```
Desktop app (Electron; mic + loopback tracks; local ring buffer)
   │  HTTPS presigned-URL chunk uploads (Opus 32 kbps)
   ▼
Cloudflare R2 / S3  "audio-inbox/"  (lifecycle: delete after 24 h)
   │  event → queue (SQS / Postgres jobs table — skip Temporal at MVP)
   ▼
Transcription worker (Hetzner CPU: CrispASR Q4 GGUF │ later: Modal L4 + vLLM)
   silero-VAD → 30 s chunks → Cohere Transcribe Arabic → segments → delete audio
   ▼
Postgres (Supabase/Neon): users, meetings, transcript_segments, summaries, jobs
   │  on meeting_end
   ▼
Summary worker (CPU): full transcript → LLM → structured notes + action items (JSON)
   ▼
Client: poll every 5–10 s during meeting (SSE later)
```

- **Auth:** Clerk (fastest) or Supabase Auth (bundles Postgres/storage/realtime — good all-in-one for bootstrapped). Defer SSO/SAML until enterprise deals.
- **API:** one FastAPI/Node service on Fly.io/Railway. Issues presigned URLs, serves transcripts, receives meeting events.
- **Summarization LLM:** frontier models beat Arabic-focused models (Jais/Fanar/ALLaM) on Arabic instruction-following ([aiXplain benchmark](https://aixplain.com/wp-content/uploads/2025/05/aiXplain-Arabic-Benchmark-Report-May-2025-v2.1.pdf)). Per-meeting cost is noise: Gemini 2.5 Flash ~$0.004, Claude Haiku 4.5 ~$0.02, Claude Sonnet ~$0.06 — **pick on Arabic output quality, not price.** Budget ~12–18k input tokens (Arabic tokenizes heavier). Keep the interface pluggable: "summaries by Saudi national model ALLaM, in-Kingdom" is an enterprise sales line, not a quality upgrade.
- **COGS ≈ $0.04–0.12/audio-hour** all-in (ASR + summary + diarization + storage + bandwidth). At $15/seat and 20 meeting-hrs/user/mo → COGS $1–3/user → **80–93% gross margin**. Fixed floor ~$50–100/mo.

**Gulf data residency — your enterprise wedge:**
- Saudi PDPL (enforced since Sept 2024) effectively requires in-Kingdom processing for government/regulated sectors; UAE PDPL + DIFC/ADGM regimes push financial clients the same way.
- In-region compute exists for your workload: AWS me-central-1 (UAE), Azure UAE North, **GCP me-central2 (Dammam — in-Kingdom)**; L4/A10-class is placeable there, and a 2B model even runs on modest cards.
- Day-one posture (free to adopt, sells later): **audio deleted on transcription** (24 h lifecycle backstop), transcripts encrypted per-org, region pinning as a paid tier, on-prem package as the enterprise wedge. Your Apache 2.0 self-hostable model makes offers (SaaS-in-region / single-tenant / full on-prem) that Deepgram-dependent competitors structurally cannot match.

**Build order:** (1) Weeks 1–4: Clerk + FastAPI + Supabase + R2 + CPU worker + Claude Haiku summaries, chunked uploads. (2) Next: pyannote diarization, forced alignment, structured action items, SSE. (3) At traction: warm GPU baseload, Temporal, pgvector "ask your meetings" search. (4) Enterprise: Gulf region cell, customer-managed keys, ALLaM option, on-prem.

---

## 5. Market & pricing

**The gap is real:**
- Otter: Arabic **not supported at all** ([language list](https://help.otter.ai/hc/en-us/articles/360047247414-Supported-languages)). Granola: no Arabic, waitlist only ([docs](https://docs.granola.ai/help-center/customising-granola/multi-language)). Krisp: no Arabic.
- Fireflies/Read/Circleback "support" Arabic via Whisper-class models → 35–72% WER on conversational dialect; code-switching (ubiquitous in Gulf business) is a named failure mode.

**But the niche is not empty:**
| Competitor | Position | Weakness to exploit |
|---|---|---|
| [Maglis](https://www.maglis.ai/) | Usage-based ($15/mo for 35 hrs + overage) | No free tier; Frankfurt-only hosting; usage anxiety |
| [Notah](https://www.notah.ai/about) | Saudi-dialect claims, PDPL residency, aggressive SEO vs Otter/Granola | Hidden pricing; unproven product polish |
| [Mudawin](https://www.mudawin.ai/) | Backed by Master Works (large Saudi AI firm) | Enterprise/gov GTM — not playing the prosumer/self-serve flank |

Nobody owns the polished per-seat freemium Granola-style wedge. **Move fast there.**

**Price anchors** (July 2026, annual): Granola Business $14 / Enterprise $35; Otter Pro $8.33 (minutes-capped); Fireflies Pro $10 / Business $19; Fathom Premium $16; Read Pro $15. Entry paid clusters $8–16; business $19–29.

**Recommended structure — per-seat unlimited, not usage-based** (your COGS makes usage metering unnecessary; usage anxiety kills the record-everything habit loop):

| Tier | Price (annual) | Contents |
|---|---|---|
| **Free** | $0 | **5 meetings/mo** (≤90 min each), full-quality dialect transcription + bilingual Ar/En notes, shareable branded note links, 30-day history. *Job: let a Gulf professional hear the difference on a real Najdi/Emirati meeting. Never gate quality — that's the demo. Cost ≤ ~$0.50/free user/mo* |
| **Pro** | **$15/user/mo** (SAR 56 / AED 55; $19 monthly) | Unlimited meetings & history, code-switch handling, dialect-aware summaries, templates incl. formal محضر اجتماع, calendar + Zoom/Teams/Meet | 
| **Business** | **$28/user/mo** (SAR 105 / AED 103; $35 monthly) | Teams, shared folders, CRM/Slack, admin console, SSO, retention policies, Arabic-speaking priority support |
| **Enterprise/Gov** | Custom (anchor $45–60, annual invoice) | SCIM, audit logs, **KSA/UAE residency + on-prem**, PDPL DPA, custom dialect fine-tuning, SLA, local SI delivery. *Price as a compliance product, not a note-taker* |

Supporting moves: publish SAR/AED price lists (VAT-inclusive); ~25% annual discount; volume discounts at 100+/500+ seats; **Mada payment rails for KSA** (USD cross-border card declines are a known GCC conversion killer); launch comparison pages with side-by-side "Otter/Granola on Arabic = garbled" demos. Plan on ~3% free→paid conversion for self-serve; Gulf revenue will skew sales-assisted (self-serve to ~AED 50k ARR, contracts above).

---

## 6. Risks

1. **ASR commoditization** — Cohere's Apache 2.0 release means anyone can self-host great Arabic ASR. The moat is the product layer (workflow, dialect-tuned summarization, RTL UX, bilingual minutes), residency, and dialect fine-tunes — not the model.
2. **Mudawin's distribution** — Master Works backing = Saudi enterprise reach. Don't fight there first; win prosumer/self-serve.
3. **CPU throughput extrapolations** — the 16-vCPU numbers are extrapolated from one 4-vCPU datapoint. **Do a 1-day benchmark** (Hetzner CCX vs Modal L4, real meeting audio with code-switching) before committing.
4. **Levantine WER (39.78)** — weakest dialect; fine-tuning target, but also a quality risk if you market "Arabic" broadly.
5. **macOS 15 screen-recording nags** — solved by the Core Audio process-tap path; prioritize it right after v1.
6. Market-size figures from GulfSaasReview are directional — verify independently before putting them in an investor deck.

*(Quantization availability and the Granola product teardown are covered in `RESEARCH-2-granola-and-quantization.md`.)*

## 7. ASR API pricing vs self-hosting (retrieved July 24, 2026)

$/audio-hour, from primary pricing pages:

| Provider | Batch | Streaming | Arabic notes |
|---|---|---|---|
| **Cohere Transcribe Arabic (hosted API)** | **$0 — free, rate-limited** | not offered | The Arabic finetune IS served via API, but trial keys = 5 req/min, no published production price ("contact sales"), no SLA, no streaming/timestamps/diarization. Benchmarking tool, not a production path |
| **Deepgram Nova-3 Arabic** (monolingual rate) | $0.462 | **$0.288** | Dedicated Arabic model, 17 dialect codes, claims ~40% WER edge vs API competitors; per-second billing; **$200 free credit ≈ 430 hrs** |
| **AssemblyAI** | $0.21 (Universal) | $0.45 (only U3.5 Pro Realtime does Arabic; the $0.15 streaming tier is EU-languages-only) | Streaming bills on **WebSocket-open duration**, not audio sent — don't hold sockets open |
| Speechmatics | from $0.129 | higher | Long-standing Arabic + bilingual Ar-En; 50 free hrs/month recurring |
| Azure / Google batch | $0.18 | $1.00 / $0.96 | Google V1 rounds each request up to 15 s — avoid for chunks; V2/dynamic batch OK |
| OpenAI gpt-4o-transcribe | ~$0.36 | ~$1.02 (Realtime) | mini variant ~$0.18 |
| **Self-host (our plan)** | **~$0.02–0.05 (CPU box) / ~$0.005–0.015 (serverless L4)** | pseudo-streaming via chunks | Plus flat ~$40/mo CPU box; break-even vs APIs at ~140–190 audio-hrs/month |

Takeaways: (1) Cohere's API is free but unusable in production (rate caps, no price, no SLA) — use it to benchmark quality against our self-hosted quantized versions. (2) APIs cost $0.21–0.46/hr for Arabic vs ~$0.03/hr self-hosted CPU — at 20 meeting-hrs/user/month that's $4–6/user/month API COGS (27–40% of a $15 Pro seat) vs <$1 self-hosted. (3) Free credits (Deepgram $200 ≈ 430 hrs, AssemblyAI $50, Speechmatics 50 hrs/mo) cover the entire MVP validation phase at $0. (4) Only Deepgram offers Arabic streaming at a sane price ($0.288/hr) — a viable stopgap for live-transcript UX before self-hosted pseudo-streaming is tuned.

## 8. Suggested first three milestones

1. **Model validation (1–2 days):** rent a Hetzner box + a Modal L4; run Cohere Transcribe Arabic (Q4 GGUF via CrispASR, and BF16 via transformers) on 5 real recorded meetings (Gulf dialect + code-switching); measure WER-ish quality, RTF, and cost. This de-risks the whole plan.
2. **Capture prototype (1 week):** Electron + `electron-audio-loopback` + mic capture → two Opus tracks on disk → chunk-upload to a bucket. If this works on your Mac and a Windows machine, the hardest desktop problem is behind you.
3. **End-to-end MVP (3–4 weeks):** wire the pipeline above with Supabase + one CPU worker + Claude Haiku summaries and use it for your own meetings daily before showing anyone.
