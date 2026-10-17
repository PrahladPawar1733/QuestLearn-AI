# Spoken audio and video lessons

**Written 2026-10-17.** Design only — no code in `src/` is changed by this document, and
**no Gemini, Veo or TTS call was made while writing it.** Every latency, quota and format
claim is either quoted from [`docs/gemini-models.md`](./gemini-models.md) (which measured
them against the live API) or from official Google docs with the URL. Every claim about
this repo cites `file:line`.

The student's ask, verbatim: *"cant we add audio as well a today we will collision move
your car and audio lectures in this as well and some checkpoints something and videos
suggest"*. Read generously, that is four things: a spoken session intro, audio lessons,
checkpoints, and video. Three of the four are buildable today. One is not.

---

## Headline recommendation

**Build "narrated scenes": the deterministic visuals we already have
(`src/components/viz/collision-diagram.tsx`, `bounce-diagram.tsx`, `momentum-bars.tsx`),
driven by a short pre-generated narration track and a caption list, with a question
checkpoint that pauses playback and branches on the answer.**

This is a video lesson in everything a student cares about — it moves, it talks, it stops
and asks you something, it carries on differently depending on what you said — while
being the only version of that idea that is buildable on this key, costs nothing per
playback, and cannot be wrong. `CollisionDiagram` recomputes the final velocities itself
from `(m1, m2, u1, u2, e)` via `collide1D` and never takes them from model output
(`src/components/viz/collision-diagram.tsx:21-28`). A generated clip offers no such
guarantee, and Veo returns `429 limit: 0` on this key anyway
(`docs/gemini-models.md:265-288`).

Everything else in this document is support for that one thing.

---

## 1. What audio earns its place

The test I applied to each candidate: **would a 15-year-old with headphones on, mid-lap,
leave this playing the second time they hear it?** Audio that duplicates text the student
is already reading fails that test instantly. So does anything that congratulates them.

| Candidate | Verdict | Reason |
|---|---|---|
| **Session intro** — "Today you're on collisions. Move your car with the arrows; every gate asks what happens when two things hit." | **KEEP** | This is the student's actual request and it is the single best place for speech in the whole app. It plays on the lobby/`"ready"` screen (`src/components/games/car-rush/car-rush-player.tsx:46`, `Screen = "ready"`), where the student is stationary, reading nothing urgent, and waiting for a tap. It is heard once per session. It sets the frame — *what am I doing and why* — which is the one thing the HUD cannot say. |
| **Concept micro-lesson before play** | **KEEP, but opt-in and never on the path to the start button** | As a narrated scene (§6) reachable from the lobby and from the tutor panel. Auto-playing 40 seconds of lesson between "Start race" and driving is the fastest way to get the app muted permanently. The student came to drive. Teach at the checkpoint, where they already stopped. |
| **Checkpoint result narration** — "Correct!" / "That's not right" | **CUT** | Strictly worse than what already ships. `sfx.answerCorrect()` and `sfx.answerWrong()` (`src/lib/game/audio/sfx.ts:395,408`) convey the verdict in ~150 ms, are already wired at `car-rush-player.tsx:344-345`, cost nothing, and never speak over the student reading the result. A spoken "correct" arrives *after* the tick mark they already saw. |
| **Misconception explanation, per wrong option** | **CUT as narration** | Combinatorially unaffordable: a 10-question quest has ~30 distractors (`Question.distractorFeedback`, `src/lib/types.ts:174`), and the free key allows 20 TTS requests/day/model *in total*. It also duplicates text the student is actively reading — `TutorBody` already renders `t.whyWrong` and the misconception badge (`src/components/game/tutor-panel.tsx:113-120`). |
| **Misconception explanation, per concept ("the trap on this idea")** | **KEEP** | One line per concept, authored at quest-creation time from the concept's distractor labels. This is the one genuinely high-value spoken sentence in the lesson: naming the trap out loud, in a voice, lands differently from reading it. It is bounded (3-8 concepts, `src/lib/ai/prompts.ts:21`) and cacheable. |
| **Encouragement after a miss** — "Nice try, keep going!" | **CUT. Hard.** | Content-free, unavoidably repetitive, and the canonical mute trigger for this age group. Varying the wording does not save it; a 16-year-old hears the second variant as a script and the third as condescension. The honest substitute already exists: the earcon, plus the misconception *named* in writing. Naming what went wrong is the encouragement. |
| **End-of-run recap** | **KEEP, outcome-neutral, one line** | Plays over the run summary (`src/components/games/car-rush/run-summary.tsx`), where the student is stationary again. It must be pre-generated per quest, which means it cannot name their score — so it doesn't try: it points at the summary instead ("your summary shows which concept to redo — the one with the lowest bar"). The numbers are on screen; speech is bad at numbers anyway. |
| **Hint narration** | **CUT** | A hint is already ≤400 characters of text the student requested and is reading (`Question.hint`, `src/lib/types.ts:175`; served by `LearningDirector.hint()`, `src/lib/game/learning.ts:172`). Speaking it adds 4 s of latency to the most time-sensitive moment in the app. |
| **Question and option text read aloud** | **KEEP — but never via Gemini TTS** | This is the one accessibility-critical read-aloud, and it must work for arbitrary text, instantly, offline, unlimited. That is the browser's `window.speechSynthesis`, not a 4-second cached API call. Zero quota, zero cost, works on every question including AI follow-ups generated mid-session (`tutorFollowUp`, `src/lib/ai/workflows.ts:372`). Gemini TTS is reserved for *authored, cacheable, performance-critical* lines. |

### Never audio-gated — non-negotiable

1. **Nothing waits for audio.** The checkpoint card is interactive the instant it renders.
   The submit button is never disabled because narration is playing or loading. There is no
   state in which "the voice hasn't finished" blocks an answer.
2. **Correctness is never audio-only.** The game "never decides correctness"
   (`src/lib/game/types.ts:5-9`) and the audio layer gets even less authority than the game:
   it may *restate* a server verdict, never carry it. If audio and screen ever disagree, the
   screen is right.
3. **No audio prerequisite to start.** `CarRushGame.start()` already unlocks audio and
   tolerates failure — `void gameAudio.unlock().then((ok) => { if (!ok || this.disposed)
   return; … })` (`src/components/games/car-rush/game.ts:273-276`). The race starts whether
   or not the context resumed. Narration inherits that: `isAudioReady()` returning false
   (`src/lib/game/audio/context.ts:173`) is a normal, silent, fully-functional mode.
4. **No duplicate reading.** Narration never reads the tutor panel body, the question stem,
   the option text or the hint. Those are on screen and the student is faster than the voice.
5. **No spoken-only instructions or warnings.** Controls, "you're offline"
   (`car-rush-player.tsx:14`, `WifiOff`), quota notices and error states are text first.
