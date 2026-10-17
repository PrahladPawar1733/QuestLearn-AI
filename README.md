# QuestLearn AI

**Upload. Play. Understand. Master.**

QuestLearn AI turns a student's own study material (photos of handwritten notes or a chapter PDF) into a playable learning quest. Gemini on Vertex AI reads the material, extracts concepts and writes questions. Application code validates every answer key before a student sees it. When a student slips, a tutor explains the misconception, shows a worked solution and a physics diagram, then serves a follow-up question on the same concept in a new context. Mastery updates from real performance.

```
Study material → concept extraction → personalized quest → answer check (app code)
   → misconception diagnosis → targeted teaching → follow-up question → mastery update
```

## Multiple game worlds

Like the Arivihan games project this was modelled on, every quest can be played in several worlds. All worlds are skins over one question engine with one scoring rule; a world never decides correctness.

| World | One question builds… |
|---|---|
| 🎯 Quest Arena | one checkpoint (focused card layout) |
| 🎈 Balloon Pop | one balloon; the right one floats up, a wrong pick pops |
| 🚀 Rocket Launch | one rocket stage; ignition on the last correct answer |
| 🧭 Maze Escape | one gate; the explorer advances on a correct answer |
| 🫧 Bubble Lab | one bubble; a beaker fills as you go |
| 🏰 Castle Defense | one wave; correct answers fire the cannon, mistakes raise a shield |

Answer options are always also rendered as an accessible radio group (keyboard: A–D or 1–4, Enter to submit).

---

## Design

The interface follows Apple's design approach, translated for the web (see [docs/design-system.md](docs/design-system.md)):

- **System typography** (SF Pro on Apple devices) with per-size tracking and leading; game numbers in SF Rounded.
- **Semantic system colors** that switch between light and dark with the OS, indigo as the single accent.
- **Translucent materials** for the nav bar, status bar, sheets and dialogs, with scroll-edge fades instead of dividers.
- **Springs everywhere**: critically damped by default; a little bounce only after a flick.
- **Instant press feedback**, and motion that enters and leaves along the same path; dialogs grow from the button that opened them.
- **A real gesture on phones**: the feedback and lesson panels are a draggable bottom sheet (peek / medium / large) with 1:1 tracking, momentum projection, rubber-banding and velocity hand-off, so students can pull it down to watch their game world react.
- **Accessibility**: honors reduced motion (cross-fades), reduced transparency (solid surfaces) and increased contrast.

## Quick start

Requirements: Node.js 22+, npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

With no environment variables the app runs in **demo mode**:

- The prepared **Physics · Collisions** quest (6 concepts, 14 hand-checked questions, 10 per run) is fully playable.
- Wrong answers open a **prepared lesson**; "Try a similar question" uses **deterministic template generators** (new numbers and context, validated by the same checks).
- Uploads are validated and stored locally, but analysis returns a clear "AI isn't configured" message with a link to the demo.
- Every piece of content is labelled with its origin: *Prepared demo content*, *Template-generated*, or *AI-generated · validated*. Nothing mocked is presented as model output.

Production build:

```bash
npm run build && npm start
```

## Environment variables

See [.env.example](.env.example). The important ones:

| Variable | Purpose |
|---|---|
| `GOOGLE_GENAI_USE_VERTEXAI=true` | Use Gemini on Vertex AI |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | Vertex AI project and location (default `us`; the `global` endpoint returned 404 in testing) |
| `GEMINI_MODEL` | Default `gemini-3.5-flash`. Gemini 2.5 models retire on Vertex AI on 2026-10-20. |
| `GEMINI_API_KEY` | Alternative to Vertex AI (Gemini API) |
| `QL_DB=firestore` | Use Firestore instead of the local JSON store |
| `GCS_BUCKET` | Private Cloud Storage bucket for uploads and generated assets |
| `QL_ENABLE_VIDEO`, `VEO_MODEL` | Optional Veo teaching videos (Vertex AI + bucket required) |
| `QL_FORCE_DEMO=true` | Force demo mode |

Secrets never reach the browser: all AI, storage and database access happens in route handlers. Auth uses Application Default Credentials (`gcloud auth application-default login` locally, the service account on Cloud Run).

## Google Cloud setup

1. Enable Vertex AI, Firestore, Cloud Storage, Cloud Run, Cloud Build and Artifact Registry.
2. Create a Firestore database in Native mode and a **private** bucket (uniform access, public access prevention).
3. Create a service account with `roles/aiplatform.user`, `roles/datastore.user`, `roles/storage.objectAdmin` on the bucket, and `roles/iam.serviceAccountTokenCreator` on itself (for short-lived signed URLs).

[scripts/deploy-cloud-run.sh](scripts/deploy-cloud-run.sh) does all of this and deploys:

```bash
PROJECT_ID=my-project REGION=asia-south1 ./scripts/deploy-cloud-run.sh
```

The [Dockerfile](Dockerfile) builds a Next.js standalone server listening on `$PORT` (8080). On Cloud Run, use `QL_DB=firestore` and `GCS_BUCKET`; the local store is for development only and is not shared between instances.

