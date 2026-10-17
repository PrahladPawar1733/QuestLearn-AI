/**
 * Pure helpers over a `NarratedScene`: graph validation, script linting,
 * chapter derivation, the scrub timeline, the transcript and a WebVTT dump.
 *
 * Everything here is a pure function of the scene data — no DOM, no audio, no
 * React — so the structural guarantees the player relies on (every branch
 * target exists, every path terminates) are unit-testable in isolation.
 */
import {
  isCheckpointCue,
  isNarrationCue,
  type NarratedScene,
  type SceneChapter,
  type SceneCue,
} from "./types";

/* ------------------------------------------------------------------ */
/* Graph traversal                                                     */
/* ------------------------------------------------------------------ */

export function cueIndex(scene: NarratedScene, cueId: string): number {
  return scene.cues.findIndex((c) => c.id === cueId);
}

export function cueById(scene: NarratedScene, cueId: string): SceneCue | null {
  return scene.cues.find((c) => c.id === cueId) ?? null;
}

/**
 * The cue that follows `index` on the current path, or `null` when the scene
 * ends there.
 *
 * Order of precedence: `terminal` wins, then an explicit `goto`, then array
 * order. A checkpoint has no linear successor at all — it is resolved by
 * `branchTarget()` once an answer has settled — so asking for its successor
 * returns `null` rather than guessing a branch.
 */
export function nextCueIndex(scene: NarratedScene, index: number): number | null {
  const cue = scene.cues[index];
  if (!cue) return null;
  if (isCheckpointCue(cue)) return null;
  if (cue.terminal) return null;
  if (cue.goto) {
    const target = cueIndex(scene, cue.goto);
    return target >= 0 ? target : null;
  }
  const next = index + 1;
  return next < scene.cues.length ? next : null;
}

/** Where a settled checkpoint continues. `null` when the target is missing. */
export function branchTarget(scene: NarratedScene, index: number, correct: boolean): number | null {
  const cue = scene.cues[index];
  if (!cue || !isCheckpointCue(cue)) return null;
  const target = cueIndex(scene, correct ? cue.branch.correct : cue.branch.wrong);
  return target >= 0 ? target : null;
}

/* ------------------------------------------------------------------ */
/* Structural validation                                               */
/* ------------------------------------------------------------------ */

export interface SceneIssue {
  cueId?: string;
  code:
    | "duplicate-cue-id"
    | "missing-goto-target"
    | "missing-branch-target"
    | "self-branch"
    | "unreachable-cue"
    | "dead-end"
    | "missing-chapter-cue"
    | "checkpoint-reveals-answer";
  message: string;
}

/**
 * Checks the invariants the player assumes. A scene that passes this can be
 * played to completion from any entry point without the player having to
 * defend itself mid-frame.
 *
 *  - cue ids are unique
 *  - every `goto`, branch and chapter target resolves
 *  - every cue is reachable from cue 0
 *  - every path from every cue terminates (no cycle that never ends, no
 *    branch into a dead end) — this is the "a wrong answer costs a detour,
 *    never an exit" rule made mechanical
 *  - a checkpoint's visual is `before`, so the diagram cannot show the answer
 */