6. **Nothing that makes the quest-creation pipeline fail.** Narration is prepared inside the
   existing `"preparing"` stage (`src/lib/services/materials.ts:195`) in a try/catch that can
   only ever downgrade narration to `unavailable` — never move the material to `"failed"`.

---

## 2. The hard constraint: latency and quota

### The arithmetic

From the measured table (`docs/gemini-models.md:294`): `gemini-3.8-flash-lite-tts` returned
`audio/wav` in **4.04 s** for 27 input tokens → 263 audio tokens → **511,074 bytes**. At
24 kHz / 16-bit / mono (48,000 B/s, per
<https://ai.google.dev/gemini-api/docs/speech-generation>) that is **10.6 s of speech**, i.e.
~25 audio tokens and ~0.5 MB per second-of-speech-decade, and **~1 call ≈ 1 line**.

Google no longer publishes per-model RPD (`docs/gemini-models.md:398-405`); the working
assumption for this key is **20 requests/day/model**, and the key is free tier
(`docs/gemini-models.md:84`).

Therefore:

- **On-demand narration during play is impossible.** 4 s is longer than the entire
  checkpoint interaction, and 20/day is less than one session's worth of checkpoints.
- **On-demand narration during the tutor panel is also impossible.** It would race the
  tutor call itself (11.7 s measured, `docs/gemini-models.md:106`) for the same 20-request
  budget that question generation and review already compete for.
- **Everything spoken must be generated before the student can possibly hear it, or not at
  all.**

### What gets pre-generated, and when

One window exists where the student is already waiting and knows it: the quest-creation
progress screen. `generateQuestForMaterial` saves `stage: "preparing"` at
`src/lib/services/materials.ts:195` and `stage: "ready"` at `:216`; the create flow polls
and renders a labelled stage list (`src/components/create/create-flow.tsx:57,173-187`).
Question generation alone is 13.1 s at `thinkingLevel: "low"` (`docs/gemini-models.md:104`),
so the student is already on that screen for 30-60 s. Six sequential TTS calls add ~24 s to
a screen that is honest about being slow.

Narration is prepared there, after questions are accepted and before `"ready"`.

### The per-quest budget: **6 TTS calls**

| Tier | Slot | Calls | Why this and not more |
|---|---|---|---|
| **A** | `intro` — session intro | 1 | The student's actual request; heard once per *session*, so it amortises over every replay of the quest. |
| **A** | `outro` — end-of-run line | 1 | Same: once per session, reused forever. |
| **B** | `scene--{conceptKey}--0..2` — three cues of one narrated scene | 3 | One flagship concept gets a real lesson. Cue-per-call is deliberate: each clip's exact length comes from `AudioBuffer.duration`, so the visual advances on a real boundary instead of a guessed timestamp. Three cues is a complete teaching arc (setup → the move → the result) and ~30 s total. |
| **C** | retry reserve | 1 | One 503 (`docs/gemini-models.md:390`) must not cost a slot. |
| | **Total** | **6** | |

Flagship-concept selection is deterministic, computed in app code, no model call: the
concept with the most accepted questions; ties broken by `fromNotes === true`
(`src/lib/types.ts:315`), then by order in `ExtractedContent.concepts`
(`src/lib/types.ts:246`).

**Against a 20/day allowance that is 3 quests per day, with 2 requests spare.** That is the
real number and the UI must say so when it runs out, rather than looking broken. Narration
also competes with nothing else: TTS quota is per-model
(`generate_content_free_tier_requests, … model: …`, `docs/gemini-models.md:308-311`), and no
other code path uses a `*-tts` model.

Bytes: 6 clips × ~450 KB ≈ **2.7 MB per quest**, stored once, served from our own storage.
Cost if billing is ever enabled: at the flagship's $9.00/1M audio-output rate
(`docs/gemini-models.md:111`), 263 tokens ≈ $0.0024/clip ≈ **$0.014 per quest**. The lite
model has no published per-token price (`docs/gemini-models.md:472`).

### Storage and IDs

Reuse `src/lib/storage/index.ts` unchanged — `blobs().put(key, data, contentType)` works
against local disk or GCS depending on `config.storageMode` (`src/lib/config.ts:48-50`), and
`safeKey()` (`src/lib/storage/index.ts:19-23`) already rejects traversal.

```
asset id    narration__{questId}__{slot}
blob key    users/{uid}/materials/{materialId}/narration/{questId}/{slot}.wav
slot        intro | outro | scene--{conceptKey}--{cueIndex}
```

Two deliberate choices:

- **The id follows `tutor__{sessionId}__{questionId}`** (`src/lib/services/tutor.ts:111`)
  rather than `video__{uid}__{conceptId}` (`src/lib/services/video.ts:27`). `questId` is
  `newId("qst")` — 14 chars of base36 (`src/lib/ids.ts:3-8`) — so it is unguessable, and the
  serving route still checks `asset.ownerId === uid` regardless.
- **The blob key sits under `users/{uid}/materials/{materialId}/`** so that the existing
  ``blobs().delete(`users/${uid}/materials/${m.id}`)`` call in `deleteMaterial`
  (`src/lib/services/materials.ts:233`) already cleans it up. *Note for the lead:* today's
  video path `users/${uid}/videos/${conceptId}/` (`src/lib/services/video.ts:35`) is
  **outside** that prefix and `deleteMaterial` never deletes `assets` rows
  (`:230-249` touches questions, sessions, attempts, concepts, mastery, materials — not
  assets), so generated video blobs and asset rows leak on material deletion. Narration must
  not repeat that; `deleteMaterial` needs an `assets`-by-`questId` sweep.

### Caching and invalidation

The script is the artifact of record; the audio is derived from it. So the cache is
content-addressed on the words:

```ts
scriptHash = sha256(`${model}\n${voice}\n${style}\n${text}`).slice(0, 16)
```

stored on the asset. On read: if the asset is `ready` and its `scriptHash` equals the hash
recomputed from today's templates, serve it. If the hash differs (template edited, voice
changed, model changed), the asset is stale → regenerate **if budget allows**, otherwise
serve the *new* caption text with no audio. Captions never go stale, because they are
regenerated from the same template for free.

Invalidation triggers, all cheap and local:

| Trigger | Effect |
|---|---|
| Script template edited (a deploy) | `scriptHash` mismatch → stale → regenerate lazily, within budget |
| `QL_TTS_VOICE` or `GEMINI_TTS_MODEL` changed | included in the hash → same path |
| Quest regenerated | new `questId` → new ids, old ones orphaned and swept with the material |
| Material deleted | blob prefix + asset sweep (above) |
| Concept retitled | `conceptKey` is part of the slot → new slot, old one orphaned |