---

## Architecture

Next.js 16 (App Router, React 19, TypeScript, Tailwind v4) for both UI and backend route handlers. One deployable service.

```
src/
  app/                      pages + /api route handlers
  components/game/          quest player, tutor panel, 6 worlds
  components/viz/           deterministic physics visuals (collision, bounce, momentum bars)
  lib/
    ai/                     Gemini client (timeouts, retries, schema repair, audit), prompts, workflows
    validation/             unit/dimension-aware evaluator, physics invariants, question validator
    engine/                 mastery, XP/levels/achievements, adaptive selection
    demo/                   prepared Collisions chapter + parametric follow-up generators
    services/               play loop, tutor, material pipeline, progress
    db/ storage/            local JSON ⇄ Firestore, local disk ⇄ Cloud Storage
```

### AI workflow (focused, not multi-agent theatre)

| Role | Implementation |
|---|---|
| Material Analyst | `transcribeMaterial` (multimodal: images/PDF → per-page transcript, readability) + `extractChapter` (concepts, formulas, examples, `fromNotes` vs added knowledge, uncertain parts) |
| Question Designer | `designQuestions`: structured output with misconception-labelled distractors and a `calc` spec for numerical questions |
| Question Validator | Deterministic checks first, then an **independent-solve review**: a second model call answers each question *without* the key; disagreement, ambiguity or factual problems reject the question. One replacement round with rejection feedback. |
| Personalized Tutor | `tutorExplain` + `tutorFollowUp`, given the student's choice, the known misconception, prior misconceptions and a source excerpt. Never allowed to change the answer key. |

The tutor uses narrowly scoped tool functions (`getSourceContent`, `getQuestion`, `getStudentAttemptHistory`, `saveLearningAsset`) with authorization in app code. The model never writes records or awards XP. Google ADK was considered and not used: the workflow is linear and latency-sensitive, so plain typed functions were simpler and easier to validate.

Every model call is audited (operation, model, input ids, outcome, retries, duration) in the `audit` collection, without prompts, student text or credentials.

### Deterministic validation

A question reaches a student only if all of these pass ([questions.ts](src/lib/validation/questions.ts)):

- Schema, sequential option ids, unique option text, exactly one correct option, no "all/none of the above".
- Distractor feedback only on wrong options; answer not leaked in the stem; no near-duplicates (Jaccard ≥ 0.8).
- **Numerical questions**: the expression is re-evaluated by a safe evaluator with **dimensional analysis** (kg, m, s, N, J, kg·m/s, km/h, …). The answer unit must match dimensionally, the keyed option must match within tolerance, and no distractor may also match.
- **Collision questions**: momentum conserved, kinetic energy not created, 0 ≤ e ≤ 1.

### Adaptive engine

- Two correct in a row (no hint) → difficulty steps up. Two misses in a row, or two misses on one concept → steps down.
- Next question: closest to target difficulty, then weakest concept, avoiding the same concept back-to-back.
- After a miss: the tutor opens; the follow-up is the same concept in a new scenario. Repeated struggle → simpler (analogy-first) lesson and an easier follow-up.
- The quest screen shows **"Why this question"** and the results page shows the full adaptation timeline.

### Mastery (transparent, configurable)

[mastery.ts](src/lib/engine/mastery.ts):

```
mastery = (Σ wᵢ·sᵢ + 0.3·2) / (Σ wᵢ + 2)        over the last 8 results
sᵢ = 1 correct · 0.5 correct with hint · 0 wrong
wᵢ = 0.8^age × 1.5 (follow-up) × {0.8 easy, 1 medium, 1.25 hard}
Mastered ≥ 85% and ≥ 4 attempts · Proficient ≥ 70% and ≥ 3 · Developing ≥ 45%
```

The prior means one correct answer can never read as mastery. This is a practice guide, not a validated psychometric score.

### Gamification (server-validated)

Correct +100 XP · hint −40 · streak bonus +10 per consecutive correct (cap +50) · fixed mistake +50 · quest completion +150 (+100 perfect). Levels start at 150·n·(n−1) XP. Achievements (First Quest, Five in a Row, Mistake to Mastery, Physics Explorer, Chapter Conqueror, World Hopper) are computed from stored activity. No lives: mistakes lead to teaching, not game over.

