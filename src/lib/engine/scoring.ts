/**
 * XP, levels and achievements. All of this runs on the server; the client
 * only displays what the server returns.
 */
import type { Session, User } from "../types";

export const XP_RULES = {
  correct: 100,
  hintPenalty: 40,
  streakBonusPer: 10, // per consecutive correct answer beyond the first
  streakBonusCap: 50,
  followUpRecovery: 50, // extra for fixing a mistake on the follow-up
  questCompletion: 150,
  perfectQuest: 100,
} as const;

export function xpForAnswer(opts: { correct: boolean; hintUsed: boolean; streakBefore: number; isFollowUp: boolean }) {
  if (!opts.correct) return { total: 0, breakdown: [] as { label: string; xp: number }[] };
  const breakdown: { label: string; xp: number }[] = [{ label: "Correct answer", xp: XP_RULES.correct }];
  if (opts.hintUsed) breakdown.push({ label: "Hint used", xp: -XP_RULES.hintPenalty });
  else if (opts.streakBefore >= 1) {
    breakdown.push({
      label: `Streak ×${opts.streakBefore + 1}`,
      xp: Math.min(XP_RULES.streakBonusCap, XP_RULES.streakBonusPer * opts.streakBefore),
    });
  }
  if (opts.isFollowUp) breakdown.push({ label: "Mistake fixed", xp: XP_RULES.followUpRecovery });
  return { total: breakdown.reduce((s, b) => s + b.xp, 0), breakdown };
}

/** Level n starts at 150·n·(n−1) XP: 0, 300, 900, 1800, 3000, … */
export function levelForXp(xp: number) {
  let level = 1;
  while (150 * (level + 1) * level <= xp) level++;
  const start = 150 * level * (level - 1);
  const next = 150 * (level + 1) * level;
  return { level, start, next, progress: (xp - start) / (next - start) };
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-quest", title: "First Quest", description: "Complete your first quest.", icon: "Flag" },
  { id: "five-in-a-row", title: "Five in a Row", description: "Answer five questions correctly in a row.", icon: "Flame" },
  {
    id: "mistake-to-mastery",
    title: "Mistake to Mastery",
    description: "Get a question wrong, study it, then nail the follow-up.",
    icon: "Sparkles",
  },
  { id: "physics-explorer", title: "Physics Explorer", description: "Practise five different physics concepts.", icon: "Atom" },
  {
    id: "chapter-conqueror",
    title: "Chapter Conqueror",
    description: "Finish a quest with at least 80% accuracy.",
    icon: "Crown",
  },
  { id: "world-hopper", title: "World Hopper", description: "Play quests in three different game worlds.", icon: "Globe" },
];

/** Achievements unlocked by the latest change. Only returns ids not already held. */
export function newAchievements(
  user: User,
  session: Session,
  ctx: { physicsConceptsPractised: number; questCompletedNow: boolean },
): string[] {
  const held = new Set(user.achievements.map((a) => a.id));
  const earned: string[] = [];
  const add = (id: string) => !held.has(id) && !earned.includes(id) && earned.push(id);

  if (ctx.questCompletedNow) add("first-quest");
  if (session.bestStreak >= 5) add("five-in-a-row");
  const a = session.answers;
  for (let i = 0; i < a.length; i++) {
    if (a[i].isFollowUp && a[i].isCorrect) {
      add("mistake-to-mastery");
      break;
    }
  }
  if (ctx.physicsConceptsPractised >= 5) add("physics-explorer");
  if (ctx.questCompletedNow) {
    const main = a.filter((x) => !x.isFollowUp);
    const acc = main.length ? main.filter((x) => x.isCorrect).length / main.length : 0;
    if (acc >= 0.8) add("chapter-conqueror");
  }
  if (new Set(user.worldsPlayed).size >= 3) add("world-hopper");
  return earned;
}

/** Day-based streak: consecutive calendar days (UTC) with at least one answer. */
export function updateDailyStreak(user: User, nowIso: string): Pick<User, "currentStreakDays" | "lastActiveDay"> {
  const today = nowIso.slice(0, 10);
  if (user.lastActiveDay === today) return { currentStreakDays: user.currentStreakDays, lastActiveDay: today };
  const y = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  return {
    currentStreakDays: user.lastActiveDay === y ? user.currentStreakDays + 1 : 1,
    lastActiveDay: today,
  };
}
