/**
 * Turning one run into a story a student can read.
 *
 * All pure, all tested. The results screen renders these strings verbatim, so
 * the honesty rules live here rather than in JSX: nothing claims movement it
 * cannot see, and the adaptive timeline is grouped into prose instead of being
 * dumped as one row per question.
 */
import type { Difficulty } from "@/lib/types";

const ORDER: Difficulty[] = ["easy", "medium", "hard"];

export interface AdaptationNoteLike {
  targetDifficulty: Difficulty;
  reason: string;
}

export interface AdaptationStep {
  /** 1-based question numbers this step covers, inclusive. */
  from: number;
  to: number;
  difficulty: Difficulty;
  direction: "start" | "up" | "down" | "hold";
  /** The engine's own explanation for arriving at this difficulty. */
  reason: string;
}

/**
 * Collapse one-note-per-question into difficulty runs.
 *
 * A five-question quest usually produces two or three steps, which reads as a
 * narrative ("you got two right, so it stepped up") instead of five near-identical
 * rows. The kept reason is always the *first* of the run — the one that explains
 * why the difficulty is where it is.
 */
export function adaptationStory(notes: AdaptationNoteLike[]): AdaptationStep[] {
  const out: AdaptationStep[] = [];
  notes.forEach((n, i) => {
    const prev = out[out.length - 1];
    if (prev && prev.difficulty === n.targetDifficulty) {
      prev.to = i + 1;
      return;
    }
    const direction: AdaptationStep["direction"] = !prev
      ? "start"
      : ORDER.indexOf(n.targetDifficulty) > ORDER.indexOf(prev.difficulty)
        ? "up"
        : ORDER.indexOf(n.targetDifficulty) < ORDER.indexOf(prev.difficulty)
          ? "down"
          : "hold";
    out.push({ from: i + 1, to: i + 1, difficulty: n.targetDifficulty, direction, reason: n.reason });
  });
  return out;
}

export function stepRangeLabel(s: AdaptationStep): string {
  return s.from === s.to ? `Question ${s.from}` : `Questions ${s.from}–${s.to}`;
}

export function directionLabel(d: AdaptationStep["direction"], difficulty: Difficulty): string {
  if (d === "start") return `Started at ${difficulty}`;
  if (d === "up") return `Stepped up to ${difficulty}`;
  if (d === "down") return `Stepped back to ${difficulty}`;
  return `Held at ${difficulty}`;
}

/* ------------------------------------------------------------------ */
/* the run, in one honest line                                         */
/* ------------------------------------------------------------------ */

export interface ConceptOutcome {
  conceptId: string;
  title: string;
  answered: number;
  correct: number;
  followUpFixed: boolean;
  mastery: number;
  label: string;
  /** Only present once the server records the pre-run score. */
  masteryBefore?: number;
  labelBefore?: string;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/**
 * Concepts in the order a student cares about: mistakes they fixed first
 * (the most motivating event in the app), then whatever is weakest.
 */
export function orderConceptsForStory<T extends ConceptOutcome>(concepts: T[]): T[] {
  return [...concepts].sort((a, b) => {
    if (a.followUpFixed !== b.followUpFixed) return a.followUpFixed ? -1 : 1;
    const aMissed = a.answered - a.correct;
    const bMissed = b.answered - b.correct;
    if (aMissed !== bMissed) return bMissed - aMissed;
    return a.mastery - b.mastery;
  });
}

/** Mastery movement for one concept, or null when the server did not record a before-score. */
export function conceptDelta(c: ConceptOutcome): { before: number; after: number; delta: number; bandChanged: boolean } | null {
  if (c.masteryBefore == null) return null;
  return {
    before: c.masteryBefore,
    after: c.mastery,
    delta: c.mastery - c.masteryBefore,
    bandChanged: !!c.labelBefore && c.labelBefore !== c.label,
  };
}

/**
 * The lead sentence of the results screen. It reports what happened to the
 * *concepts*, never a score, and it only mentions movement when movement was
 * actually measured.
 */
export function runHeadline(concepts: ConceptOutcome[]): string {
  if (concepts.length === 0) return "No questions were answered in this run, so there is nothing to report yet.";
  const touched = concepts.length;
  const fixed = concepts.filter((c) => c.followUpFixed).length;
  const clean = concepts.filter((c) => c.answered > 0 && c.correct === c.answered).length;
  const deltas = concepts.map(conceptDelta).filter((d): d is NonNullable<ReturnType<typeof conceptDelta>> => d != null);
  const movedUp = deltas.filter((d) => d.delta > 0).length;
  const bandsUp = deltas.filter((d) => d.delta > 0 && d.bandChanged).length;

  const parts = [`You worked on ${touched} ${plural(touched, "concept", "concepts")}.`];
  if (deltas.length === concepts.length && touched > 0) {
    parts.push(`${movedUp} of ${touched} moved up${bandsUp > 0 ? `, ${bandsUp} into a new band` : ""}.`);
  } else if (clean > 0) {
    parts.push(`${clean} ${plural(clean, "was", "were")} answered without a miss.`);
  }
  if (fixed > 0) {
    parts.push(`You turned ${fixed} ${plural(fixed, "mistake", "mistakes")} into a correct answer on the retry.`);
  }
  return parts.join(" ");
}

/** What to carry into the next session, in the student's words. */
export function reviseNextSentence(concepts: ConceptOutcome[]): string {
  const weak = concepts.filter((c) => c.answered > c.correct);
  if (weak.length === 0) return "Nothing from this run needs another pass — every question you were asked, you got right.";
  const names = weak.slice(0, 3).map((c) => c.title);
  const more = weak.length - names.length;
  const list = names.join(", ") + (more > 0 ? ` and ${more} more` : "");
  return `Revise next: ${list}.`;
}

/* ------------------------------------------------------------------ */
/* presentation helpers                                               */
/* ------------------------------------------------------------------ */

export type Tone = "success" | "cyan" | "primary" | "amber" | "neutral";

/**
 * Badge tone for a mastery band. Takes a plain string because the results
 * payload types `label` as one; unknown values fall back to neutral rather
 * than throwing.
 */
export function labelTone(label: string): Tone {
  switch (label) {
    case "Mastered":
      return "success";
    case "Proficient":
      return "cyan";
    case "Developing":
      return "primary";
    case "Needs revision":
      return "amber";
    default:
      return "neutral";
  }
}
