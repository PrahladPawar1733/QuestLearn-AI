/**
 * The `NarratedScene` format — an interactive, video-style lesson built from
 * the deterministic visuals in `src/components/viz/`.
 *
 * Design rules this schema encodes (from `docs/audio-and-video-lessons.md`):
 *
 *  1. **The caption is the artifact; the audio is derived from it.** Every cue
 *     carries `text`, which is simultaneously the on-screen caption and the
 *     exact string that would be sent to TTS. A scene with no audio at all is
 *     a complete lesson: visual + caption + Next.
 *  2. **A scene is pure data.** Hand-authored (see `demo-scene.ts`) or
 *     generated server-side — the player cannot tell the difference, and the
 *     only thing generation adds is `audio` on a cue.
 *  3. **The visual is never trusted to the model.** A cue re-parameterises a
 *     `VisualSpec` (`src/lib/types.ts`), which the viz components recompute
 *     from first principles — `CollisionDiagram` derives the final velocities
 *     itself via `collide1D` (`src/components/viz/collision-diagram.tsx:21-28`)
 *     and never takes them from anywhere else. That guarantee is the entire
 *     reason this format exists instead of generated video.
 *  4. **A scene never scores an answer.** A checkpoint cue carries the
 *     question *as shown to the student* — stem and options, no answer key —
 *     and the settled result arrives from outside (see `CheckpointSettlement`).
 *
 * ### One ordered cue list, not cues + a separate checkpoint array
 *
 * `docs/audio-and-video-lessons.md:570-607` sketches `cues` plus a parallel
 * `checkpoints[{ afterCue }]` array. This file deliberately lands on a single
 * ordered list with a discriminated `kind`, because every player operation —
 * seek, next, previous, scrub, chapter jump — then works in one index space
 * and a checkpoint cannot be orphaned from the cue it follows. The branch
 * shape (`{ correct, wrong }`) is preserved exactly; the targets are cue
 * **ids** rather than indices so that inserting a cue while authoring cannot
 * silently redirect a branch.
 */
import { z } from "zod";
import { ContentOrigin, OPTION_IDS, VisualSpec } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Visual state for one cue                                            */
/* ------------------------------------------------------------------ */

/**
 * How the deterministic diagram should look while this cue is on screen.
 *
 * `visual` overrides the scene-level spec, which is what makes "before" and
 * "after" the *same* lesson rather than two diagrams: re-parameterising is
 * free, so a cue can change the masses, the restitution, or swap to momentum
 * bars without any new asset.
 */
export const CueVisual = z.object({
  /** `before` hides the outcome — safe while a question is open. */
  mode: z.enum(["before", "full"]).default("before"),
  /** Replaces `NarratedScene.visual` for this cue only. */
  visual: VisualSpec.optional(),
  /**
   * Pin the diagram's own animation at this time, in seconds.
   * NOT YET HONOURED: `src/components/viz/*` does not accept `freezeAt` today
   * and that directory is not ours to change. The field is carried through the
   * data and the player so the lead's additive viz prop lands with no schema
   * change (see `docs/audio-and-video-lessons.md:677`).
   */
  freezeAt: z.number().min(0).max(60).optional(),
  /**
   * A token the diagram may emphasise, e.g. `"m1"`, `"momentum-total"`.
   * Same status as `freezeAt`: carried, not yet rendered.
   */
  highlight: z.string().max(40).optional(),
});
export type CueVisual = z.infer<typeof CueVisual>;

/* ------------------------------------------------------------------ */
/* Audio attached to a cue (optional, always)                          */
/* ------------------------------------------------------------------ */

/**
 * The generated clip for a cue, if one exists.
 *
 * `status` mirrors `LearningAsset.generationStatus` (`src/lib/types.ts`):
 * `"unavailable"` means *we chose not to spend quota*, `"failed"` means *we
 * tried and it broke*. Both render identically to the student — caption, no
 * audio control, no error — so the player only ever asks `isCuePlayable()`.
 */
export const CueAudio = z.object({
  /** `narration__{questId}__{slot}`. */
  assetId: z.string().min(1).max(160),
  /** Resolved playback URL, when the manifest has one. */
  url: z.string().max(2048).optional(),
  /**
   * Duration from the decoded `AudioBuffer`, in ms, once known. Advisory
   * only: the player always prefers the live buffer duration reported by the
   * audio sink, because that is the real cue boundary.
   */
  durationMs: z.number().int().positive().max(120_000).optional(),
  status: z.enum(["pending", "processing", "ready", "failed", "unavailable"]).default("pending"),
});
export type CueAudio = z.infer<typeof CueAudio>;

/* ------------------------------------------------------------------ */
/* Cues                                                                */
/* ------------------------------------------------------------------ */

const cueBase = {
  /** Stable, authored id. Branch and chapter targets point at these. */
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "cue ids are lower-case kebab-case"),
  /** Concept this cue teaches; drives the chapter list. */
  conceptId: z.string().max(120).optional(),
  /** Human label for the concept, so a chapter list needs no extra lookup. */
  conceptTitle: z.string().max(120).optional(),
};

/**
 * A spoken/captioned beat of the lesson.
 *
 * `text` is under ~25 words by convention (`lintSceneScripts` enforces it):
 * one line is one clip, one cache entry, and one interruptible unit.
 */
