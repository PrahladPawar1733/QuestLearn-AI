/**
 * Explaining the mastery number back to the student.
 *
 * Every statement produced here is derived by *running the real formula*
 * (`computeMastery` / `masteryLabel` from `src/lib/engine/mastery.ts`) over the
 * student's actual stored results with hypothetical answers appended. Nothing
 * here re-implements the formula and nothing invents a threshold: the only
 * inputs are `MASTERY_CONFIG`, the student's `recentResults` and their
 * `attempts` count.
 *
 * Two honesty rules are baked in rather than left to the UI:
 *   1. A projection is only reported when it is true for *every* difficulty the
 *      next question could have, so "3 more correct answers reaches Proficient"
 *      can never under-promise the work required.
 *   2. A trend is never drawn from fewer than `MIN_TREND_POINTS` recomputed
 *      scores, and the reconstruction starts at a point where the full
 *      eight-result window is actually known.
 */
import { computeMastery, MASTERY_CONFIG, masteryLabel, type MasteryLabel } from "@/lib/engine/mastery";
import type { Difficulty, MasteryResult } from "@/lib/types";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"] as const;

/** Weakest → strongest. `masteryLabel` can return any of these. */
export const LABEL_ORDER: readonly MasteryLabel[] = ["Not started", "Needs revision", "Developing", "Proficient", "Mastered"] as const;

/** How many recomputed scores we insist on before calling anything a trend. */
export const MIN_TREND_POINTS = 3;

/** How many hypothetical answers ahead we are willing to look. */
export const PROJECTION_HORIZON = 8;

function rank(label: MasteryLabel): number {
  return LABEL_ORDER.indexOf(label);
}

/** The label immediately above `label`, or null if there is nothing above it. */
export function nextLabelUp(label: MasteryLabel): MasteryLabel | null {
  const i = rank(label);
  if (i < 0 || i >= LABEL_ORDER.length - 1) return null;
  // "Not started" has no score of its own; the first band a student can land in is "Needs revision".
  return LABEL_ORDER[i + 1];
}

/** The minimum score and attempt count `masteryLabel` requires for a band. */
export function requirementFor(label: MasteryLabel): { min: number; minAttempts: number } | null {
  const l = MASTERY_CONFIG.levels.find((x) => x.label === label);
  return l ? { min: l.min, minAttempts: l.minAttempts } : null;
}

/**
 * The highest score a full window of plain correct answers can reach.
 *
 * Worth knowing, and worth telling the student: because the formula keeps a
 * neutral prior in the denominator for ever, a run of ordinary correct answers
 * tops out well below 100 — 81% at hard difficulty, which is *below* the 85%
 * "Mastered" threshold. The last stretch is only reachable through follow-up
 * questions, which carry extra weight. Computed here rather than written down,
 * so it stays true if `MASTERY_CONFIG` is retuned.
 */
export function reachableCeiling(difficulty: Difficulty = "hard", followUp = false): number {
  return computeMastery(
    Array.from({ length: MASTERY_CONFIG.windowSize }, () => ({
      correct: true,
      followUp,
      hint: false,
      difficulty,
      at: "ceiling",
    })),
  );
}

function hypothetical(difficulty: Difficulty, at: string): MasteryResult {
  // A plain correct answer: no hint, not a follow-up. The least generous of the
  // three weightings the formula knows about, so the projection is never flattered.
  return { correct: true, followUp: false, hint: false, difficulty, at };
}

/**
 * Smallest number of consecutive hint-free correct answers at `difficulty`
 * that would carry this concept to `target`, or null if it is further away
 * than `horizon` answers.
 */
function answersToReach(
  recentResults: MasteryResult[],
  attempts: number,
  target: MasteryLabel,
  difficulty: Difficulty,
  horizon: number,
): number | null {
  const history = [...recentResults];
  for (let k = 1; k <= horizon; k++) {
    history.push(hypothetical(difficulty, `projection-${k}`));
    const label = masteryLabel(computeMastery(history), attempts + k);
    if (rank(label) >= rank(target)) return k;
  }
  return null;
}

export interface MasteryProjection {
  /** The score the real formula gives for the stored results. */
  score: number;
  attempts: number;
  label: MasteryLabel;
  /** The band immediately above the current one, or null when already Mastered. */
  target: MasteryLabel | null;
  /** True when the score already clears the target band and only attempts are missing. */
  scoreAlreadyClears: boolean;
  /** Per-difficulty answer counts; null means "further than the horizon". */
  answersNeeded: Record<Difficulty, number | null>;
  /** Smallest / largest count across difficulties where one exists. */
  best: number | null;
  worst: number | null;
  horizon: number;
}

