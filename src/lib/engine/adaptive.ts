/**
 * Adaptive next-question selection.
 *
 * - Two correct answers in a row  → raise target difficulty one step.
 * - A wrong answer                → hold difficulty (the tutor + follow-up handle it).
 * - Two wrong answers in a row, or two misses on the same concept
 *                                 → lower target difficulty one step.
 * Among unplayed questions we prefer the target difficulty, then concepts the
 * student is weakest on, and avoid serving the same concept twice in a row.
 */
import type { ConceptMastery, Difficulty, Question, Session } from "../types";

const ORDER: Difficulty[] = ["easy", "medium", "hard"];
const step = (d: Difficulty, by: number): Difficulty => ORDER[Math.max(0, Math.min(2, ORDER.indexOf(d) + by))];

export function nextTargetDifficulty(session: Session): { target: Difficulty; reason: string } {
  const main = session.answers.filter((a) => !a.isFollowUp);
  const all = session.answers;
  const cur = session.targetDifficulty;
  if (all.length === 0) return { target: cur, reason: `Starting at ${cur} difficulty.` };

  const last2 = main.slice(-2);
  const lastAll = all.slice(-2);
  const lastConcept = all[all.length - 1].conceptId;
  const misses = session.struggles[lastConcept] ?? 0;

  if (lastAll.length === 2 && lastAll.every((a) => !a.isCorrect)) {
    return { target: step(cur, -1), reason: "Two misses in a row, so the next question is a little easier." };
  }
  if (misses >= 2 && !all[all.length - 1].isCorrect) {
    return { target: step(cur, -1), reason: "This concept has tripped you up twice, so we're stepping back to build it up." };
  }
  if (last2.length === 2 && last2.every((a) => a.isCorrect && !a.hintUsed)) {
    const t = step(cur, 1);
    return {
      target: t,
      reason: t === cur ? "You're on a roll at the hardest level. Keep going!" : `Two correct in a row, so we're stepping up to ${t}.`,
    };
  }
  const last = all[all.length - 1];
  if (last.isFollowUp && last.isCorrect) return { target: cur, reason: "You fixed that mistake. Continuing at the same level." };
  return { target: cur, reason: `Staying at ${cur} difficulty.` };
}

export function pickNextQuestion(
  pool: Question[],
  session: Session,
  target: Difficulty,
  mastery: Map<string, ConceptMastery>,
): Question | null {
  const served = new Set(session.servedQuestionIds);
  const candidates = pool.filter((q) => !served.has(q.id) && !q.followUpOf);
  if (candidates.length === 0) return null;
  const lastConcept = session.answers[session.answers.length - 1]?.conceptId;
  const servedCount = (cid: string) => session.answers.filter((a) => a.conceptId === cid).length;

  const scored = candidates.map((q) => {
    const dDist = Math.abs(ORDER.indexOf(q.difficulty) - ORDER.indexOf(target));
    const m = mastery.get(q.conceptId)?.masteryScore ?? 30;
    let score = dDist * 100; // difficulty match dominates
    score += m / 4; // prefer weaker concepts
    score += servedCount(q.conceptId) * 8; // spread coverage across concepts
    if (q.conceptId === lastConcept) score += 30; // avoid back-to-back same concept
    return { q, score };
  });
  scored.sort((a, b) => a.score - b.score || a.q.id.localeCompare(b.q.id));
  return scored[0].q;
}

export function initialDifficulty(pref: string): Difficulty {
  if (pref === "easy" || pref === "medium" || pref === "hard") return pref;
  return "easy"; // "mixed" warms up with an easier question
}