export function validateScene(scene: NarratedScene): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const seen = new Set<string>();
  for (const cue of scene.cues) {
    if (seen.has(cue.id)) {
      issues.push({ cueId: cue.id, code: "duplicate-cue-id", message: `Two cues share the id "${cue.id}".` });
    }
    seen.add(cue.id);
  }

  for (const cue of scene.cues) {
    if (isNarrationCue(cue) && cue.goto && cueIndex(scene, cue.goto) < 0) {
      issues.push({ cueId: cue.id, code: "missing-goto-target", message: `goto "${cue.goto}" is not a cue in this scene.` });
    }
    if (isCheckpointCue(cue)) {
      for (const which of ["correct", "wrong"] as const) {
        const target = cue.branch[which];
        if (cueIndex(scene, target) < 0) {
          issues.push({
            cueId: cue.id,
            code: "missing-branch-target",
            message: `branch.${which} "${target}" is not a cue in this scene.`,
          });
        } else if (target === cue.id) {
          issues.push({ cueId: cue.id, code: "self-branch", message: `branch.${which} points back at the checkpoint.` });
        }
      }
      if (cue.visual.mode !== "before") {
        issues.push({
          cueId: cue.id,
          code: "checkpoint-reveals-answer",
          message: "A checkpoint must render its visual in `before` mode, or the diagram answers the question.",
        });
      }
    }
  }

  for (const ch of scene.chapters) {
    if (cueIndex(scene, ch.cueId) < 0) {
      issues.push({ cueId: ch.cueId, code: "missing-chapter-cue", message: `Chapter "${ch.title}" points at a missing cue.` });
    }
  }

  // Reachability from the first cue, following every edge.
  const reachable = new Set<number>();
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    if (i < 0 || i >= scene.cues.length || reachable.has(i)) continue;
    reachable.add(i);
    for (const n of outEdges(scene, i)) stack.push(n);
  }
  scene.cues.forEach((cue, i) => {
    if (!reachable.has(i)) {
      issues.push({ cueId: cue.id, code: "unreachable-cue", message: "No path from the first cue reaches this cue." });
    }
  });

  // Termination: memoised DFS. A cue terminates when it has no out-edges
  // (the scene ends) or when at least one successor terminates.
  const terminates = new Map<number, boolean>();
  const terminatesFrom = (i: number, onPath: Set<number>): boolean => {
    const cached = terminates.get(i);
    if (cached !== undefined) return cached;
    if (onPath.has(i)) return false; // cycle: this path alone does not end
    const edges = outEdges(scene, i);
    if (edges.length === 0) {
      terminates.set(i, true);
      return true;
    }
    onPath.add(i);
    // A checkpoint must terminate down *both* branches; a narration cue has
    // exactly one successor, so `every` and `some` agree for it.
    const cue = scene.cues[i];
    const ok = isCheckpointCue(cue)
      ? edges.every((n) => terminatesFrom(n, onPath))
      : edges.some((n) => terminatesFrom(n, onPath));
    onPath.delete(i);
    terminates.set(i, ok);
    return ok;
  };
  scene.cues.forEach((cue, i) => {
    if (!reachable.has(i)) return;
    if (!terminatesFrom(i, new Set())) {
      issues.push({ cueId: cue.id, code: "dead-end", message: "A path from this cue never reaches the end of the scene." });
    }
  });

  return issues;
}

function outEdges(scene: NarratedScene, index: number): number[] {
  const cue = scene.cues[index];
  if (!cue) return [];
  if (isCheckpointCue(cue)) {
    return (["correct", "wrong"] as const)
      .map((w) => cueIndex(scene, cue.branch[w]))
      .filter((n) => n >= 0);
  }
  const n = nextCueIndex(scene, index);
  return n === null ? [] : [n];
}

/** Throws on the first structural problem. Used by authored scenes at import. */
export function assertValidScene(scene: NarratedScene): NarratedScene {
  const issues = validateScene(scene);
  if (issues.length) {
    const lines = issues.map((i) => `  - [${i.code}] ${i.cueId ?? "scene"}: ${i.message}`).join("\n");
    throw new Error(`Invalid narrated scene "${scene.id}":\n${lines}`);
  }
  return scene;
}

/* ------------------------------------------------------------------ */
/* Script linting (tone + length)                                      */
/* ------------------------------------------------------------------ */

/**
 * Banned in spoken lines. These are a test, not a style note
 * (`docs/audio-and-video-lessons.md:236`): content-free praise is the
 * canonical mute trigger for a 14-18 year old, and an exclamation mark reads
 * as either sarcastic or saccharine when performed by a voice.
 */
export const TONE_BLOCKLIST = [
  "great job",
  "awesome",
  "oops",
  "don't worry",
  "dont worry",
  "well done",
  "good job",
  "nice try",
  "keep it up",
  "you got this",
  "amazing",
] as const;