export const NarrationCue = z.object({
  kind: z.literal("narration"),
  ...cueBase,
  /** The caption, verbatim, and the exact text a TTS call would be given. */
  text: z.string().min(1).max(400),
  visual: CueVisual.default({ mode: "before" }),
  audio: CueAudio.optional(),
  /**
   * Fallback pacing when no clip is decoded, in ms. Never used to sync audio:
   * when a clip exists its real `AudioBuffer.duration` always wins.
   */
  readMs: z.number().int().min(800).max(30_000).default(4200),
  /**
   * Jump here instead of the next cue in array order. This is what lets a
   * remedial block live at the end of the array (so reading the array top to
   * bottom is the main lesson) and still re-converge on the main path.
   */
  goto: z
    .string()
    .max(60)
    .optional(),
  /** The scene ends after this cue, whatever follows it in the array. */
  terminal: z.boolean().default(false),
  /** True for cues only reached by a wrong answer. Hidden from the scrub bar. */
  remedial: z.boolean().default(false),
});
export type NarrationCue = z.infer<typeof NarrationCue>;

/**
 * The question as the student sees it: stem, options, maybe a hint.
 *
 * There is no `correctOptionId` here and there never will be. The scene is
 * shipped to the browser; an answer key in it would be readable in devtools.
 * Scoring happens on the server and arrives back as a `CheckpointSettlement`.
 */
export const CheckpointPrompt = z.object({
  /** The real `Question.id`, so the server can score it. */
  questionId: z.string().min(1).max(120),
  /**
   * The stem, as shown. Never narrated — the student reads faster than the
   * voice, and `docs/audio-and-video-lessons.md:68` forbids duplicate reading.
   * `speech.ts` can read it on demand, which is a different thing.
   */
  text: z.string().min(5).max(1200),
  options: z
    .array(z.object({ id: z.enum(OPTION_IDS), text: z.string().min(1).max(400) }))
    .min(2)
    .max(5),
  hint: z.string().max(400).optional(),
});
export type CheckpointPrompt = z.infer<typeof CheckpointPrompt>;

/**
 * A cue that stops playback dead and asks something.
 *
 * Both branches must exist and must reach a terminal cue: a wrong answer buys
 * a detour, never an exit (`docs/audio-and-video-lessons.md:626-628`).
 */
export const CheckpointCue = z.object({
  kind: z.literal("checkpoint"),
  ...cueBase,
  /** Caption shown while the question is open, e.g. "Your turn." */
  text: z.string().min(1).max(400),
  prompt: CheckpointPrompt,
  /** Frozen at `before` by default: the diagram must not leak the answer. */
  visual: CueVisual.default({ mode: "before" }),
  branch: z.object({
    /** Cue id to continue from on a correct answer (and on skip). */
    correct: z.string().min(1).max(60),
    /** Cue id of the remedial block. */
    wrong: z.string().min(1).max(60),
  }),
});
export type CheckpointCue = z.infer<typeof CheckpointCue>;

export const SceneCue = z.discriminatedUnion("kind", [NarrationCue, CheckpointCue]);
export type SceneCue = z.infer<typeof SceneCue>;

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

/** An authored chapter marker. Derived from cue concepts when absent. */
export const SceneChapter = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  conceptId: z.string().max(120).optional(),
  /** First cue of the chapter. */
  cueId: z.string().min(1).max(60),
});
export type SceneChapter = z.infer<typeof SceneChapter>;

export const NarratedScene = z.object({
  /** `scene__{questId}__{conceptKey}`, or an authored id for demo content. */
  id: z.string().min(1).max(160),
  questId: z.string().max(120).optional(),
  /** The concept the scene is primarily about. Cues may name their own. */
  conceptId: z.string().max(120).optional(),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  subject: z.string().max(40).optional(),
  /** Default visual; a cue's `visual.visual` overrides it. */
  visual: VisualSpec,
  cues: z.array(SceneCue).min(1).max(32),
  /** Optional explicit chapters; `sceneChapters()` derives them otherwise. */
  chapters: z.array(SceneChapter).max(12).default([]),
  origin: ContentOrigin,
});
export type NarratedScene = z.infer<typeof NarratedScene>;

/** The shape callers hand in before defaults are applied. */
export type NarratedSceneInput = z.input<typeof NarratedScene>;

/* ------------------------------------------------------------------ */
/* The answer contract                                                 */
/* ------------------------------------------------------------------ */

export type OptionId = (typeof OPTION_IDS)[number];

/**
 * A **server-settled** answer, handed back to the scene from outside.
 *
 * This is a structural subset of `SettledAnswer`
 * (`src/lib/game/learning.ts`), so `await director.answer(optionId, offered)`
 * is directly assignable to it with no adapter. The scene consumes exactly
 * the fields it renders and nothing else, which keeps `src/lib/lesson/` from
 * depending on the game layer.
 *
 * The scene never constructs one of these. It cannot: it has no answer key.
 */
export interface CheckpointSettlement {
  correct: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  /** The worked explanation, shown after the answer. */
  explanation: string;
  steps?: string[];
  /** Why that wrong option was tempting — the misconception, named. */
  misconception?: { misconception: string; feedback: string };
}

/* ------------------------------------------------------------------ */
/* Small guards                                                        */
/* ------------------------------------------------------------------ */

export function isCheckpointCue(cue: SceneCue): cue is CheckpointCue {
  return cue.kind === "checkpoint";
}

export function isNarrationCue(cue: SceneCue): cue is NarrationCue {
  return cue.kind === "narration";
}

/**
 * True when a cue has a clip that is worth trying to play. Everything else —
 * `pending`, `failed`, `unavailable`, no `audio` at all — is the normal
 * caption-only mode and has no error UI.
 */
export function hasPlayableAudio(cue: SceneCue): boolean {
  return cue.kind === "narration" && cue.audio?.status === "ready";
}

/** Parse unknown data into a scene. Throws on a malformed scene. */
export function parseScene(data: unknown): NarratedScene {
  return NarratedScene.parse(data);
}

/** Build a scene from authored input, applying schema defaults. */
export function defineScene(input: NarratedSceneInput): NarratedScene {
  return NarratedScene.parse(input);
}
