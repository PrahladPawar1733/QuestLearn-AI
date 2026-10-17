# Gemini model selection for QuestLearn AI

**Checked on 2026-10-17.** Everything below is either (a) measured against the live
Gemini Developer API with this repo's `GEMINI_API_KEY`, or (b) quoted from official
Google documentation with the URL. Anything I could not verify is called out in
[Caveats](#caveats) rather than guessed at.

## Method

1. `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=200` — 63 models
   returned. Metadata (version, token limits, `supportedGenerationMethods`) taken from that
   response, not from memory.
2. Official docs read on 2026-10-17: pricing, models, rate limits, structured output,
   thinking, caching, video understanding, Veo, speech generation, embeddings,
   image/document understanding, changelog, deprecations. URLs cited inline.
3. Three real workloads, scripted against the raw REST API with SSE streaming so that
   time-to-first-token is measurable separately from total latency. Each candidate run
   at least twice. Schemas and system prompts copied from `src/lib/ai/schemas.ts` and
   `src/lib/ai/prompts.ts` so the numbers reflect this app, not a toy prompt:
   - **A — question generation**: a 1-D collisions passage → 3 MCQs with the real
     `QuestionOut` shape (options, correct index, per-distractor misconception label,
     difficulty, explanation, nullable `calc`, `sourceRef`). Answer keys were machine-checked
     by evaluating each `calc.expression` against the stated option text, and distractor
     spacing was checked against the `>5%` rule in `DESIGN_SYSTEM`.
   - **B — image/document understanding**: a generated 1100×760 PNG of handwritten-style
     physics notes, sent as inline base64, plus a deliberately blurred/low-contrast/rotated
     version of the same page, to test whether the model reports low readability or invents
     content.
   - **C — tutoring**: a student who picked a stated wrong option (`+1.67 m/s`), expecting a
     misconception diagnosis plus a *different* worked example.
   - **R — question review** (added, since the app runs an independent second pass): four blind
     questions — two sound, one factually broken, one deliberately ambiguous.
4. Veo, TTS, image generation and embeddings probed directly. Veo was started once on the
   cheapest variant only; no polling loop, no repeat videos.

Scripts were throwaway and live outside the repo.

---

## Headline findings (read these first)

1. **`GEMINI_MODEL` currently defaults to `gemini-3.5-flash`, which is an alias that silently
   serves `gemini-3.6-flash`.** Verified by reading `modelVersion` off a live response:

   | Requested model | `modelVersion` actually served |
   |---|---|
   | `gemini-3.5-flash` | **`gemini-3.6-flash`** |
   | `gemini-3.7-flash` | **`gemini-3.8-flash`** |
   | `gemini-flash-latest` | `gemini-3.8-flash` |
   | `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` |
   | `gemini-3.6-flash` | `gemini-3.6-flash` |
   | `gemini-3.8-flash` | `gemini-3.8-flash` |
   | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` |
   | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` |
   | `gemini-3-flash-preview` | `gemini-3-flash-preview` |

   Matches the docs: `gemini-3.5-flash` is deprecated and auto-routed to `gemini-3.6-flash`;
   `gemini-3.7-flash` is auto-routed to `gemini-3.8-flash`
   (<https://ai.google.dev/gemini-api/docs/deprecations>,
   <https://ai.google.dev/gemini-api/docs/changelog>). The config should name a concrete model.

2. **`thinkingLevel: "low"` is the single biggest lever in this app.** On question generation,
   `gemini-3.8-flash` went from 32.6 s → 13.1 s total and 23.6 s → 2.9 s time-to-first-token,
   with thinking tokens dropping from ~3140 to 0 — and all 6 answer keys still machine-verified
   correct. That is also a ~61% cost reduction per call. The code currently sets no thinking
   config at all, so it pays for default (medium) thinking on every call.

3. **`temperature` is deprecated and ignored from Gemini 3.6 onward**, and "In future model
   generations, supplying these parameters returns an HTTP 400 error"
   (<https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6>). `src/lib/ai/client.ts` sets
   `temperature` on every call (0.1 transcribe, 0.2 extract, 0.7 design, 0 review, 0.5 tutor).
   Empirically it is still accepted today (no 400 on any 3.6/3.8 call) but it has no effect —
   notably `temperature: 0` no longer makes the reviewer deterministic.

4. **`gemini-2.5-flash` returns 404 on this key**, verbatim:
   > `This model models/gemini-2.5-flash is no longer available to new users. Please update your
   > code to use models/gemini-3.8-flash for the latest features and improvements.`

   The `// Gemini 2.5 models retire on 2026-10-20` comment in `config.ts` and `.env.example` is
   effectively already true on the Gemini Developer API path.

5. **The key in `.env` is a free-tier key.** Image generation, Veo and the Pro-class models all
   return 429 with `limit: 0` on free-tier metrics. Production needs billing enabled.

6. **On an unreadable page, models differ sharply in honesty** — see
   [Benchmark B](#b--imagedocument-understanding). `gemini-3.6-flash` refused and said
   `unreadable`; `gemini-3.8-flash` and `gemini-3-flash-preview` confabulated the whole page
   from physics priors, with a reproducible factual error.

---

## Recommended model per task

Latency is **mean total wall-clock** for the measured workload on this free-tier key, over the
stated number of runs. Cost is per call at the promotional paid-tier rates published on
<https://ai.google.dev/gemini-api/docs/pricing> (checked 2026-10-17), computed from the token
counts actually returned in `usageMetadata`. Thinking tokens are billed as output
(<https://ai.google.dev/gemini-api/docs/generate-content/thinking>).

| Task | Recommended | Fallback | Why | Measured latency | Cost notes | Env var |
|---|---|---|---|---|---|---|
| Image / document understanding (`material.transcribe`) | `gemini-3.6-flash` | `gemini-3.8-flash` | Only model that answered `overallReadability: "unreadable"` + `[illegible]` on the blurred page instead of inventing content. Transcription of the clear page was flawless (all 15 lines, LaTeX, `[diagram: …]`). | clear 8.4 s (6.3–10.6, n=2); blurry 6.1 s (n=1) | ~$0.0066/page (1230 in, 322 out + 1196 thinking) | `GEMINI_TRANSCRIBE_MODEL` *(new)* |
| Concept extraction (`material.extract`) | `gemini-3.8-flash` @ `thinkingLevel: "low"` | `gemini-3.5-flash-lite` | Text-only, large input (up to 40 KB of transcript); 1 M context on both. Not separately benchmarked — shares the generation profile. | not measured | same rates as generation | `GEMINI_MODEL` |
| Question generation (`questions.generate`) | `gemini-3.8-flash` @ `thinkingLevel: "low"` | `gemini-3.5-flash-lite` | 6/6 answer keys machine-verified; distractors numerically derived from their named misconception (e.g. `+5.2 m/s` for `scalar-momentum-addition`, `+1.0 m/s` for `unweighted-velocity-average`, `+3.3 m/s` for `single-mass-denominator`). `low` cuts latency 2.5× and cost 61% with no measured key errors. | 13.1 s (13.1–13.2, n=2), TTFT 2.9 s | $0.0071/call (512 in, 1797 out, 0 thinking) vs $0.0184 at default thinking | `GEMINI_MODEL` + `GEMINI_THINKING_LEVEL` *(new)* |
| Question review — independent second pass (`questions.review`) | `gemini-3.8-flash` (default thinking) | `gemini-3.5-flash-lite` | Only model that flagged the deliberately ambiguous item (`ambiguous: true`, n=1/1). Both flash-lites chose an option and reported `ambiguous: false` (n=2/2 each). All three solved the two sound questions correctly and flagged the factually broken one. | 11.4 s (n=1 before quota exhaustion); flash-lite 1.6 s (n=2) | scales with batch size; not separately costed | `GEMINI_REVIEW_MODEL` (existing) |
| Tutoring / explanations (`tutor.explain`) | `gemini-3.8-flash` | `gemini-3.5-flash-lite` | Both reps reproduced the student's *exact* wrong arithmetic (`2*3 + 4*1 = 10, then 10/6 = 1.67`) before correcting it. `gemini-3.1-flash-lite` got that diagnosis wrong in 1/2 reps ("you added the magnitudes, 3 + 1 = 4" — which does not produce 1.67). All models labelled `ignoring-velocity-sign` correctly and kept `simpleExplanation` ≤ 90 words. | 11.7 s (8.6–14.9, n=2); flash-lite 2.7 s (n=2) | $0.0052/call (475 in, 638 out + 646 thinking); flash-lite $0.0016 | `GEMINI_TUTOR_MODEL` *(new)* |
| Follow-up question (`tutor.followup`) | same as generation | same | Single question, same schema; latency dominated by the review call that follows it. | not separately measured | ~1/3 of a 3-question generation | `GEMINI_MODEL` |
| Hints | **no model call needed** | — | Hints are produced inline with the question (`QuestionOut.hint`) and served from the stored question by `src/lib/services/play.ts`. Adding a model call here would be new spend for no new content. | n/a | $0 | none |
| Video understanding | `gemini-3.8-flash` | `gemini-3.5-flash-lite` | Not implemented in the app (`src/lib/ingest/files.ts` accepts only PDF/JPEG/PNG). Docs: "All Gemini models can process video data"; 1 M-context models handle up to 3 h at low media resolution, 1 FPS default sampling, inline <100 MB (<https://ai.google.dev/gemini-api/docs/video-understanding>). | **not measured** | ~100 tok/s low res, ~300 tok/s high | `GEMINI_MODEL` |
| Video generation | `veo-3.1-lite-generate-preview` | `veo-3.1-fast-generate-preview` | Cheapest variant that still produces 8 s 720p with native audio, which is all `src/lib/services/video.ts` asks for. **All three Veo variants return 429 on this key.** | **blocked — 429 in 0.26–0.30 s** | $0.05/s at 720p (lite) → $0.40 for an 8 s clip; fast $0.10/s; standard $0.40/s | `VEO_MODEL` (existing) |
| TTS narration | `gemini-3.8-flash-lite-tts` | `gemini-3.8-flash-tts` | Verified working. Lite was faster (4.0 s vs 5.1 s) for the same 27-token input; both returned `audio/wav` ready to serve. Not currently used by the app. | 4.0 s lite / 5.1 s flagship (n=1 each) | flagship $0.50 in / $9.00 out per 1M ≈ $0.00225 per 10 s; **lite not separately priced in the docs** | `GEMINI_TTS_MODEL` *(new, only if narration ships)* |
| Image / asset generation | `gemini-3.1-flash-image` ("Nano Banana 2") | `gemini-3.1-flash-lite-image` | Right tier for flat 2-D diagrams; `gemini-3-pro-image` is 3× the input price and ~3× the per-image price for studio output this app does not need. **All image models return 429 on this key.** | **blocked — 429 in 0.41–0.47 s** | flash-image $0.045–$0.151/image; pro-image $0.134 (1K/2K) – $0.24 (4K) | `GEMINI_IMAGE_MODEL` *(new, only if asset generation ships)* |
| Embeddings | `gemini-embedding-2` | `gemini-embedding-001` | Verified both work (3072 dims, 0.6–0.8 s). `gemini-embedding-2` **auto-normalises truncated dimensions** — measured L2 norm 1.0000 at `outputDimensionality: 768`, where `gemini-embedding-001` returned 0.5872 and would need manual normalisation. 8192-token input limit vs 2048. Nothing in `src/` uses embeddings today. | 0.60–0.82 s (n=3 each) | $0.20/1M text; $0.45/1M image | `GEMINI_EMBED_MODEL` *(new, only if retrieval ships)* |

### Models deliberately not recommended

| Model | Reason |
|---|---|
| `gemini-3.5-flash` | Alias → `gemini-3.6-flash` (verified). Naming it hides which model you are actually billed for and makes the measured numbers unreproducible. |
| `gemini-3.7-flash` | Alias → `gemini-3.8-flash` (verified). |
| `gemini-flash-latest` / `gemini-flash-lite-latest` / `gemini-pro-latest` | Moving targets. A model swap underneath a fixed prompt is exactly the kind of silent regression the independent-solve reviewer exists to catch; don't introduce it on purpose. |
| `gemini-4-argon` | 429 `limit: 0` on this key. Docs: not available on the Free tier, $2.00/$10.00 rising to $4.00/$20.00 on 2026-12-01, thinking cannot be disabled, explicit caching unsupported, and migration requires HTTP client timeouts "of at least 20 minutes" (<https://ai.google.dev/gemini-api/docs/generate-content/latest-model>). Wrong shape for an interactive tutor. |
| `gemini-3.1-pro-preview` | 429 `limit: 0`. $12.00–$18.00/1M output. Nothing measured justifies 3× the Flash price for high-school MCQ work. |
| `gemini-3.1-flash-lite` | Works and is the cheapest viable option ($0.25/$1.50, 6.7 s generation), but shut down 2027-05-07 (<https://ai.google.dev/gemini-api/docs/deprecations>), and it gave a wrong misconception diagnosis in 1/2 tutoring reps. |
| `gemini-3-flash-preview` | Preview; burned 3939 thinking tokens on generation and 4466 on tutoring (20.1 s) for no measured quality gain, and confabulated the blurry page 3/3. |
| `gemini-3.5-transcribe` | Despite the name, it is audio-only. Verbatim on a PNG: `Image input modality is not enabled for this model` (HTTP 400, 3/3 attempts). |
| `gemini-2.5-*` | 404 "no longer available to new users" (verified on `gemini-2.5-flash`). |

---

## Measured benchmark results

### A — Question generation (3 MCQs, real `QuestionOut` schema)

`responseMimeType: "application/json"` + `responseJsonSchema`, temperature 0.7, 2 runs each.
"keys ok" = every numerical question's `calc.expression` evaluated to the stated correct
option within tolerance, distractors >5% away, `correctIndex` consistent with
`correctOptionId`, and one distractor per wrong option.

| Model | runs | schema-valid | TTFT mean (min–max) | Total mean (min–max) | out tok | thinking tok | keys ok |
|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 2 | 2/2 | **1.5 s** (1.2–1.8) | **4.5 s** (4.4–4.6) | 1314 | 0 | 6/6 |
| `gemini-3.1-flash-lite` | 2 | 2/2 | 3.8 s (3.1–4.5) | 6.7 s (5.6–7.8) | 1359 | 0 | 6/6 |
| `gemini-3.6-flash` | 2 | 1/2 | 12.5 s (10.1–15.0) | 17.6 s (13.3–22.0) | 1379 | 2440 | 3/3 |
| `gemini-3-flash-preview` | 2 | 2/2 | 16.4 s (14.0–18.8) | 20.6 s (17.8–23.3) | 1265 | 3939 | 6/6 |
| `gemini-3.5-flash` *(→3.6)* | 2 | 2/2 | 15.5 s (13.9–17.0) | 21.2 s (20.5–22.0) | 1554 | 2795 | 6/6 |
| `gemini-3.7-flash` *(→3.8)* | 2 | 2/2 | 19.3 s (17.3–21.2) | 28.6 s (25.4–31.9) | 1622 | 2526 | 6/6 |
| `gemini-3.8-flash` | 2 | 2/2 | 23.6 s (22.7–24.4) | 32.6 s (31.9–33.2) | 1660 | 3140 | 6/6 |
| `gemini-4-argon` | 2 | — | — | — | — | — | **429, free-tier `limit: 0`** |
| `gemini-3.1-pro-preview` | 2 | — | — | — | — | — | **429, free-tier `limit: 0`** |

With explicit thinking control:

| Model + config | runs | schema-valid | TTFT mean | Total mean | out tok | thinking tok | keys ok |
|---|---|---|---|---|---|---|---|
| `gemini-3.8-flash` `thinkingLevel:"low"` | 2 | 2/2 | **2.9 s** | **13.1 s** (13.1–13.2) | 1860 | **0** | 6/6 |
| `gemini-3.5-flash-lite` `thinkingLevel:"high"` | 3 | 3/3 | 10.3 s | 12.3 s (11.5–13.3) | 1111 | 3741 | 9/9 |

**Quality, judged by reading the outputs.** All models that completed produced correct answer
keys. They differ in how well distractors are tied to their named misconceptions:

- `gemini-3.8-flash` — every numeric distractor is derivable from its label. For
  `m1=3.0 kg @ +6.0`, `m2=2.0 kg @ -4.0`, coupling: key `+2.0 m/s`;
  `+5.2` = `(18+8)/5` (`scalar-momentum-addition`), `+1.0` = mean of `+6` and `-4`
  (`unweighted-velocity-average`), `+3.3` = `10/3` (`single-mass-denominator`).
- `gemini-3.5-flash-lite` — distractors are plausible but looser. For
  `m1=3.0 @ +5.0` into stationary `m2=2.0`: key `3.0 m/s`, distractors `1.8`, `5.0`, `7.5`.
  `5.0` (`velocity-conservation`) and `7.5` (`15/2`) are clean; `1.8` carries the label
  `incorrect-mass-weighting` but is not obviously derivable from it.
- `gemini-3.1-flash-lite` — same pattern, slightly weaker labels
  (`zero-momentum-bias`, `reflection-symmetry-error` read as invented taxonomy).

### B — Image / document understanding

Same 1100×760 PNG of handwritten-style notes, inline base64. 1230 prompt tokens for the
image + instructions in every case.

**Clear page** — all four models transcribed it correctly: chapter heading, all equations in
LaTeX, the worked example (`p = 6 - 4 = +2 kg m/s`, `v = 2/6 = +0.33 m/s`), the restitution
definition, and a `[diagram: …]` note. No substantive differences.

| Model | runs | TTFT mean | Total mean (min–max) | out tok | thinking tok |
|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 2 | 2.3 s | **3.0 s** (2.9–3.1) | 366 | 0 |
| `gemini-3.1-flash-lite` | 2 | 3.3 s | 3.7 s (2.1–5.4) | 311 | 0 |
| `gemini-3.6-flash` | 2 | 7.3 s | 8.4 s (6.3–10.6) | 322 | 1196 |
| `gemini-3.8-flash` | 2 | 7.1 s | 9.3 s (7.6–10.9) | 380 | 372 |
| `gemini-3.5-transcribe` | 2 | — | — | — | **HTTP 400 `Image input modality is not enabled for this model`** |

**Blurred / low-contrast / rotated page** — this is the discriminating test. Ground truth:
"Ch 6", `m1=2 kg`, `u1=+3 m/s`, `m2=4 kg`, `u2=-1 m/s`, `p = 6 - 4 = +2`, `v = 2/6 = +0.33`.
`TRANSCRIBE_SYSTEM` says "Mark anything you cannot read as `[illegible]`. Do NOT guess missing
words or numbers."

| Model | runs | `overallReadability` | Behaviour |
|---|---|---|---|
| `gemini-3.6-flash` | 1 valid (+3 later runs 429) | **`unreadable`** | Transcript was exactly `[illegible]`; note: *"The document is severely out of focus / blurry, making the text and numbers illegible without guessing."* **Correct refusal.** |
| `gemini-3.8-flash` | 5 | `partial` 5/5 | Reconstructed the entire page including every number, 5/5. Its own `notes` field admits it: *"the text and equations can be reconstructed based on standard collision formulas and recognizable outlines."* Reproducible error: wrote **"Ch 4"** instead of "Ch 6" in **4/5** runs (the 5th got the chapter right but still invented the rest). |
| `gemini-3-flash-preview` | 3 | `partial` | Same confabulation, same **"Ch 4"** error, 3/3. |
| `gemini-3.5-flash-lite` | 2 | `partial` | Invented the topic: **"2D Collisions"** (2/2), rewrote the conservation equation with primed variables that are not on the page, and emitted garbage lines (*"Ex: Binding elasticity, mutually attractive"*). Did use `[illegible]` markers. |
| `gemini-3.1-flash-lite` | 2 | `partial` | Invented **numbers**: `p = 5 - 4 = +2`, then `v = 2/5 = +0.5` (rep 0) and `v = 2/5 = +0.4` (rep 1). Worst outcome — plausible-looking wrong physics with no illegibility flag on those lines. |

This matters because `transcribeMaterial()` throws `UNREADABLE` only when
`overallReadability === "unreadable"` or the readable transcript is under 120 characters.
`gemini-3.6-flash`'s honest `unreadable` trips that gate and shows the student
"try a clearer, well-lit photo". Every other model returns `partial` with ~500 characters of
invented content, sails through the gate, and the invented numbers then flow into concept
extraction, question generation and the tutor — grounded in notes the student never wrote.

### C — Tutoring / explanation

Student picked `B) +1.67 m/s` (= `(2·3 + 4·1)/6`, i.e. sign ignored). Correct answer
`A) +0.33 m/s`. 475 prompt tokens.

| Model | runs | TTFT mean | Total mean (min–max) | out tok | thinking tok | Diagnosis quality |
|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 2 | 1.3 s | **2.7 s** (2.6–2.7) | 584 | 0 | Label correct 2/2. Conceptually right ("you forgot left is negative") but never showed the student's own arithmetic. One rep's worked example jumped straight to `p_1 = 1 × 4` without introducing the new scenario. |
| `gemini-3.1-flash-lite` | 2 | 3.0 s | 4.5 s (3.4–5.7) | 602 | 0 | Label correct 2/2, but rep 0 mis-stated the student's error as *"you added the magnitudes of the velocities (3 + 1 = 4)"* — which does not yield 1.67. 1/2 accurate. |
| `gemini-3.8-flash` | 2 | 7.4 s | 11.7 s (8.6–14.9) | 638 | 646 | **2/2 reproduced the exact wrong arithmetic**: *"(2*3 + 4*1 = 10, then 10/6 = 1.67 m/s)"*. Worked examples used fresh, smaller numbers as instructed. |
| `gemini-3-flash-preview` | 2 (1 valid) | 18.5 s | 20.1 s | 549 | 4466 | Correct, but 4466 thinking tokens for a 549-token answer. |

All models honoured `simpleExplanation ≤ 90 words` (53–83 words measured), returned 3 steps,
and set `grounding` sensibly. All returned a non-null `visual` describing their *worked
example* rather than the original question — which is what `tutorExplain()` expects and will
substitute for the question's diagram.

### R — Question review (independent blind solve)

Four questions, keys withheld: q1 and q2 sound, q3 factually broken ("given that kinetic energy
is conserved in this perfectly inelastic collision"), q4 deliberately ambiguous (options A
*"momentum is conserved"* and B *"KE is conserved only if e = 1"* are both true).

| Model | runs | Total | q1/q2 solved | q3 `factualProblem` | q4 `ambiguous` |
|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 2 | 1.6 s | 2/2 ✓ | `true` 2/2 ✓ | **`false` 2/2 ✗** (chose A) |
| `gemini-3.1-flash-lite` | 2 | 1.9 s | 2/2 ✓ | `true` 2/2 ✓ | **`false` 2/2 ✗** (chose A) |
| `gemini-3.8-flash` | 1 valid (3 × 429) | 11.4 s | 2/2 ✓ | `true` ✓ | **`true` ✓** |

No model raised a false alarm on the two sound questions. The ambiguity miss is the deciding
factor: `reviewQuestions()` rejects a question when `ambiguous` is true, so a reviewer that
never sets it degrades the second pass to a pure answer-key check.

### Thinking-control sweep (tutoring task)

| Model | config | TTFT | Total | thinking tok | out tok |
|---|---|---|---|---|---|
| `gemini-3.8-flash` | default (medium) | 4.0 s | 8.7 s | 243 | 646 |
| `gemini-3.8-flash` | `thinkingLevel: "low"` | 5.6 s | 10.2 s | 0 | 685 |
| `gemini-3.8-flash` | `thinkingLevel: "high"` | 14.0 s | 18.0 s | 1710 | 643 |
| `gemini-3.8-flash` | `thinkingBudget: 0` | 1.9 s | 6.3 s | 0 | 682 |
| `gemini-3.8-flash` | `thinkingBudget: 512` | 7.3 s | 38.9 s | 0 | 682 |
| `gemini-3.5-flash-lite` | default | 1.0 s | 2.6 s | 0 | 617 |
| `gemini-3.5-flash-lite` | `thinkingLevel: "low"` | 1.4 s | 2.8 s | 0 | 551 |
| `gemini-3.5-flash-lite` | `thinkingLevel: "high"` | 7.2 s | 8.1 s | 2280 | 443 |
| `gemini-3.5-flash-lite` | `thinkingBudget: 0` | — | — | — | **HTTP 400 `Request contains an invalid argument`** |

Use `thinkingLevel`, not `thinkingBudget` — `thinkingBudget` is Gemini 2.5-only
(<https://ai.google.dev/gemini-api/docs/generate-content/latest-model>); it is silently ignored
by 3.8 and rejected by 3.5-flash-lite. Note `gemini-3.5-flash-lite` does no thinking by default
(`minimal`, per <https://ai.google.dev/gemini-api/docs/thinking>), which is why it is fast — and
why `thinkingLevel: "high"` is available if you want it to reason harder on the review pass.

### Veo, TTS, image generation, embeddings

**Veo 3.1 — `predictLongRunning` does NOT start on this key.** All three variants, verbatim
(key redacted; the message contained no key):

```
HTTP 429
{
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details.
                For more information on this error, head to:
                https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current
                usage, head to: https://ai.dev/rate-limit. ",
    "status": "RESOURCE_EXHAUSTED",
    "details": [{ "@type": "type.googleapis.com/google.rpc.Help", "links": [...] }]
  }
}
```

Rejected in 0.26–0.30 s, i.e. before any work started, consistent with a hard `limit: 0` rather
than throttling. This matches the pricing page: Veo 3.1 has no free tier. **No operation name
was ever returned, so no operation could be polled.** This does not block the app: `config.videoEnabled`
already requires `aiMode === "vertex"` plus a GCS bucket, and `outputGcsUri` (which
`src/lib/services/video.ts` passes) is not documented anywhere in the Gemini Developer API docs
— it is a Vertex AI parameter. Veo therefore has to be validated on the Vertex path, not this one.

**TTS — works.** `generateContent` with `responseModalities: ["AUDIO"]`:

| Model | Latency | Output | Audio bytes | Token accounting |
|---|---|---|---|---|
| `gemini-3.8-flash-lite-tts` | 4.04 s | `audio/wav` | 511,074 | 27 text in, 263 audio out |
| `gemini-3.8-flash-tts` | 5.06 s | `audio/wav` | 489,954 | 27 text in, 252 audio out |
| `gemini-2.5-flash-preview-tts` | 7.53 s | `audio/L16;codec=pcm;rate=24000` | 472,846 | 27 text in, 246 audio out |

Two things worth knowing: the 3.8 models return a **ready-to-serve WAV with a RIFF header**,
while the 2.5 preview returns headerless PCM you would have to wrap yourself; and the legacy
`speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` request shape still works even though
the docs now show `generation_config.speech_config: [{"voice": "Kore"}]`
(<https://ai.google.dev/gemini-api/docs/speech-generation>).

**Image generation — blocked.** `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image` and
`gemini-3-pro-image` all returned 429 in 0.41–0.47 s. Verbatim detail lines:

```
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
  limit: 0, model: gemini-3.1-flash-image
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count,
  limit: 0, model: gemini-3-pro-image
```

Same `limit: 0` pattern for `gemini-4-argon` and `gemini-3.1-pro` (note: the error for
`gemini-3.1-pro-preview` names the model `gemini-3.1-pro`).

**Embeddings — work, and the two models differ in a way that matters.**

| Model | config | Latency | Dims | L2 norm |
|---|---|---|---|---|
| `gemini-embedding-2` | default | 0.82 s | 3072 | 1.0000 |
| `gemini-embedding-2` | `outputDimensionality: 768` | 0.69 s | 768 | **1.0000** |
| `gemini-embedding-2` | `taskType: RETRIEVAL_DOCUMENT` | 0.78 s | 3072 | 1.0000 |
| `gemini-embedding-001` | default | 0.76 s | 3072 | 1.0000 |
| `gemini-embedding-001` | `outputDimensionality: 768` | 0.64 s | 768 | **0.5872** |
| `gemini-embedding-001` | `taskType: RETRIEVAL_DOCUMENT` | 0.64 s | 3072 | 1.0000 |

Confirms the documented behaviour: `gemini-embedding-2` auto-normalises truncated dimensions,
`gemini-embedding-001` does not (<https://ai.google.dev/gemini-api/docs/embeddings>). If anything
ever stores 768-dim vectors from `001` without re-normalising, cosine similarity will be wrong.

---

## Environment variables

Existing convention in `src/lib/config.ts` is preserved. New names follow the same
`GEMINI_*` (model identity) / `QL_*` (app behaviour) split.

### Keep as-is

| Var | Controls | Current default | Recommended default |
|---|---|---|---|
| `GEMINI_MODEL` | `config.model` — extraction, question generation, follow-ups, tutoring fallback | `gemini-3.5-flash` | **`gemini-3.8-flash`** (the alias already resolves here via 3.6; name it explicitly) |
| `GEMINI_REVIEW_MODEL` | `config.reviewModel` — `questions.review` | falls back to `GEMINI_MODEL` | **`gemini-3.8-flash`** — keep the fallback chain |
| `VEO_MODEL` | `config.veoModel` — `video.generate` | `""` (video off) | leave empty; set `veo-3.1-lite-generate-preview` only on the Vertex path |
| `QL_ENABLE_VIDEO`, `QL_AI_TIMEOUT_MS`, `QL_AI_PROVIDER`, `QL_FORCE_DEMO` | unchanged | | see [Failure handling](#failure-handling) for the timeout |

### Proposed new vars (three, and only where the measurements justify them)

| Var | Controls | Suggested default | Justification |
|---|---|---|---|
| `GEMINI_TRANSCRIBE_MODEL` | model for `material.transcribe` only; falls back to `GEMINI_MODEL` | `gemini-3.6-flash` | Measured: the transcription step has a *different* success criterion (refuse rather than reconstruct) and the models rank differently on it than on generation. Without this var you cannot have an honest transcriber and a fast generator at the same time. |
| `GEMINI_TUTOR_MODEL` | model for `tutor.explain`; falls back to `GEMINI_MODEL` | `gemini-3.8-flash` | The tutor is the only synchronous, student-facing call (`timeoutMs: 45_000`, `retries: 1`). 2.7 s vs 11.7 s is a product decision, and deployments on tight budgets should be able to drop to `gemini-3.5-flash-lite` without changing the generation model. |
| `GEMINI_THINKING_LEVEL` | `thinkingConfig.thinkingLevel` on batch calls (`low` \| `medium` \| `high`) | `low` | Measured 2.5× latency and 61% cost reduction on question generation with no key errors. This is the single highest-leverage knob and it is currently unset. |

Suggested shape in `config.ts`, matching the existing getters:

```ts
get transcribeModel() { return process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-3.6-flash"; },
get tutorModel()      { return process.env.GEMINI_TUTOR_MODEL ?? this.model; },
get thinkingLevel()   { return process.env.GEMINI_THINKING_LEVEL ?? "low"; },
```

`generateJson()` would pass `config: { thinkingConfig: { thinkingLevel } }`. Do **not** apply
`low` to `questions.review` — the one measured advantage of `gemini-3.8-flash` as a reviewer
(catching the ambiguous item) came from a default-thinking run.

### Deferred — define only when the feature ships

| Var | Default if used | Note |
|---|---|---|
| `GEMINI_TTS_MODEL` + `QL_ENABLE_TTS` | `gemini-3.8-flash-lite-tts` | Verified working; nothing in `src/` calls TTS today. |
| `GEMINI_IMAGE_MODEL` + `QL_ENABLE_IMAGE_ASSETS` | `gemini-3.1-flash-image` | Could not be verified — 429 on this key. |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-2` | Verified working; no retrieval code exists. |

No new var is proposed for hints (generated inline with the question), concept extraction
(same profile as generation — `GEMINI_MODEL` covers it) or video understanding (no such code
path exists).

---

## Failure handling

### What was actually observed

| Failure | Where | What the app should do |
|---|---|---|
| **429 `RESOURCE_EXHAUSTED`, `limit: 0`** | Veo (all 3), all image models, `gemini-4-argon`, `gemini-3.1-pro-preview`, `gemini-pro-latest`. Rejected in 0.26–0.47 s. | A hard capability gap, not throttling — retrying is pure waste. `isTransient()` in `client.ts` treats *all* 429s as retryable and will burn 3 attempts plus ~2.8 s of backoff. Detect `limit: 0` / `free_tier` in the message and fail fast with the existing `AI_MODEL_NOT_FOUND`-style non-retryable error. |
| **429 after sustained use** | `gemini-3.6-flash` first (exhausted mid-session), then `gemini-3.8-flash`. Same 429 shape, no `limit: 0`. | This one *is* retryable, but not within a request. Current backoff (0.8 s, 1.6 s, 3.2 s) is far too short for a daily cap. Surface `AI_RATE_LIMITED` quickly and let the quest fall back to the deterministic generators in `src/lib/demo/templates.ts`. |
| **503 `UNAVAILABLE`** — *"This model is currently experiencing high demand. Spikes in demand are usually temporary."* | `gemini-3.6-flash` and `gemini-3.5-flash` (same backend), 4 occurrences | Genuinely transient; the existing exponential backoff handled it. Keep. |
| **Truncated SSE stream → invalid JSON** | `gemini-3.6-flash`, 1/2 runs. 850 output tokens delivered, no `finishReason`, JSON cut mid-string. | Already covered: `generateJson()` throws `SchemaFailure` and retries once with the validation error as feedback. Worth noting it is a *stream* failure, not a model failure — a non-streaming call would likely have succeeded. |
| **167 s and 88.9 s single calls** | `gemini-3.8-flash` on the blurry image (vs 10.4 s for the same request a minute earlier) | **`QL_AI_TIMEOUT_MS` defaults to 90,000 ms, so the 167 s call would have aborted** and the 88.9 s one came within 1.2 s of it. Tail latency on image input is far worse than the mean. Either raise the transcribe timeout to ~180 s, or lower it deliberately (~45 s) and let the retry loop handle it — but do not leave it at a value the p99 straddles. |
| **HTTP 404 model gone** | `gemini-2.5-flash`: *"no longer available to new users. Please update your code to use models/gemini-3.8-flash"* | `mapProviderError()` already maps 404 → `AI_MODEL_NOT_FOUND`, non-retryable. Correct. Add a startup log of the configured model so this is diagnosable. |
| **HTTP 400 wrong modality** | `gemini-3.5-transcribe` on a PNG: *"Image input modality is not enabled for this model"* | Currently falls into the generic `AI_ERROR` with `retryable: true` — it will retry twice and fail anyway. 400 should be non-retryable. |
| **Silent model substitution** | `gemini-3.5-flash` → `gemini-3.6-flash` | No error at all. Log `response.modelVersion` in `audit()` alongside the requested `model`, so a swap underneath you shows up in the audit trail. |

### Rate limits

Google **no longer publishes per-model RPM/TPM/RPD numbers**. The rate-limits page now says
limits "depend on a variety of factors (such as your usage tier) and can be viewed in Google AI
Studio" and links to <https://aistudio.google.com/rate-limit>
(<https://ai.google.dev/gemini-api/docs/rate-limits>). What *is* published: a spend-based limit
per 10 minutes (Free n/a, Tier 1 $10, Tier 2 $50, Tier 3 $200), and the tier ladder (Tier 1 =
billing linked, $250 cap). So the app cannot compute a safe request rate from docs — it has to
treat 429 as a first-class, expected outcome.

### Recommended changes to `src/lib/ai/client.ts`

1. Narrow `isTransient()`: exclude 429s whose message contains `limit: 0` or `free_tier`, and
   exclude all 4xx other than 429.
2. Add `thinkingConfig.thinkingLevel` to the `generateContent` config, from
   `GEMINI_THINKING_LEVEL`, with a per-call override so the reviewer keeps default thinking.
3. Stop sending `temperature` to 3.6+ models, or accept that it is a no-op. It will become a
   400 in a future model generation
   (<https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6>). The reviewer's `temperature: 0`
   no longer buys determinism — if determinism matters there, it has to come from the prompt.
4. Record `res.modelVersion` in the audit entry.
5. Give the transcribe step its own timeout rather than inheriting `QL_AI_TIMEOUT_MS`.

### Context caching (not currently used, worth it later)

Implicit caching is on by default for 2.5+ with a 4096-token minimum on 3.6/3.8
(<https://ai.google.dev/gemini-api/docs/caching>), billed at $0.075/1M instead of $0.75/1M.
`designQuestions()` sends the same `sourceText` (up to 40 KB) on round 0 and round 1, and
`reviewQuestions()` sends the first 12 KB of it again — those repeats should already be hitting
the implicit cache. Explicit caching exists for 3.x but is being retired and is unsupported on
Gemini 4 Argon, so it is not worth building against.

---

## Caveats

Things I could **not** verify, stated plainly:

1. **Everything here was measured on the Gemini Developer API** (`generativelanguage.googleapis.com`)
   with `GEMINI_API_KEY`. **The app defaults to Vertex AI** (`GOOGLE_GENAI_USE_VERTEXAI=true` in
   `.env.example`). Model availability, aliasing, quota behaviour, latency and pricing on Vertex
   are *different* and were not tested. The alias finding in particular (`gemini-3.5-flash` →
   `gemini-3.6-flash`) must be re-checked on Vertex before acting on it there.
2. **This is a free-tier key.** All latencies may improve on a paid tier, and the 429 pattern
   will change entirely. No paid-tier measurement exists.
3. **`gemini-4-argon`, `gemini-3.1-pro-preview`, `gemini-pro-latest`, all Veo variants and all
   image-generation models were never successfully called** (429 `limit: 0`). Their
   recommendations rest on docs alone.
4. **Veo was never started.** No operation name, no initial status, no polling. The task asked
   for an operation name; the API refused before creating one.
5. **The `gemini-3.6-flash` blurry-image refusal rests on a single valid sample.** Three
   follow-up attempts were all 429. It is the basis for recommending it as the transcriber, so
   it should be re-run (≥5 reps) on a billed key before that choice is locked in. The *contrary*
   evidence is stronger: `gemini-3.8-flash` confabulated 5/5 and `gemini-3-flash-preview` 3/3.
6. **The review benchmark has n=1 for `gemini-3.8-flash`** (quota exhausted on the repeat run).
   The flash-lite misses are n=2 each.
7. **No PDF was tested** — only PNG. `src/lib/ingest/files.ts` accepts PDFs up to 40 pages and
   docs claim 50 MB / 1000 pages
   (<https://ai.google.dev/gemini-api/docs/document-processing>), but PDF-specific
   transcription fidelity is unmeasured.
8. **No video input was tested** (no sample video, no `ffmpeg` on this machine). Video
   understanding claims are documentation-only.
9. **Extraction (`material.extract`) and follow-up generation were not separately benchmarked.**
   They share the generation profile but have different prompt sizes.
10. **Structured output field naming is drifting.** The code uses `responseJsonSchema`, which
    works today on every model tested. Current docs show `response_format` / `responseFormat`
    with a nested `schema`, and `responseSchema` now appears only in the legacy API reference
    (<https://ai.google.dev/gemini-api/docs/structured-output>,
    <https://ai.google.dev/gemini-api/docs/generate-content/structured-output>). Nothing is
    broken, but this is a migration waiting to happen; the `@google/genai` SDK version pinned in
    `package.json` determines which shape is actually sent.
11. **Per-model rate limits could not be obtained** — not published (see above).
12. **`gemini-3.5-flash`, `gemini-3.7-flash`, `gemini-3-flash-preview` and
    `gemini-3.8-flash-lite-tts` have no published per-token prices** on
    <https://ai.google.dev/gemini-api/docs/pricing>. For the first two, billing presumably
    follows the model actually served (`gemini-3.6-flash` and `gemini-3.8-flash` respectively),
    but that is an inference, not a documented statement.
13. **Gemini 2.5 retirement dates**: the Gemini API deprecations page lists "No date announced"
    for `gemini-2.5-pro` / `flash` / `flash-lite`, while access is already gated to prior users
    (verified: 404 on this key). The `2026-10-20` date in `config.ts` and `.env.example` comes
    from Vertex AI lifecycle docs that I could not render directly. The practical conclusion is
    unaffected: do not ship on 2.5.
14. **Quality judgements on distractor and diagnosis quality are mine, from reading the
    outputs**, with the specific evidence quoted above. Answer-key correctness and schema
    conformance are machine-checked; pedagogical quality is not, and n=2–3 is a small sample.