export interface ScriptIssue {
  cueId: string;
  code: "too-long" | "tone" | "empty" | "exclamation";
  message: string;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Lints the *spoken* text of a scene. Checkpoint stems are exempt from the
 * word limit — they are read, not spoken — but not from the tone rules.
 */
export function lintSceneScripts(scene: NarratedScene, maxWords = 25): ScriptIssue[] {
  const issues: ScriptIssue[] = [];
  for (const cue of scene.cues) {
    const text = cue.text;
    if (!text.trim()) {
      issues.push({ cueId: cue.id, code: "empty", message: "Caption text is empty; the caption is the primary channel." });
      continue;
    }
    if (isNarrationCue(cue) && wordCount(text) > maxWords) {
      issues.push({ cueId: cue.id, code: "too-long", message: `${wordCount(text)} words; keep spoken lines to ${maxWords}.` });
    }
    if (text.includes("!")) {
      issues.push({ cueId: cue.id, code: "exclamation", message: "No exclamation marks in spoken lines." });
    }
    const lower = text.toLowerCase();
    for (const phrase of TONE_BLOCKLIST) {
      if (lower.includes(phrase)) {
        issues.push({ cueId: cue.id, code: "tone", message: `Contains blocked phrase "${phrase}".` });
      }
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

/**
 * Authored chapters when present, otherwise one chapter per run of cues that
 * share a `conceptId`. Remedial cues never start a chapter — they are a
 * detour inside one, not a destination.
 */
export function sceneChapters(scene: NarratedScene): SceneChapter[] {
  if (scene.chapters.length) return scene.chapters;
  const out: SceneChapter[] = [];
  let lastConcept: string | null = null;
  for (const cue of scene.cues) {
    if (isNarrationCue(cue) && cue.remedial) continue;
    const concept = cue.conceptId ?? null;
    if (concept === null) continue;
    if (concept === lastConcept) continue;
    lastConcept = concept;
    out.push({
      id: `ch-${cue.id}`,
      title: cue.conceptTitle ?? concept,
      conceptId: concept,
      cueId: cue.id,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Timeline (the scrub bar)                                            */
/* ------------------------------------------------------------------ */

export interface TimelineEntry {
  cueId: string;
  index: number;
  kind: SceneCue["kind"];
  /** Start offset on the scrub bar, ms. */
  startMs: number;
  durationMs: number;
}

export interface Timeline {
  entries: TimelineEntry[];
  totalMs: number;
}

/**
 * The scrub bar's coordinate space.
 *
 * Branching makes a single "true" duration impossible, so the bar is the
 * **main path in array order, remedial cues excluded**: that is what the
 * student is scrubbing through, it is stable regardless of their answers, and
 * it never jumps length mid-lesson. A checkpoint is a zero-length marker.
 *
 * `durationOf` is injected so the same function serves both the silent case
 * (`readMs`) and the audio case (real `AudioBuffer.duration`) without the
 * timeline knowing anything about audio.
 */
export function sceneTimeline(scene: NarratedScene, durationOf: (cue: SceneCue) => number): Timeline {
  const entries: TimelineEntry[] = [];
  let at = 0;
  scene.cues.forEach((cue, index) => {
    if (isNarrationCue(cue) && cue.remedial) return;
    const durationMs = isCheckpointCue(cue) ? 0 : Math.max(0, durationOf(cue));
    entries.push({ cueId: cue.id, index, kind: cue.kind, startMs: at, durationMs });
    at += durationMs;
  });
  return { entries, totalMs: at };
}

/** Map a scrub position in ms onto a cue and an offset inside it. */
export function timelineSeek(timeline: Timeline, ms: number): { index: number; offsetMs: number } | null {
  if (!timeline.entries.length) return null;
  const clamped = Math.max(0, Math.min(ms, timeline.totalMs));
  let chosen = timeline.entries[0];
  for (const e of timeline.entries) {
    if (clamped >= e.startMs) chosen = e;
    else break;
  }
  return { index: chosen.index, offsetMs: Math.max(0, Math.min(clamped - chosen.startMs, chosen.durationMs)) };
}

/* ------------------------------------------------------------------ */
/* Transcript + captions                                               */
/* ------------------------------------------------------------------ */

export interface TranscriptLine {
  cueId: string;
  kind: SceneCue["kind"];
  text: string;
  conceptTitle?: string;
  remedial: boolean;
}

/**
 * The printable, skimmable form of the lesson: every cue in array order,
 * static text. This exists because captions scroll and a transcript does not.
 */
export function sceneTranscript(scene: NarratedScene): TranscriptLine[] {
  return scene.cues.map((cue) => ({
    cueId: cue.id,
    kind: cue.kind,
    text: cue.text,
    conceptTitle: cue.conceptTitle,
    remedial: isNarrationCue(cue) ? cue.remedial : false,
  }));
}

function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const frac = total % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(frac, 3)}`;
}

/**
 * WebVTT for the main path. `docs/audio-and-video-lessons.md:471-477` notes
 * that the tutor panel ships a bare `<video>` with no caption track; a
 * narrated scene can hand one over for free, because every cue's duration is
 * already known exactly.
 */
export function sceneToVtt(scene: NarratedScene, durationOf: (cue: SceneCue) => number): string {
  const { entries } = sceneTimeline(scene, durationOf);
  const blocks = entries
    .filter((e) => e.durationMs > 0)
    .map((e, i) => {
      const cue = scene.cues[e.index];
      return `${i + 1}\n${vttTime(e.startMs)} --> ${vttTime(e.startMs + e.durationMs)}\n${cue.text}`;
    });
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}