### The daily budget must be durable, not in-memory

`src/lib/ratelimit.ts` is explicitly a per-instance sliding window and says so:
*"On Cloud Run with several instances this is a per-instance limit… Use a shared store for
strict quotas"* (`src/lib/ratelimit.ts:4-8`). A 20/day hard cap is exactly a strict quota, so
it goes in the db: one doc per UTC day, incremented under the existing lock primitive
(`db().withLock`, used at `src/lib/services/tutor.ts:170`).

```
collection "quotas", id `tts__{YYYY-MM-DD}`, { count, limit }
```

`reserveTtsCalls(n)` returns how many it could actually grant (0..n) and the preparer only
makes that many calls. A 429 whose message contains `limit: 0` or `free_tier`
(`docs/gemini-models.md:409`) burns the day's remaining budget immediately and records
`generationStatus: "unavailable"` — never retried, because that 429 arrives in 0.26-0.47 s
and is a capability gap, not throttling (`docs/gemini-models.md:388`).

### Fallback is silence plus text, always

`LearningAsset.generationStatus` already has exactly the state we need:
`"pending" | "processing" | "ready" | "failed" | "unavailable"` (`src/lib/types.ts:486`).
`"unavailable"` means *we chose not to spend quota*, `"failed"` means *we tried and it
broke*. Both render identically to the student: the full caption text, no audio control, no
error. See §7.

---

## 3. Voice and script design

### Register

The prompts already set the frame — *"learning app for high-school students aged 14-18.
Use clear, encouraging, age-appropriate language"* (`src/lib/ai/prompts.ts:3-4`). For
**spoken** lines that is not enough, because tone that reads as neutral on screen reads as
either sarcastic or saccharine when performed. Four rules:

1. **Say the thing, then stop.** No preamble ("So, let's take a look at…"), no sign-off.
2. **Second person, present tense, declarative.** "You kept the minus sign." Not "Remember
   that we must always keep the minus sign!"
3. **Never praise the student; name what they did.** "You kept the sign" beats "Great job!"
   — it is specific, it is true, and it is repeatable without wearing out.
4. **No exclamation marks, no "awesome", no "oops", no "don't worry".** These are a
   blocklist in the script tests (§8), not a style note.

### The eight scripts

Each is the literal text that would be sent to the TTS model.

| Slot | Script | Words |
|---|---|---|
| Physics session intro | **"Today you're on collisions. Move your car with the arrows — every gate asks what happens when two things hit."** | 20 |
| Biology chapter intro | **"This one's cell transport. Four gates: diffusion, osmosis, active transport, and how a membrane chooses what gets through."** | 18 |
| Correct answer (inside a scene) | **"Right. You kept the minus sign on the left-moving mass, and that's the whole trick here."** | 16 |
| Wrong answer, misconception named | **"Not that one. You added the speeds as if direction didn't matter — momentum keeps the sign."** | 16 |
| Wrong answer, second miss (simplified) | **"Slow down a second. Forget the numbers — which way does the pair end up moving?"** | 15 |
| Hint (scene only, never at a checkpoint) | **"Write both velocities with a sign first. Left is negative. Then add the two momenta."** | 15 |
| Scene cue 1 — setup | **"Three kilograms moving right at six. Two kilograms moving left at four. Watch the signs, not the speeds."** | 18 |
| Scene cue 2 — the move | **"Total momentum is eighteen minus eight, so plus ten. That ten has to survive the crash."** | 16 |
| Scene cue 3 — the result | **"They stick together, so five kilograms carries plus ten. Ten over five is two metres per second."** | 17 |
| End-of-run recap | **"That's the run. Your summary shows which concept to redo — it's the one with the lowest bar."** | 18 |

**Why under 25 words.** Three independent reasons that happen to agree. (a) Measured:
27 input tokens produced 10.6 s of audio; a 25-word line at ~160 wpm is ~9 s, so one line is
one clip, ~450 KB, one `AudioBufferSourceNode`, one cache entry — the whole pipeline stays
one-to-one. (b) Attention: past ~10 s of uninterrupted speech over gameplay, a teenager
either mutes or stops listening, and a line that is half-heard is worse than silence because
the caption has already scrolled. (c) Interruptibility: a short line can be cut at a sentence
boundary when a checkpoint fires (§4); a 60-second monologue cannot be cut anywhere without
sounding broken.

**Numbers are spelled out in words** ("three kilograms", "eighteen minus eight") because the
model is being asked to *speak*, and because the digits are already on screen in the diagram
(`CollisionDiagram` renders `fmt()`-formatted labels,
`src/components/viz/collision-diagram.tsx:16-19`). Speech carries the reasoning; the picture
carries the data.

**Scripts are written by app code, not by Gemini.** A new `src/lib/narration/scripts.ts`
fills these templates from `ExtractedContent` (`src/lib/types.ts:241-269`) and the accepted
`Question`s. This saves a generation call per quest, makes every spoken word reviewable in a
diff and unit-testable for length and tone, and removes any possibility of the voice
asserting something the notes don't support — the exact failure mode
`docs/gemini-models.md:190-208` documents for transcription. **The TTS call is the only model
call in the narration path.**

### Voice and config

