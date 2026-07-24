# Research Part 2 — Quantized Model Ports & Granola Product Teardown

*Research date: July 24, 2026. Companion to `RESEARCH.md`. Two questions answered here: (1) has anyone quantized Cohere Transcribe Arabic, and (2) what exactly does Granola do — features, UX, pricing — and does it expose the full transcript?*

---

## Part A — Quantized ports of `CohereLabs/cohere-transcribe-arabic-07-2026`

**Answer: yes — 9 quantized/ported repos exist** (the complete model tree was verified, so this list is exhaustive as of July 24, 2026). Because the model is a FastConformer encoder + Transformer decoder — *not* Whisper — whisper.cpp and faster-whisper don't apply; the ecosystem standardized on two ggml-based runtimes instead (transcribe.cpp and CrispASR).

### All ports, verified individually

| Repo | Format | Quants & sizes | Runtime target | Downloads/mo | Quality evidence |
|---|---|---|---|---|---|
| ⭐ [handy-computer/cohere-transcribe-arabic-07-2026-gguf](https://huggingface.co/handy-computer/cohere-transcribe-arabic-07-2026-gguf) | GGUF | BF16 4.10 GB, F16 4.11, Q8_0 2.41, Q6_K 1.97, Q5_K_M 1.77, Q4_K_M 1.56 GB | [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) — CPU/Metal/CUDA/Vulkan | 345 | **Best evidence of any port**: FLEURS Arabic test (428 utterances); BF16 baseline 11.00% WER, every quant level within the 95% confidence interval (Q5_K_M actually 10.95%) |
| [cstr/cohere-transcribe-arabic-07-2026-GGUF](https://huggingface.co/cstr/cohere-transcribe-arabic-07-2026-GGUF) | GGUF (LayerNorms kept F32) | F16 4.1, Q8_0 2.4, Q4_K 1.5, **Q4_K + Arabic imatrix 1.5 GB** | [CrispASR](https://github.com/CrispStrobe/CrispASR) — CPU/Metal/CUDA/Vulkan | 698 | Only **Arabic-calibrated** quantization (imatrix on Common Voice Arabic); M1 Metal ~1.5 s for an 11 s clip |
| [NAMAA-Space/...-int8](https://huggingface.co/NAMAA-Space/cohere-transcribe-arabic-07-2026-int8) | bitsandbytes LLM.int8() | 2.35 GB | transformers, **CUDA GPU only**; explicitly not vLLM-servable | 180 | **Best dialect evidence**: 1,009 Saudi-podcast clips — bit-identical 17.5% WER vs full model ("effectively lossless") |
| [NAMAA-Space/...-int4](https://huggingface.co/NAMAA-Space/cohere-transcribe-arabic-07-2026-int4) | bitsandbytes NF4 + double quant | 1.47 GB | transformers, **CUDA GPU only** | 1,097 | +0.1 WER points vs full model on the same Saudi-podcast set |
| [Masterx/...-ONNX](https://huggingface.co/Masterx/cohere-transcribe-arabic-07-2026-ONNX) | ONNX fp32 / Q4 / INT8-decoder (hand-optimized export — stock optimum can't export this arch) | ~1–4 GB | onnxruntime, tuned for **DirectML / Windows GPU**: 3.5 ms/token on RTX 3080 Ti vs ~16 ms/token on CPU EP | 291 | Bit-exact fp32/q4 parity vs PyTorch on CPU |
| [majentik/...-MLX-8bit](https://huggingface.co/majentik/cohere-transcribe-arabic-07-2026-MLX-8bit) / 6bit / 4bit | MLX | 2.4 / 2.0 / 1.5 GB | Custom `cohere_asr_mlx` harness (not mlx-lm compatible); 35 s clip limit | 66–109 | Smoke tests only (2 clips) |
| [MarkChen1214/...-MLX-Mixed-2bit3bit4bit](https://huggingface.co/MarkChen1214/cohere-transcribe-arabic-07-2026-MLX-Mixed-2bit3bit4bit) | MLX mixed 2/3/4-bit | ~0.2B size class | MLX | 205 | None seen |

**Not found anywhere:** AWQ, GPTQ, or FP8 of the Arabic variant. **sherpa-onnx** (otherwise the strongest production CPU stack — websocket server, bindings in 12 languages) only ships the *base* 14-language int8 model (`sherpa-onnx-cohere-transcribe-14-lang-int8-2026-04-01`); nobody has converted the Arabic-specialized variant — an open gap someone (possibly you) could fill.

### Base-model ecosystem (shared architecture — useful signals)
- [handy-computer/cohere-transcribe-03-2026-gguf](https://huggingface.co/handy-computer/cohere-transcribe-03-2026-gguf): **764k downloads/month** — the de-facto standard artifact; LibriSpeech WER ~1.25–1.27% across all quant levels.
- [OpenASR pack](https://huggingface.co/OpenASR/cohere-transcribe-03-2026): q8_0 runs at **RTF 0.25–0.32× on an M1 CPU** (3–4× faster than real time) — the best CPU speed datapoint for this architecture. No Arabic pack yet.

### Runtimes
- **transcribe.cpp** ([GitHub](https://github.com/handy-computer/transcribe.cpp)): ggml-based, 16 model families, 1.6k stars, MIT, backed by Mozilla AI / Hugging Face / Modal. Python/TypeScript/Rust/Swift bindings. No built-in HTTP server — wrap a binding in your own FastAPI service.
- **CrispASR** ([GitHub](https://github.com/CrispStrobe/CrispASR)): C++, 43 ASR backends, 474 stars, very active, MIT. ~2–3× real time on CPU for this model. Caveat: O(N²) encoder attention — keep single-pass audio under ~10 min; always chunk.
- **vLLM**: official route for the *unquantized* model on GPU only. **MLX**: treat as experimental — open unresolved bug of repetition loops / language misidentification on M1 ([discussion #2](https://huggingface.co/CohereLabs/cohere-transcribe-arabic-07-2026/discussions/2)).

### Community-reported model issue (applies to every port)
[Discussion #4](https://huggingface.co/CohereLabs/cohere-transcribe-arabic-07-2026/discussions/4): on silence/noise the model hallucinates subtitle-credit boilerplate and invented dialogue at ~0.95 mean token probability — **log-prob filtering cannot catch it** — and emits undocumented `@@@ضوضاء`/`@@@فراغ` tags. No CohereLabs response yet. Consequence: **silero-VAD preprocessing is mandatory** in the pipeline, regardless of quantization.

### Bottom line for CPU cloud serving
1. **Pick: handy-computer Q8_0 (2.41 GB) on transcribe.cpp** — only WER-validated Arabic port, most mature runtime.
2. **RAM-bound alternative: cstr Q4_K-imatrix (1.5 GB) on CrispASR** — only Arabic-calibrated quant.
3. Expected CPU speed ~2–4× real time per core-set (inferred from sibling runtimes — benchmark on target hardware before committing).

---

## Part B — Granola teardown (current as of July 2026)

### B1. The transcript question — answered precisely

**Granola keeps the full verbatim transcript of every meeting, readable and searchable, but deliberately de-emphasized.** One click — a waveform-bars icon left of the "Ask anything" chat bar — opens the transcript side panel ([docs](https://docs.granola.ai/help-center/taking-notes/transcription)). The notes are the product; the transcript is treated as raw material. Details:

- **Evidence tracing (the feature to copy):** every AI-generated bullet in enhanced notes has a magnifying-glass icon that traces it back to the source transcript passage or the user's own raw note ([docs](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes.md)).
- **Speaker attribution is by audio channel, not name:** grey bubbles = system audio (others), green = your mic. Named speakers only on **Zoom-macOS and Google Meet** ([docs](https://docs.granola.ai/help-center/taking-notes/speaker-attribution.md)); multi-party calls render confusingly — a top reviewer complaint ([tl;dv review](https://tldv.io/blog/granola-review/)).
- **No export:** copy-paste only — no PDF/Markdown/DOCX/JSON ([teardown](https://meetingnotes.com/blog/granola-ai-teardown)). Community reverse-engineering exporters (granary, granola-cli) were killed when Granola encrypted its local database; the backlash forced an official REST API + webhooks + MCP connector.
- **No audio, ever:** audio streams to the ASR provider (AssemblyAI, per their own [security post-mortem](https://docs.granola.ai/help-center/policies/security-reports/post-mortem-assembly-ai-api-key-exposure.md)) and is discarded — so **there is no playback to verify transcript errors**.
- **Retention:** transcripts kept indefinitely by default; user-configurable auto-deletion (1 day → 1 year); Enterprise admins can set org-wide policies. Deleting the transcript keeps the notes but degrades chat/regeneration ([docs](https://docs.granola.ai/help-center/consent-security-privacy/transcript-auto-deletion.md)). Transcripts are **not editable** — explicitly declined ([feature requests](https://docs.granola.ai/help-center/feature-requests.md)).
- **Free tier:** only the last **30 days** of notes are accessible; older notes stay stored but locked until upgrade.

### B2. Feature inventory

- **Capture:** botless, via local system audio + mic; works with any meeting app (Zoom, Meet, Teams, Webex, Slack Huddles, browser). Platform timeline: macOS May 2024 → iOS May 2025 → Windows June 2025 → Android July 2025 → Watch/Vision Pro 2026. **Mobile cannot capture video-call audio** (OS restriction) — it covers in-person meetings and phone calls only.
- **The signature "enhance" flow:** during the meeting you type rough jots in a minimal notepad; afterward Granola merges (a) transcript, (b) your notes, (c) calendar context into structured notes — **your own words stay visually distinct (black highlight)** and steer what the AI expands. Regenerate with different templates, refine via chat, or edit and re-enhance. The key design decision from their stealth year: **post-meeting generation, not live AI**, so users stay present.
- **Templates & recipes:** ~40 prebuilt + custom templates with per-section instructions; reusable custom prompts; power users cover "95% of their calendar" with template libraries.
- **Pre-meeting briefs:** auto-generated participant context + prior-discussion history from calendar.
- **AI chat (Cmd+J):** within one meeting or across all meetings ("What did I promise this week?"); generates Slack updates, CRM entries, follow-up emails.
- **Teams:** workspaces, spaces/folders with access controls, user groups, note transfer.
- **Integrations:** Google Calendar (+ Microsoft/Outlook/Teams since Jan 2026), Slack, Notion, Zapier, HubSpot, Attio, Affinity (no Salesforce). REST API + webhooks + **MCP connector** to Claude/ChatGPT/Cursor/etc. (Business+). Complaint: integrations link back to Granola rather than exporting content; everything is manual per-note.
- **Languages:** 10 on desktop (En, Fr, De, Es, It, Pt, Nl, Ja, Ru, Hi) — **no Arabic** (waitlist only); non-English quality panned in reviews ("gibberish" Russian test).
- **No offline mode:** audio must stream out to the ASR provider.

### B3. UX teardown

**Why it's beloved (copy these):**
1. "Notepad, not meeting bot" — no bot in the participant list; works where bots are banned; the *absence* became a marketing loop.
2. Calendar-first zero setup — open the app and every upcoming meeting is already there; one notification at meeting start is the only interruption.
3. The enhance moment — messy jots come back polished *with your words preserved*; the emotional core of the product.
4. Keyboard-first, minimal chrome; "by week two it becomes invisible."
5. Evidence tracing (magnifying glass) builds trust in summaries.

**Known complaints (improve on these):** onboarding cliff (no sample-meeting demo — value waits for your next real meeting); no export; no named speakers on most platforms; no audio playback; weak non-English; manual everything (templates, sharing, integrations); no automatic action items ("a massive miss"); Feb 2026 rebrand backlash; and the **April–May 2026 privacy scandal** — "private by default" notes were link-accessible to anyone with the URL by default, and notes were used for model training unless opted out ([coverage](https://www.techbuzz.ai/articles/granola-s-private-ai-notes-are-public-by-default)). Also: Granola never announces itself to other participants — consent burden is pushed entirely onto the user (two-party-consent legal exposure flagged by Forbes).

### B4. Pricing strategy

**Current tiers** ([pricing page](https://www.granola.ai/pricing), fetched July 2026):

| Tier | Price | Contents |
|---|---|---|
| Basic (Free) | $0 | AI notes, chat, shared folders, templates, multi-language; **only last 30 days of notes accessible** (older notes stored but locked) |
| Business | **$14/user/mo** | Unlimited history, advanced models, all integrations, API + MCP, centralized billing |
| Enterprise | **from $35/user/mo** | SSO, admin controls, org-wide retention policies, team training opt-out, priority support |

Monthly-only billing; per-workspace seats with proration.

**Evolution:** launch (2024) = 25 free meetings then $10/mo (later ~$18) individual plan → **Feb 2026**: individual plan killed; free tier redefined as unlimited notes with a 30-day rolling access window — history accumulates *behind* the paywall as the upgrade driver. Business was deliberately priced **below** the old personal plan to force team expansion (individual champions pull in whole workspaces). Free 12-month Business for students and startups; referral/affiliate programs.

**Growth & funding:** zero paid acquisition — VC-seeded word-of-mouth (~10% weekly growth; 57% of early users in leadership roles); shared note links are the viral loop. Founded Nov 2022 (London) by Chris Pedregal & Sam Stephenson; **$192M raised total; $125M Series C at $1.5B valuation, March 2026** (Index, Kleiner Perkins, Lightspeed, Spark, NFDG); revenue +250% in the quarter before the round. Enterprise logos: Vanta, Gusto, Asana, Cursor, Figma, Ramp, Vercel, Linear.

### B5. Strategic read — where a competitor wins

Granola's explicit refusals and wounds are the attack surface:

1. **Transcript as a first-class citizen:** named diarization everywhere, editable transcripts, optional retained audio playback, real export (MD/PDF/JSON) — each one is a documented Granola gap or refusal.
2. **Trust:** genuinely private-by-default sharing, no training on customer content, honest free-tier disclosure — attack the April 2026 wound.
3. **Automation:** auto-routing by meeting type, automatic action items, real two-way integrations.
4. **Arabic:** entirely absent from Granola (waitlist). For Arabic meetings specifically, transcript-verifiability matters *more* — users initially trust AI notes less in a language where incumbents are known to fail, so a named, searchable, exportable transcript is a bigger differentiator than in English.

**Copy without shame:** post-meeting enhancement, preserved user words, calendar-first zero setup, evidence tracing, templates as first-class objects, cross-meeting chat, no bot.