---

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Health + AI/DB/storage mode |
| POST | `/api/materials` | Multipart upload (PDF/JPG/PNG) + quest settings |
| GET/DELETE | `/api/materials/:id` | Processing status / delete material and all derived data |
| POST | `/api/materials/:id/analyze` | Reading + concept extraction (resumes from checkpoints) |
| POST | `/api/materials/:id/generate-quest` | Generate, validate, assemble (idempotent, no duplicate quests) |
| GET | `/api/materials/:id/files/:index` | Owner-only file access (signed URL on GCS) |
| GET | `/api/quests/:id` | Quest summary (no answer keys) |
| POST | `/api/quests/:id/start` | Start a session (`world`, optional `practiceConceptIds`) |
| POST | `/api/quests/:id/answer` | Score on the server; idempotent per (session, question) |
| POST | `/api/quests/:id/hint` | Reveal a hint (recorded server-side) |
| GET | `/api/sessions/:id` | Resume a session |
| POST | `/api/sessions/:id/next` | Adaptive next question or completion |
| GET | `/api/sessions/:id/results` | Results |
| POST | `/api/concepts/:id/explain` | Targeted explanation (AI → prepared fallback) |
| POST | `/api/concepts/:id/follow-up` | Validated follow-up (AI → template → unplayed question) |
| POST/GET | `/api/concepts/:id/video` | Optional Veo job start / poll |
| GET | `/api/progress` | Mastery and activity |
| DELETE | `/api/me` | Delete all of this guest's data |

Errors are `{"error": {"code", "message", "retryable"}}` with proper status codes. Stack traces and provider errors are logged, never returned. Expensive operations are rate-limited per guest.

## Privacy and safety

- Guest identity is an opaque random id in an httpOnly cookie. No name, email or other personal data is collected.
- File type is detected from magic bytes; size, count, page and dimension limits are enforced; images are EXIF-oriented and resized; corrupted or password-protected PDFs are rejected with a clear message.
- Uploads are private: owner-checked API access locally, short-lived signed URLs on GCS.
- Students can delete one upload or all of their data.
- Prompts require age-appropriate language, honest uncertainty, and never inventing content from unreadable notes (the pipeline asks for a clearer photo instead).

---

## Testing

```bash
npm test            # vitest: 63 tests
npm run typecheck
npm run lint
npm run eval        # evaluation report → eval/results/latest.{json,md}
```

The tests cover validation, units and physics invariants, every demo question, all template generators across seeds, file ingestion (valid and invalid images and PDFs), and the full learning loop. The three adaptive cases are tested explicitly: correct answers raise difficulty; wrong → lesson → follow-up correct raises mastery; repeated struggle simplifies the lesson and lowers follow-up difficulty. Idempotent answers, authorization, quest completion, results and practice sessions are covered too. With a mocked Gemini client, the tests also check that wrong keys, unit errors and reviewer disagreement are rejected, that a failed pipeline resumes without duplicating the quest, that unreadable uploads are refused, and that the tutor falls back honestly.

### Evaluation

[scripts/eval.ts](scripts/eval.ts) runs on [eval/dataset.json](eval/dataset.json), which has four chapter excerpts (Physics ×2, Chemistry, Biology) with expected concepts. Deterministic metrics always run. Gemini metrics (extraction recall, acceptance rate, answer-key rejections, duplicate rate, source grounding, distractor labelling, tutor validity and key-consistency, follow-up relevance) run only with credentials.

Measured on 2026-10-17 in demo mode (no credentials, so the Gemini section was skipped):

| Metric | Result |
|---|---|
| Demo questions passing validation | 14/14 (100%) |
| Demo numerical answers recomputed | 100% |
| Template follow-ups generated (720 attempts) | 100% produced, 100% valid |
| Wrong options with a misconception label | 100% |
| Exact-duplicate pairs within one generator cell (40 seeds) | 2.3% (sessions also pass an avoid-list, so repeats are filtered in play) |
| Follow-ups that are near-copies of the missed question | 0% |

Gemini quality numbers have **not** been measured yet. Run `npm run eval` with credentials to produce them.

## Demo script (≈3 minutes)

1. **Landing:** the hero shows the real quiz UI with the collision question.
2. **Upload** (with credentials): drop photos of collision notes on `/create`. The four stages report real server state, then the chapter preview shows detected concepts, formulas and anything unreadable.
3. **Play:** pick a world (e.g. Rocket Launch). Answer a concept question correctly: XP, streak, a new rocket stage, and "Why this question" explains the next difficulty.
4. **Mistake:** on the elastic collision question, pick "both move at u/2". The tutor names the misconception (*elastic treated as inelastic*), shows the animated before/after diagram with the conservation check and a worked solution.
5. **Follow-up:** "Try a similar question" gives a new scenario on the same concept; answer it to see "Mistake fixed!", recovery XP and the mastery change.
6. **Results:** accuracy, mastery by concept, the adaptation timeline, achievements and *Practice Weak Concepts*.

## Known limitations

- The Gemini, Firestore, Cloud Storage and Veo code paths are written against the installed SDKs and covered by mocked tests, but were **not exercised against live Google Cloud** in this environment (no credentials). Run the eval and a test upload after configuring.
- Veo video generation is off by default and needs a `VEO_MODEL` your project can access.
- Rate limits and the per-session lock are per instance. Answer idempotency across instances relies on Firestore `create()` with deterministic attempt ids.
- Only single-answer MCQ is playable. The question schema is a discriminated type, so new types can be added.
- Template follow-ups exist for physics collision concepts. For other subjects, follow-ups come from Gemini, or from an unplayed question on the same concept.