| Setting | Value | Why |
|---|---|---|
| Model | `gemini-3.8-flash-lite-tts` | Verified working on this key; 4.04 s vs 5.06 s flagship, and both return a ready-to-serve RIFF WAV (`docs/gemini-models.md:294-299`). |
| Voice | `Kore` ("Firm") | Of the 30 prebuilt voices (<https://ai.google.dev/gemini-api/docs/speech-generation>), the register above rules out the bright ones — `Puck` is documented as "Upbeat", which is precisely the patronising read. `Kore` is the closest to a calm older sibling. `Charon` is the fallback if `Kore` tests as too flat. |
| Output | `audio/wav`, 24 kHz mono | Default for unary requests; the 3.8 models return a RIFF header, unlike the 2.5 preview which returns headerless PCM you must wrap yourself (`docs/gemini-models.md:296-299`). |
| Style | per-slot `speech_metadata` annotation | e.g. intro: `"calm and matter-of-fact, like a coach before a race"`; wrong-answer: `"level and kind, not disappointed"`. |

Request shape per current docs:

```jsonc
{
  "contents": [{ "parts": [{ "text": "<script>" }] }],
  "generation_config": {
    "speech_config": [{ "voice": "Kore" }],
    "response_format": { "type": "audio", "mime_type": "audio/wav", "sample_rate": 24000 }
  }
}
```

Caveat worth carrying: the legacy
`speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` shape **still worked** when
measured, even though the docs now show the `speech_config` array
(`docs/gemini-models.md:300-302`), and the `@google/genai` version pinned in
`package.json` (`^2.30.0`) decides which shape actually goes on the wire. The speech
service must therefore be written against the SDK's typed surface and smoke-tested once
after any SDK bump — not hand-rolled against one of the two documented shapes.

**Where it is configured:** `src/lib/config.ts`, following the existing `GEMINI_*` (model
identity) / `QL_*` (app behaviour) split and the getter style at `src/lib/config.ts:29-41`:

```ts
get ttsModel()        { return process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-lite-tts"; },
get ttsVoice()        { return process.env.QL_TTS_VOICE ?? "Kore"; },
get ttsEnabled()      { return bool(process.env.QL_ENABLE_TTS) && this.aiMode !== "demo"; },
get ttsPerQuest()     { return Number(process.env.QL_TTS_PER_QUEST ?? 6); },
get ttsDailyBudget()  { return Number(process.env.QL_TTS_DAILY_BUDGET ?? 18); },
```

Default `18`, not `20`, so a manual test or a retry storm cannot consume the student's
last slot. `publicStatus()` (`src/lib/config.ts:69-78`) gains
`narrationEnabled: config.ttsEnabled` so the client can hide the control rather than
render a dead one.

---

## 4. Ducking and mixing with gameplay

### One new bus, not a parallel mixer

`BusName` is `"engine" | "sfx" | "ui" | "music" | "ambience"`
(`src/lib/game/audio/context.ts:17`) with per-bus headroom at `:22-28` and a shared
limiter (threshold −10 dB, knee 12, ratio 6, attack 4 ms) at `:136-140`. Narration adds
**one bus: `"voice"`**, default gain `0.95` — narration must sit above everything, and the
limiter catches the sum.

Adding it is backward-compatible with stored prefs *without* a version bump: `loadPrefs()`
iterates `BUS_NAMES` and only overrides a default when the stored value is a number
(`src/lib/game/audio/context.ts:76-81`), so an old `ql.audio.prefs.v1` blob simply has no
`voice` key and the default applies. No migration, no `v2`.

The payoff is the setting students will actually use: `setBusVolume("voice", 0)`
(`:209-216`) is "narration off, sound on" — distinct from `setMuted(true)` (`:226`) and from
the global kill switch `setEnabled(false)` (`:238`). `car-rush-player.tsx:136-137,146-148`
already pushes `musicVolume`/`sfxVolume` prefs into buses; a `narrationVolume` pref follows
the identical path, and the pause dialog gets a third slider next to the two at `:689`.

### The duck

Narration lives in a new `src/lib/game/audio/narration.ts` — same shape as `sfx.ts`:
`"use client"`, guarded, never throws, no module-load access to `window`. Signal chain:

```
AudioBufferSourceNode → GainNode (20 ms in / 40 ms out, kills the WAV edge click) → getBus("voice")
```

Exactly one narration voice, like `answer: 1` and `nitro: 1` in the sfx caps
(`src/lib/game/audio/sfx.ts:23,27`); a second `speak()` cross-fades the first out over 80 ms.

| Bus | Duck factor | ≈ dB | Attack | Release | Why |
|---|---|---|---|---|---|
| `music` | ×0.22 | −13 | 0.18 s | 0.40 s | The generative bed is pure mood; it loses most. |
| `engine` | ×0.55 | −5.2 | 0.25 s | 0.40 s | **Never below ×0.5.** The engine note *is* the speed cue the student steers by — `game.ts:718` drives `updateEngine` from real `rpm`/`load`/`speed` every frame. Silencing it is a gameplay change, not a mix change. Slower attack, because a fast duck on a sustained tonal source is audible as a pump. |
| `ambience` | ×0.30 | −10.5 | 0.18 s | 0.40 s | Wind bed (`sfx.ts:246,268`); nothing is lost. |
| `sfx` | ×0.80 | −1.9 | 0.12 s | 0.25 s | Only a trim. A muffled collision reads as a bug, not as politeness — `sfx.collision(hit.severity)` fires on real contact (`game.ts:450`) and must stay legible. |
| `ui` | ×1.00 | 0 | — | — | Taps are feedback for the student's own finger. Never duck feedback. |

Asymmetric by design: attack faster than release so the first word isn't buried, release
slower so the mix doesn't pump back up between two cues. The release has a **250 ms hold** —
it only fires when the narration queue is empty *and* nothing new started — so a three-cue
scene ducks once, not three times.

Mechanism: `rampParam(param, target, seconds, now)`
(`src/lib/game/audio/util.ts:55-61`), which anchors at the current value with
`cancelScheduledValues` + `setValueAtTime` before the linear ramp — documented as being
"for deliberate gestures (fades, blips) rather than tracking" (`:54`), which is exactly a
duck. Not `smoothParam` (`:50`), which is the every-frame primitive.

### The one required change to `context.ts`

A duck and a user volume change both write the same `AudioParam`, and `setBusVolume` ramps
to the raw pref (`context.ts:213`) — so a slider move mid-narration would undo the duck.
Both paths must funnel through one applier:

```ts
const duck: Record<BusName, number> = { engine: 1, sfx: 1, ui: 1, music: 1, ambience: 1, voice: 1 };

function applyBus(name: BusName, seconds = VOLUME_RAMP): void {
  const rt = runtime;
  if (!rt) return;
  rampParam(rt.buses[name].gain, loadPrefs().buses[name] * duck[name], seconds, rt.ctx.currentTime);
}

export function setBusDuck(name: BusName, factor: number, seconds: number): void {
  duck[name] = clamp01(factor);
  applyBus(name, seconds);
}
```

`setBusVolume` then calls `applyBus(name)` instead of ramping directly, and
`savePrefs()` still stores only the user's pref — a duck is never persisted.
`VOLUME_RAMP = 0.06` (`context.ts:32`) stays the default for slider moves.

### State transitions

| Event | Narration behaviour |
|---|---|
| **Checkpoint opens** (`host.onCheckpoint`, `game.ts:527` → `car-rush-player.tsx` sets `checkpoint`) | `stopNarration()` immediately — mid-word if necessary — and release the duck over 0.35 s. The question is the priority; the caption stays on screen so nothing is lost. A cut sentence is fine *because* captions exist. |
| **Student pauses** (`pause("user")`) | `game.ts:287` calls `gameAudio.suspend()` for `"user"`/`"finished"`, which freezes the whole context and would resume narration mid-word. So `stopNarration()` first, then suspend. On resume, restart from the **cue boundary**, never mid-clip. |
| **Tab hidden** (`pause("hidden")`, via the loop's `onAutoPause`, `game.ts:258-261`) | Same: stop, release duck. Do not resume automatically — unexpected speech on tab focus is startling. |
| **Checkpoint pause** (`pause("checkpoint")`) | Note this reason does *not* suspend the context (`game.ts:287` suspends only on `user`/`finished`), which is what makes narration *inside* a paused checkpoint possible at all. This is where narrated scenes play. |
| **Crash** (`sfx.collision()`, `game.ts:450`) | Do nothing. Keep narrating, keep the duck. `sfx` is only trimmed to ×0.8, so the crash is clearly audible over the voice — which is the correct priority for a physics game about collisions. |
| **Narration during driving** | Only the intro, and only before `start()`. Once the loop is running, the only speech is inside a paused checkpoint or scene. There is no "voice over gameplay" mode. |
| **`setEnabled(false)`** | `GameAudio.setEnabled` (`src/lib/game/audio/index.ts:166-174`) already stops skid and wind; it gains `narration.stop()` in the same block. |
| **`dispose()`** | `GameAudio.dispose()` (`index.ts:185-191`) gains `narration.dispose()` alongside `sfx.disposeSfx()`. |

---

## 5. Captions and accessibility

**The text is the artifact; the audio is derived from it.** That inversion is what makes
this section short: there is no separate captioning step, because the script *is* the
caption, generated by `src/lib/narration/scripts.ts` before any audio exists and stored
whether or not the audio ever does.

This is also the normal case, not the accessible edge case. Most students using this in a
classroom or on a bus will have audio off, and the mixer defaults mean the voice bus can be
zeroed independently (§4). A narrated scene with the voice at 0 must be a *complete* lesson:
visual + caption + Next button.

### Storage

Captions live in `LearningAsset.content`, which is already `z.unknown().optional()`
(`src/lib/types.ts:485`) — the same slot `explainMistake` uses for
`{ tutor, fallbackReason }` (`src/lib/services/tutor.ts:155`). No schema break:

```ts
export const NarrationContent = z.object({
  slot: z.string().max(80),
  text: z.string().max(400),          // the caption, verbatim; what the model was asked to say
  style: z.string().max(120),         // the speech_metadata annotation
  voice: z.string().max(40),
  model: z.string().max(60),
  scriptHash: z.string().length(16),
  durationMs: z.number().int().optional(),  // from the decoded buffer, after first playback
});
```

One record per clip means a clip can be `unavailable` while its caption is `ready`. That is
the normal degraded state and it has no error UI.

### Rendering

- **Caption line** under the scene: one cue at a time, same text as the audio, always
  visible — not a toggle. Toggled captions are off by default and therefore not a channel.
- **`aria-live="polite"` only while audio is driving the cues.** When the student advances
  manually there is no live region, because the change was their own action. The tutor panel
  already uses `aria-live="polite"` for its loading state
  (`src/components/game/tutor-panel.tsx:71`).
- **Full transcript** expandable under the scene, all cues in order, as static text. This is
  the printable form and the skim form.
- **`prefers-reduced-motion`** → scene never auto-advances and the diagram does not animate.
  `CollisionDiagram` already reads `useReducedMotion()` and starts paused
  (`src/components/viz/collision-diagram.tsx:26-34`) with its own play/pause control
  (`:3` imports `Pause, Play, RotateCcw`). The scene player honours the same signal.
- **Keyboard**: the whole scene is a sequence of buttons. Space/Enter advances, no
  pointer-only affordance, no timed-out control.
- **Read-aloud for arbitrary text** (question stems, options, tutor body) is
  `window.speechSynthesis`, offered as a small speaker button. Free, instant, works on
  AI-generated follow-ups, works offline, and respects the OS voice and rate the student has
  already configured — which a fixed Gemini voice cannot.

### Existing gap worth fixing while we're here

`TutorBody` renders a bare `<video src={state.url} controls />`
(`src/components/game/tutor-panel.tsx:232`) with **no `<track kind="captions">`**. Any real
video surface in this app needs a WebVTT track, which for a narrated scene is a trivial
serialisation of the cue list (we know each cue's exact duration from
`AudioBuffer.duration`), and for an uploaded video is a Gemini transcription job (§6a).

---

## 6. Interactive video lessons

The brief's three things are genuinely three different things, and conflating them is how
this feature gets planned badly.

### (a) Analysing an EXISTING video with Gemini

**Buildable today — but unverified, and it needs ingest work.**

Docs: *"All Gemini models can process video data"*; 1 M-context models handle up to ~3 h at
low media resolution, 1 FPS default sampling, inline uploads under 100 MB
(<https://ai.google.dev/gemini-api/docs/video-understanding>, summarised at
`docs/gemini-models.md:109`). `gemini-3.8-flash` works on this key.

What blocks it in *our* code: `src/lib/ingest/files.ts:7` declares
`DetectedType = "application/pdf" | "image/jpeg" | "image/png"` and sniffs exactly those
three magic numbers (`:11-13`). So a video upload is rejected before any model sees it.
Enabling this means new detected types (MP4/WebM via `ftyp`/EBML sniffing), a duration cap,
and a much larger `maxFileBytes` than the current 10 MB (`src/lib/config.ts:61`).

Honest caveats: **no video input was ever tested** (`docs/gemini-models.md:458`), and one
video is one request but an enormous token count (~100 tok/s at low resolution,
`docs/gemini-models.md:109`) — a 10-minute lecture is ~60 k tokens, which is a real cost per
analysis even though it is a single request against the 20/day cap.

The high-value use is **turning a teacher's video into our existing pipeline**: transcribe →
`extractChapter` → `designQuestions` (`src/lib/ai/workflows.ts:61,201`), so a YouTube-style
lesson becomes a quest with timestamps. That reuses everything and generates nothing.

### (b) GENERATING clips with Veo

**Blocked to zero on this key. Not a throttle — a capability gap.**

All three Veo variants returned `HTTP 429 RESOURCE_EXHAUSTED` in **0.26-0.30 s**, before any
work could start, and **no operation name was ever returned, so nothing could be polled**
(`docs/gemini-models.md:265-288`). Veo 3.1 has no free tier.

Our code could not run on this key even if quota allowed: `config.videoEnabled` requires
`QL_ENABLE_VIDEO` **and** `VEO_MODEL` **and** `aiMode === "vertex"` **and** a GCS bucket
(`src/lib/config.ts:39-41`), and `requestConceptVideo` passes
`config: { outputGcsUri: … }` (`src/lib/services/video.ts:35`) — a **Vertex AI** parameter
that is not documented on the Gemini Developer API at all
(`docs/gemini-models.md:286-288`). The existing async job/poll structure
(`video.ts:18-73`, `src/app/api/concepts/[id]/video/route.ts:19-32`) is sound and should be
kept; it simply has no backend on this key.

**What it needs:** billing enabled, Vertex AI, a bucket. **What it costs:** $0.05/s at 720p
on `veo-3.1-lite-generate-preview` → **$0.40 for one 8-second clip**
(`docs/gemini-models.md:110`), per concept, non-cacheable across students if prompts differ.
Rate-limited to 3/hour today (`src/lib/ratelimit.ts:14`).

**Also: it is the wrong tool even when it works.** See below.

### (c) Interactive playback in our app

**Fully buildable today. Zero model calls at playback. This is the recommendation.**

### Why deterministic visuals beat generated footage for teaching

Not a cost argument — a correctness argument.

1. **Our diagrams cannot contradict the answer key; a generated clip can.**
   `CollisionDiagram` computes `{ v1, v2 } = collide1D(m1, m2, u1, u2, e)` itself and the
   comment is explicit: *"Final velocities are recomputed here from (m1, m2, u1, u2, e); they
   are never taken from model output"* (`src/components/viz/collision-diagram.tsx:21-28`).
   That is the same discipline as `CalcSpec` being recomputed by app code
   (`src/lib/types.ts:112-120`) and questions being independently re-solved by a reviewer
   (`reviewQuestions`, `src/lib/ai/workflows.ts:160`). An 8-second Veo clip of two balls
   colliding has **no** guarantee the momenta are conserved on screen. A physics lesson whose
   animation is subtly wrong is worse than no animation.
2. **The existing Veo prompt admits the limitation.** It asks for *"no text, no people"*
   (`src/lib/services/video.ts:31`) — precisely because labels and numbers in generated video
   are unreliable. A collision lesson with no numbers on screen is a mood piece.
3. **One template serves every question; one clip serves one.** `VisualSpec` is a
   discriminated union (`src/lib/types.ts:99`) already attached to questions
   (`:179`) and to tutor output (`:470`), and `tutorExplain` builds a fresh
   `collision-1d` spec from the model's *worked example*
   (`src/lib/ai/workflows.ts:340-356`). Re-parameterising is free; regenerating is $0.40
   and 1-2 minutes.
4. **Interactive by construction.** Scrubbable, pausable, reduced-motion-aware,
   keyboard-driven, re-renderable with the student's own numbers, ~0 bytes to download,
   works offline. A video file is none of those.
5. **It already works.** 2.5 of the 3 diagrams exist and are wired into the tutor panel
   (`tutor-panel.tsx:137`, `<Visual spec={t.visual} />`).

Generated footage has one real use: **atmosphere** — a lobby backdrop, a chapter title card
— where being imprecise costs nothing. That is a nice-to-have on a billed key, not a
learning feature.

### The "narrated scene" format

```ts
export const SceneCue = z.object({
  index: z.number().int().min(0).max(7),
  /** The caption, and the exact text sent to TTS. */
  text: z.string().min(1).max(400),
  /** Asset id of the clip, if one was generated. Absent = caption-only. */
  narrationAssetId: z.string().optional(),
  /** How the deterministic visual should look while this cue is on screen. */
  visualState: z.object({
    mode: z.enum(["before", "full"]).default("before"),
    /** Freeze the diagram at this time in its own animation, in seconds. */
    t: z.number().min(0).optional(),
    /** Token the diagram may emphasise, e.g. "m1" | "momentum-total". */
    highlight: z.string().max(40).optional(),
  }),
  /** Fallback pacing when there is no audio. Never used to sync audio. */
  readMs: z.number().int().default(4200),
});

export const SceneCheckpoint = z.object({
  afterCue: z.number().int(),
  questionId: z.string(),
  /** Where to continue. Both branches must exist; neither may be a dead end. */
  branch: z.object({ correct: z.number().int(), wrong: z.number().int() }),
});

export const NarratedScene = z.object({
  id: z.string(),                 // `scene__{questId}__{conceptKey}`
  questId: z.string(),
  conceptId: z.string(),
  title: z.string().max(120),
  visual: VisualSpec,             // reuses src/lib/types.ts:99 unchanged
  cues: z.array(SceneCue).min(1).max(8),
  checkpoints: z.array(SceneCheckpoint).max(3),
  origin: ContentOrigin,          // "template" when scripted by app code
});
```

**Playback rules.**

- **Audio drives the visual, never the reverse.** Each cue's clip is decoded to an
  `AudioBuffer`; `buffer.duration` is the cue's real length, so the visual advances on a
  true boundary. No timestamp is ever estimated when audio exists. Cue *n+1* is scheduled at
  `startTime + buffer.duration` on the same `AudioContext` clock
  (`getRuntime().ctx`, `src/lib/game/audio/context.ts:120`), so cues are gapless.
- **With no audio, cues advance only on a Next button.** Never on `readMs` alone — a timer
  that outruns a slow reader is a worse failure than a button. `readMs` exists solely for an
  optional "auto-advance" toggle the student opts into.
- **A checkpoint stops playback dead.** The scene renders the real question card and routes
  the answer through `LearningDirector.answer()`
  (`src/lib/game/learning.ts:186`) — the same server-scored path as a track checkpoint, so
  XP, mastery, misconception recording and recovery offers all work with no new scoring code
  and no way for a scene to mark its own answer.
- **The next segment adapts to the answer.** `branch.correct` jumps past the remedial cues;
  `branch.wrong` jumps *to* them, and those cues are written in the simplified register
  (script 5 in §3) — mirroring `simplerStyle(struggle)` (`src/lib/ai/prompts.ts:55-59`) and
  the existing step-down in `createFollowUp` (`src/lib/services/tutor.ts:196-201`).
  Both branches re-converge, so a wrong answer costs a detour, never an exit.
- **The scene is reachable from three places** and is the same component in all three: the
  quest lobby ("Watch the 30-second version"), the tutor panel after a miss (replacing
  nothing — it sits where `VideoLesson` is today at `tutor-panel.tsx:170`), and the run
  summary ("redo this idea").

On a billed key, this format absorbs Veo without redesign: a cue gains an optional
`clipAssetId`, and a generated clip plays *instead of* the deterministic visual for that
cue only — atmosphere where it's safe, computed geometry where it matters.

---

## 7. Failure and fallback matrix

The rule: **a missing voice is a quiet app, never a broken one.** No error toast, no retry
button, no spinner for any row in this table except the two marked.

| Failure mode | Detection | What the student gets |
|---|---|---|
| **TTS quota exhausted** (429, `limit: 0` / `free_tier`) | 429 in <0.5 s with `limit: 0` or `free_tier` in the message (`docs/gemini-models.md:388,409`) | Full captions, no audio controls. Asset `unavailable`. Day's budget burned, no retries. Creator-side only: the create screen's optional-extras line reads "Narration wasn't added to this quest — the daily voice limit is used up. Everything else is ready." Never shown mid-game. |
| **TTS daily budget spent (our own cap)** | `reserveTtsCalls()` grants 0 | Identical to the above, reached without spending a request. This is the common case and it is deliberately indistinguishable to the student. |
| **Generation failed** (503, timeout, SDK shape change) | non-429 error after retries | Captions. Asset `failed`. Logged for us; invisible to the student. One lazy retry on the next quest open, budget permitting. |
| **Asset row ready but blob missing** | `blobs().get()` throws | Captions. Route returns 404; the player treats 404 identically to `unavailable`. Asset flipped to `failed` so it can be regenerated. |
| **Autoplay blocked by the browser** | `unlock()` resolves `false` (`src/lib/game/audio/context.ts:185-195`); `ctx.state !== "running"` | Captions plus an explicit **"Play narration"** button — the one case that needs UI, because a user gesture is the only fix. Scene advances on Next meanwhile. The race already handles this: `start()` tolerates `ok === false` (`game.ts:273-276`). |
| **Student muted / voice bus at 0** | `snapshot().muted`, `buses.voice === 0`, or `!isEnabled()` (`context.ts:291-301,177`) | Captions, cues advance on Next. **No audio is downloaded** — the player checks the mixer before fetching, so muted students never pay for bytes they can't hear. |
| **Web Audio unavailable** (SSR, hardened browser) | `getRuntime()` returns `null` / `unsupported` sticky flag (`context.ts:120-127`) | Captions. Entire narration module is a no-op by construction, same contract as `sfx`. |
| **Offline** | `fetch` fails; the player already tracks `online`/`offline` (`car-rush-player.tsx:63-64`) | Captions. Clips already decoded this session keep playing from memory. |
| **Slow network, clip not yet decoded** | cue starts with no buffer | Caption shows immediately and the cue advances on its own schedule; the clip is **dropped, not awaited**. Audio never delays the lesson. |
| **Script edited after generation** (hash mismatch) | `scriptHash` differs | The **new** caption text with no audio, rather than old audio contradicting new text. Regenerate lazily within budget. |
| **`prefers-reduced-motion`** | `useReducedMotion()` (`collision-diagram.tsx:5`) | Static diagram, no auto-advance, captions as a list. Audio still available on demand. |
| **Veo unavailable** (free tier, or `videoEnabled === false`) | `config.videoEnabled` false → existing `VIDEO_UNAVAILABLE` 501 whose message already says *"The animated diagram and worked example cover this concept instead"* (`src/lib/services/video.ts:20-24`) | The narrated scene, which is better. The "Generate video" button (`tutor-panel.tsx:240`) is hidden, not disabled. |
| **Narration asset belongs to another user** | `asset.ownerId !== uid` | 404 via `Errors.notFound` (`src/lib/errors.ts:19`). Never a 403 that confirms existence. |

---

## 8. Implementation plan

Four phases. **Phase 0 ships a complete feature with zero model calls** — which is the
point: everything after it is an enhancement that can fail silently.

### Phase 0 — silent narrated scenes (no AI, no quota, no env vars)

| File | Change |
|---|---|
| `src/lib/game/audio/context.ts` | Add `"voice"` to `BusName` (`:17`) and `BUS_NAMES` (`:19`); `DEFAULT_BUS_GAIN.voice = 0.95` (`:22-28`); funnel `setBusVolume` through a new `applyBus()`; export `setBusDuck()` (§4). No prefs version bump (`:76-81`). |
| `src/lib/game/audio/narration.ts` *(new)* | `speak(clip)`, `enqueue(clips)`, `stopNarration()`, `isSpeaking()`, `duckFor(kind)`, `releaseDuck()`, `disposeNarration()`. Buffer playback + the duck table. Guarded, never throws. |
| `src/lib/game/audio/index.ts` | Re-export from the barrel (`:40-74`); add `narration.stop()` to `GameAudio.setEnabled` (`:166-174`) and `disposeNarration()` to `dispose()` (`:185-191`). |
| `src/lib/types.ts` | `SceneCue`, `SceneCheckpoint`, `NarratedScene`, `NarrationContent` (§5, §6). `LearningAsset.type` gains `"narration"` and `"scene"` (`:482`). `LearningAsset` gains `questId: z.string().optional()` (next to `sessionId`, `:481`) so assets can be listed and swept per quest. |
| `src/lib/narration/scripts.ts` *(new)* | Deterministic templates → `NarratedScene` + caption text from `ExtractedContent` and accepted `Question`s. No model call. `origin: "template"`. |
| `src/components/viz/*` | Accept `freezeAt?: number` and `highlight?: string` so a cue can pin the diagram. Additive props only. |
| `src/components/game/narrated-scene.tsx` *(new)* | The player: visual + caption + Next + transcript + checkpoint card. Answers via `LearningDirector.answer()` (`src/lib/game/learning.ts:186`). |
| `src/components/game/tutor-panel.tsx` | Render the scene where `VideoLesson` sits (`:170`); keep `VideoLesson` behind `videoEnabled`. |
| `src/components/games/car-rush/car-rush-player.tsx` | `narrationVolume` in `StoredGamePrefs`, third slider by `:689`, pushed to the bus like `:136-137,146-148`. `stopNarration()` in `onCheckpoint` and in `pauseRace` (`:91-95`). |

Also Phase 0: the `speechSynthesis` read-aloud button for question/option/tutor text
(§1, §5). Independent of everything else.

### Phase 1 — pre-generated narration

| File | Change |
|---|---|
| `src/lib/config.ts` | `ttsEnabled`, `ttsModel`, `ttsVoice`, `ttsPerQuest`, `ttsDailyBudget` (§3). `publicStatus()` gains `narrationEnabled` (`:69-78`). |
| `src/lib/ai/speech.ts` *(new)* | `synthesizeSpeech({ text, style, voice, model, ownerId, inputRefs })` → `{ bytes, mimeType }`. **Cannot reuse `generateJson`** (`src/lib/ai/client.ts:140`), which is JSON-schema-only; this needs `responseModalities: ["AUDIO"]` and an audio part. Reuses `genai()` (`:14`), `audit()` and `mapProviderError`. Non-retryable on 429-with-`limit: 0` and on all 4xx (the narrowing `docs/gemini-models.md:409` recommends). Timeout 20 s, not `aiTimeoutMs`'s 90 s (`src/lib/config.ts:57-59`) — a 4 s call that takes 20 s is broken. |
| `src/lib/services/narration.ts` *(new)* | `prepareQuestNarration(uid, questId)` (budgeted, idempotent, never throws), `getNarrationManifest(uid, questId)`, `reserveTtsCalls(n)` / `releaseTtsCalls(n)` on the `quotas` doc under `db().withLock` (§2). |
| `src/lib/services/materials.ts` | Call `prepareQuestNarration` between `:195` (`stage: "preparing"`) and `:216` (`stage: "ready"`), inside a try/catch that can only downgrade narration. Add the `assets`-by-`questId` sweep to `deleteMaterial` (`:230-249`). |
| `src/app/api/quests/[id]/narration/route.ts` *(new)* | `GET` → manifest (scenes + cues + caption text + which clips exist). |
| `src/app/api/narration/[id]/audio/route.ts` *(new)* | `GET` → signed redirect or streamed bytes; same shape as `src/app/api/materials/[id]/files/[index]/route.ts:10-24`, `Content-Type: audio/wav`, `Cache-Control: private, max-age=86400` (content-addressed, so a long TTL is safe). Checks `asset.ownerId === uid`. |
| `src/lib/ratelimit.ts` | `narration: { max: 20, windowMs: 10 * 60_000 }` for the read route. The *generation* cap is the durable day counter, not this. |
| `src/components/create/create-flow.tsx` | One line in the "preparing" stage detail (`:57`) and an honest optional-extras note when narration is `unavailable`. |

### Phase 2 — branching inside a scene

`SceneCheckpoint` wiring, remedial cue sets, re-convergence, scene progress persisted on
`Session` (or kept client-side — a re-watch is cheap and stateless, which is simpler).

### Phase 3 — needs billing

Veo on the Vertex path (`config.videoEnabled` already gates it correctly,
`src/lib/config.ts:39-41`); video-understanding ingest (`src/lib/ingest/files.ts:7-13` plus
a duration cap and a larger `maxFileBytes`); per-concept scenes instead of one flagship;
flagship `gemini-3.8-flash-tts`; WebVTT tracks on real `<video>` elements
(`tutor-panel.tsx:232`).

### Environment variables

Following the `GEMINI_*` / `QL_*` split in `src/lib/config.ts` and the three already
proposed in `docs/gemini-models.md:348-355`.

| Var | Default | Controls |
|---|---|---|
| `QL_ENABLE_TTS` | unset (off) | Master switch. Off ⇒ captions-only everywhere, no quota touched. Narrated scenes still work. |
| `GEMINI_TTS_MODEL` | `gemini-3.8-flash-lite-tts` | Verified working, 4.04 s (`docs/gemini-models.md:294`). |
| `QL_TTS_VOICE` | `Kore` | One of the 30 prebuilt voices. |
| `QL_TTS_PER_QUEST` | `6` | Hard per-quest cap (§2). |
| `QL_TTS_DAILY_BUDGET` | `18` | Durable daily cap; 18 not 20, leaving headroom. |
| `QL_ENABLE_VIDEO_UNDERSTANDING` | unset (off) | Phase 3 only; gates video MIME types in ingest. |

`QL_ENABLE_VIDEO` / `VEO_MODEL` are unchanged and stay empty on this key, as
`docs/gemini-models.md:345` already recommends.

### Test strategy

Vitest, `environment: "node"`, `include: ["src/**/*.test.ts", "test/**/*.test.ts"]`
(`vitest.config.mts:12`). **No test makes a network call** — the AI client is mocked the way
`src/lib/__tests__/ai-pipeline.test.ts:23-30` mocks `../ai/client`.

| File | Asserts |
|---|---|
| `src/lib/game/audio/__tests__/narration.test.ts` | Uses `installFakeAudio()` + `__resetAudioForTests()` (`src/lib/game/audio/__tests__/fake-audio.ts`, pattern at `sfx.test.ts:15-27`). Clips route to the `voice` bus (`busInputs` helper, `sfx.test.ts:9-12`). Ducking writes `linearRampToValueAtTime` with the exact targets in §4 and **`gain.directSets === 0`** on every bus — `FakeAudioParam` counts raw `.value` writes (`fake-audio.ts:19-33`) and the game loop forbids them. `stopNarration()` restores each bus to exactly its stored pref. A second `speak()` leaves exactly one voice. Every entry point is a no-op and throws nothing when `getRuntime()` is null. |
| `src/lib/game/audio/__tests__/context.test.ts` *(extend)* | Old `ql.audio.prefs.v1` JSON with five buses still loads, and `voice` gets its default (`context.ts:76-81`). `setBusVolume` while ducked ramps to `pref × duck`, not `pref`. |
| `src/lib/__tests__/narration-scripts.test.ts` *(new)* | Every template ≤25 words. Tone blocklist: no `!`, no "great job", "awesome", "oops", "don't worry", "well done". Every cue has non-empty caption text. `scriptHash` is stable for identical input and changes when voice/model/text changes. Every `SceneCheckpoint.branch` target is a real cue index and both branches re-converge (no dead ends). |
| `src/lib/__tests__/narration-budget.test.ts` *(new)* | With a stubbed `synthesizeSpeech`: never more than `ttsPerQuest` calls for one quest; the 7th slot is `unavailable`, not an error. A 429 with `limit: 0` produces zero retries and burns the day. Budget exhaustion leaves the quest `"ready"` and the material **not** `"failed"`. Re-running `prepareQuestNarration` is idempotent (0 new calls). A changed script hash regenerates exactly one slot. |
| `src/lib/__tests__/learning-loop.test.ts` *(extend)* | `QL_FORCE_DEMO=1` (`:7`) ⇒ quest creation succeeds with zero narration assets and the scene manifest is caption-only. |
| Scene playback | Cue advance uses `buffer.duration` when audio exists and requires an explicit Next when it does not — asserted against a fake buffer, no real decoding. |

---

## What is genuinely blocked by the free tier

1. **Veo. Completely.** 429 `limit: 0` in 0.26-0.30 s, no operation name, nothing to poll
   (`docs/gemini-models.md:265-288`). Needs billing *and* Vertex AI, because
   `outputGcsUri` (`src/lib/services/video.ts:35`) is a Vertex parameter. $0.40 per 8 s clip
   at the cheapest variant.
2. **Image generation for diagram assets.** All image models 429 `limit: 0`
   (`docs/gemini-models.md:304-312`), and one image request took **167 s** against a 90 s
   `QL_AI_TIMEOUT_MS` (`docs/gemini-models.md:392`). Moot here: `src/components/viz/` already
   draws better diagrams, deterministically.
3. **Narration at scale.** 20 TTS requests/day ÷ 6 per quest = **3 narrated quests per day,
   for the whole key.** Not per student. This is the constraint that shapes §2 and the reason
   captions are the primary channel and audio the enhancement.

Everything else in this document runs today: the `voice` bus, the duck, narrated scenes,
branching checkpoints, captions, transcripts, `speechSynthesis` read-aloud, and the full
caption-only fallback path.