export function projectMastery(
  input: { attempts: number; recentResults: MasteryResult[] },
  horizon = PROJECTION_HORIZON,
): MasteryProjection {
  const { attempts } = input;
  const recentResults = input.recentResults ?? [];
  const score = computeMastery(recentResults);
  const label = masteryLabel(score, attempts);
  const target = attempts === 0 ? null : nextLabelUp(label);
  const answersNeeded = { easy: null, medium: null, hard: null } as Record<Difficulty, number | null>;
  if (target) {
    for (const d of DIFFICULTIES) answersNeeded[d] = answersToReach(recentResults, attempts, target, d, horizon);
  }
  const found = DIFFICULTIES.map((d) => answersNeeded[d]).filter((n): n is number => n != null);
  const req = target ? requirementFor(target) : null;
  return {
    score,
    attempts,
    label,
    target,
    scoreAlreadyClears: !!req && score >= req.min,
    answersNeeded,
    best: found.length ? Math.min(...found) : null,
    worst: found.length === DIFFICULTIES.length ? Math.max(...found) : null,
    horizon,
  };
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/**
 * A plain-language sentence a 14-year-old can act on. Every branch is literally
 * true of the formula; where a precise count is not derivable the sentence gets
 * vaguer rather than more confident.
 */
export function nextStepSentence(p: MasteryProjection): string {
  if (p.attempts === 0) return "Not practised yet. Answer one question on this and a score appears.";
  if (!p.target) return "This is as high as the bands go. A short revision round now and then keeps it there.";
  const req = requirementFor(p.target);
  const needAttempts = req && p.attempts < req.minAttempts ? req.minAttempts - p.attempts : 0;

  // Only the attempt count is missing: say exactly that, it is the clearest case.
  if (p.scoreAlreadyClears && needAttempts > 0) {
    return `Your score already clears ${p.target}. ${needAttempts} more correct ${plural(needAttempts, "answer", "answers")} without a hint and the label follows — that band needs ${req?.minAttempts} attempts in total.`;
  }
  if (p.worst != null && p.best === p.worst) {
    return `${p.best} more correct ${plural(p.best, "answer", "answers")} in a row, without a hint, would reach ${p.target}.`;
  }
  if (p.worst != null && p.best != null) {
    return `Between ${p.best} and ${p.worst} more correct answers in a row — no hints — would reach ${p.target}. Harder questions count for more, so they get there sooner.`;
  }
  if (p.best != null) {
    return `${p.best} more correct ${plural(p.best, "answer", "answers")} on harder questions would reach ${p.target}. Easy questions alone will not get there, because they carry less weight.`;
  }
  // Nothing within the horizon. Say why, using numbers the formula itself produces.
  const ceiling = reachableCeiling("hard", false);
  if (req && req.min > ceiling) {
    return `${p.target} needs ${req.min}%. A straight run of ${MASTERY_CONFIG.windowSize} ordinary correct answers tops out at ${ceiling}%, because every concept keeps a neutral starting weight in the formula. The rest comes from follow-up questions after a mistake — those count ×${MASTERY_CONFIG.followUpWeight}.`;
  }
  return `${p.target} is more than ${p.horizon} correct answers away right now. Keep practising — follow-up questions after a mistake count ×${MASTERY_CONFIG.followUpWeight}, so they move this fastest.`;
}

/* ------------------------------------------------------------------ */
/* trend                                                               */
/* ------------------------------------------------------------------ */

export interface TimelinePoint {
  /** 1-based attempt number this score belongs to. */
  attempt: number;
  at: string;
  score: number;
  correct: boolean;
}

/**
 * The student's score recomputed after each stored result — a reconstruction,
 * not an archive, so it only starts where the eight-result window the formula
 * uses is fully known. When older results have been trimmed away we start eight
 * results in; otherwise the whole history is exact from the first answer.
 */
export function masteryTimeline(recentResults: MasteryResult[], attempts: number): TimelinePoint[] {
  const n = recentResults.length;
  if (n === 0) return [];
  const complete = attempts <= n;
  const start = complete ? 0 : Math.min(n - 1, MASTERY_CONFIG.windowSize - 1);
  const out: TimelinePoint[] = [];
  for (let i = start; i < n; i++) {
    out.push({
      attempt: attempts - (n - 1 - i),
      at: recentResults[i].at,
      score: computeMastery(recentResults.slice(0, i + 1)),
      correct: recentResults[i].correct,
    });
  }
  return out;
}

export function hasTrend(points: TimelinePoint[]): boolean {
  return points.length >= MIN_TREND_POINTS;
}

/** Direction of travel over the plotted points. Never called with fewer than MIN_TREND_POINTS. */
export function trendSummary(points: TimelinePoint[]): string {
  if (!hasTrend(points)) return "Not enough practice yet to show a trend.";
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.score - first.score;
  const span = `over your last ${points.length} answers`;
  if (delta >= 3) return `Up ${delta} points ${span}.`;
  if (delta <= -3) return `Down ${Math.abs(delta)} points ${span}.`;
  return `Steady ${span} (within 3 points).`;
}

/* ------------------------------------------------------------------ */
/* misconceptions                                                      */
/* ------------------------------------------------------------------ */

/** `misconceptions` keys are slugs like "forgot-mass-ratio". Make them readable. */
export function humanizeMisconception(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

export interface RecurringMisconception {
  key: string;
  label: string;
  count: number;
  concepts: string[];
}

/**
 * Misconceptions a student has hit more than once, newest tally first.
 * `minCount` defaults to 2 because a single slip is not a pattern.
 */
export function recurringMisconceptions(
  rows: { conceptTitle: string; misconceptions: Record<string, number> }[],
  minCount = 2,
): RecurringMisconception[] {
  const agg = new Map<string, RecurringMisconception>();
  for (const row of rows) {
    for (const [key, count] of Object.entries(row.misconceptions ?? {})) {
      if (!count) continue;
      const cur = agg.get(key) ?? { key, label: humanizeMisconception(key), count: 0, concepts: [] };
      cur.count += count;
      if (!cur.concepts.includes(row.conceptTitle)) cur.concepts.push(row.conceptTitle);
      agg.set(key, cur);
    }
  }
  return [...agg.values()].filter((m) => m.count >= minCount).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ */
/* time + staleness                                                    */
/* ------------------------------------------------------------------ */

export const MS_PER_DAY = 86_400_000;

export function daysSince(iso: string, now: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / MS_PER_DAY);
}

export function lastPractisedLabel(iso: string, now: number): string {
  const d = daysSince(iso, now);
  if (d == null) return "Last practised: unknown";
  if (d <= 0) return "Practised today";
  if (d === 1) return "Practised yesterday";
  if (d < 14) return `Practised ${d} days ago`;
  if (d < 60) return `Practised ${Math.floor(d / 7)} weeks ago`;
  return `Practised ${Math.floor(d / 30)} months ago`;
}

/**
 * Longest session we are willing to count as time at work. Anything above this
 * is a tab left open, not study, so it is excluded rather than guessed at.
 */
export const MAX_PLAUSIBLE_SESSION_MS = 90 * 60_000;

export function timeOnTask(sessions: { startedAt: string; completedAt?: string | null }[]): {
  ms: number;
  runs: number;
  excluded: number;
} {
  let ms = 0;
  let runs = 0;
  let excluded = 0;
  for (const s of sessions) {
    if (!s.completedAt) continue;
    const d = Date.parse(s.completedAt) - Date.parse(s.startedAt);
    if (!Number.isFinite(d) || d <= 0) continue;
    if (d > MAX_PLAUSIBLE_SESSION_MS) {
      excluded++;
      continue;
    }
    ms += d;
    runs++;
  }
  return { ms, runs, excluded };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return `${Math.round(ms / 1000)}s`;
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ------------------------------------------------------------------ */
/* what to do next                                                     */
/* ------------------------------------------------------------------ */

export interface RevisionCandidate {
  conceptId: string;
  title: string;
  subject: string;
  questId: string;
  score: number;
  label: MasteryLabel;
  attempts: number;
  lastPracticedAt: string;
  daysSince: number | null;
  topMisconception?: string;
}

/**
 * Ordering rule, stated in the UI so it is never a black box: weakest band
 * first, then lowest score, then longest since practised. This is deliberately
 * *not* a spaced-repetition schedule — there is no `nextReviewAt` in the data
 * model yet, so claiming a due date would be an invention.
 */
export function revisionOrder<T extends { score: number; daysSince: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.score - b.score || (b.daysSince ?? 0) - (a.daysSince ?? 0));
}

/**
 * One honest line about overall progress. Deliberately refuses to average a
 * handful of attempts into a headline: under `MIN_TREND_POINTS` answered
 * questions it says there is not enough practice yet.
 */
export function overallStatement(input: {
  questionsAnswered: number;
  conceptsPractised: number;
  conceptsAtProficient: number;
  weakCount: number;
}): string {
  const { questionsAnswered, conceptsPractised, conceptsAtProficient, weakCount } = input;
  if (questionsAnswered === 0) return "No practice recorded yet, so there is nothing to report.";
  if (questionsAnswered < MIN_TREND_POINTS || conceptsPractised === 0) {
    return `${questionsAnswered} ${plural(questionsAnswered, "question", "questions")} answered so far — not enough practice yet to say how you are doing.`;
  }
  const solid = `${conceptsAtProficient} of ${conceptsPractised} ${plural(conceptsPractised, "concept", "concepts")} you have practised ${plural(conceptsAtProficient, "is", "are")} at Proficient or above`;
  if (weakCount === 0) return `${solid}, and nothing is currently flagged for revision.`;
  return `${solid}; ${weakCount} ${plural(weakCount, "needs", "need")} another pass.`;
}
