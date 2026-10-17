/**
 * Transparent concept-mastery estimate.
 *
 *   mastery = (Σ wᵢ·sᵢ + PRIOR·PRIOR_WEIGHT) / (Σ wᵢ + PRIOR_WEIGHT)
 *
 * over the most recent results, where
 *   sᵢ  = 1 for correct, HINT_CREDIT if correct with a hint, 0 if wrong
 *   wᵢ  = RECENCY_DECAY^(age) × (FOLLOW_UP_WEIGHT if it was a follow-up) × difficulty weight
 *
 * The prior pulls estimates toward "unknown" until there is enough evidence,
 * so one correct answer can never read as mastery. "Mastered" additionally
 * requires a minimum number of attempts. This is a heuristic for guiding
 * practice, not a validated psychometric measure.
 */
import type { ConceptMastery, Difficulty, MasteryResult } from "../types";

export const MASTERY_CONFIG = {
  windowSize: 8,
  recencyDecay: 0.8,
  prior: 0.3,
  priorWeight: 2,
  hintCredit: 0.5,
  followUpWeight: 1.5,
  difficultyWeight: { easy: 0.8, medium: 1, hard: 1.25 } as Record<Difficulty, number>,
  levels: [
    { min: 85, label: "Mastered", minAttempts: 4 },
    { min: 70, label: "Proficient", minAttempts: 3 },
    { min: 45, label: "Developing", minAttempts: 1 },
    { min: 0, label: "Needs revision", minAttempts: 0 },
  ],
} as const;

export type MasteryLabel = "Mastered" | "Proficient" | "Developing" | "Needs revision" | "Not started";

export function computeMastery(results: MasteryResult[], cfg = MASTERY_CONFIG): number {
  const recent = results.slice(-cfg.windowSize);
  let num = cfg.prior * cfg.priorWeight;
  let den = cfg.priorWeight;
  recent.forEach((r, i) => {
    const age = recent.length - 1 - i;
    const w =
      cfg.recencyDecay ** age * (r.followUp ? cfg.followUpWeight : 1) * cfg.difficultyWeight[r.difficulty];
    const s = r.correct ? (r.hint ? cfg.hintCredit : 1) : 0;
    num += w * s;
    den += w;
  });
  return Math.round((num / den) * 100);
}

export function masteryLabel(score: number, attempts: number): MasteryLabel {
  if (attempts === 0) return "Not started";
  for (const l of MASTERY_CONFIG.levels) {
    if (score >= l.min && attempts >= l.minAttempts) return l.label;
  }
  return "Needs revision";
}

export function applyResult(
  m: ConceptMastery,
  r: MasteryResult,
  misconception?: string,
): ConceptMastery {
  const recentResults = [...m.recentResults, r].slice(-MASTERY_CONFIG.windowSize * 2);
  const misconceptions = { ...m.misconceptions };
  if (!r.correct && misconception) misconceptions[misconception] = (misconceptions[misconception] ?? 0) + 1;
  return {
    ...m,
    attempts: m.attempts + 1,
    correctAttempts: m.correctAttempts + (r.correct ? 1 : 0),
    followUpAttempts: m.followUpAttempts + (r.followUp ? 1 : 0),
    followUpCorrect: m.followUpCorrect + (r.followUp && r.correct ? 1 : 0),
    recentResults,
    misconceptions,
    masteryScore: computeMastery(recentResults),
    lastPracticedAt: r.at,
  };
}

export function emptyMastery(
  ownerId: string,
  concept: { id: string; title: string; subject: string; questId: string },
  at: string,
): ConceptMastery {
  return {
    id: `${ownerId}__${concept.id}`,
    ownerId,
    conceptId: concept.id,
    conceptTitle: concept.title,
    subject: concept.subject,
    questId: concept.questId,
    attempts: 0,
    correctAttempts: 0,
    followUpAttempts: 0,
    followUpCorrect: 0,
    recentResults: [],
    misconceptions: {},
    masteryScore: computeMastery([]),
    lastPracticedAt: at,
  };
}
