import "server-only";
import { db } from "../db";
import { DEMO_QUEST_ID } from "../demo/collisions";
import { masteryLabel, MASTERY_CONFIG } from "../engine/mastery";
import { ACHIEVEMENTS, levelForXp } from "../engine/scoring";
import type { ConceptMastery, Material, Quest, Session } from "../types";
import { ensureDemoSeeded } from "./seed";
import { getOrCreateUser } from "./users";

export async function progressSnapshot(uid: string) {
  await ensureDemoSeeded();
  const store = db();
  const user = await getOrCreateUser(uid);
  const [mastery, sessions, materials] = await Promise.all([
    store.list<ConceptMastery>("mastery", { ownerId: uid }),
    store.list<Session>("sessions", { ownerId: uid }, { orderBy: "startedAt", desc: true }),
    store.list<Material>("materials", { ownerId: uid }, { orderBy: "createdAt", desc: true }),
  ]);
  const questIds = [...new Set([...sessions.map((s) => s.questId), ...materials.map((m) => m.questId).filter(Boolean) as string[], DEMO_QUEST_ID])];
  const quests = await store.getMany<Quest>("quests", questIds);
  const questById = new Map(quests.map((q) => [q.id, q]));

  const practised = mastery.filter((m) => m.attempts > 0);
  const overallMastery = practised.length ? Math.round(practised.reduce((s, m) => s + m.masteryScore, 0) / practised.length) : null;

  const bySubject = new Map<string, ConceptMastery[]>();
  for (const m of practised) bySubject.set(m.subject, [...(bySubject.get(m.subject) ?? []), m]);
  const subjects = [...bySubject.entries()].map(([subject, list]) => ({
    subject,
    concepts: list.length,
    mastery: Math.round(list.reduce((s, m) => s + m.masteryScore, 0) / list.length),
    mastered: list.filter((m) => masteryLabel(m.masteryScore, m.attempts) === "Mastered").length,
  }));

  const chapters = quests
    .filter((q) => q.ownerId === uid || sessions.some((s) => s.questId === q.id))
    .map((q) => {
      const ms = practised.filter((m) => q.conceptIds.includes(m.conceptId));
      const done = sessions.filter((s) => s.questId === q.id && s.status === "completed");
      return {
        questId: q.id,
        title: q.title,
        subject: q.subject,
        origin: q.origin,
        conceptsTotal: q.conceptIds.length,
        conceptsPractised: ms.length,
        conceptsMastered: ms.filter((m) => masteryLabel(m.masteryScore, m.attempts) === "Mastered").length,
        mastery: ms.length ? Math.round(ms.reduce((s, m) => s + m.masteryScore, 0) / ms.length) : 0,
        completedRuns: done.length,
      };
    });

  const completed = sessions.filter((s) => s.status === "completed");
  const accuracyOverTime = [...completed]
    .reverse()
    .map((s, i) => {
      const main = s.answers.filter((a) => !a.isFollowUp);
      return {
        run: i + 1,
        date: s.completedAt ?? s.startedAt,
        label: `${questById.get(s.questId)?.title ?? "Quest"} #${i + 1}`,
        accuracy: main.length ? Math.round((main.filter((a) => a.isCorrect).length / main.length) * 100) : 0,
        kind: s.kind,
      };
    });

  const weak = practised
    .map((m) => ({ ...m, label: masteryLabel(m.masteryScore, m.attempts) }))
    .filter((m) => m.label === "Needs revision" || m.recentResults.slice(-3).some((r) => !r.correct))
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 8)
    .map((m) => ({
      conceptId: m.conceptId,
      title: m.conceptTitle,
      subject: m.subject,
      questId: m.questId,
      mastery: m.masteryScore,
      label: m.label,
      topMisconception: Object.entries(m.misconceptions).sort((a, b) => b[1] - a[1])[0]?.[0],
    }));

  // Improvement after targeted practice: accuracy on a concept before its first
  // follow-up vs. accuracy from the follow-up onwards.
  const improvement = practised
    .filter((m) => m.followUpAttempts > 0)
    .map((m) => {
      const firstFU = m.recentResults.findIndex((r) => r.followUp);
      const before = firstFU > 0 ? m.recentResults.slice(0, firstFU) : [];
      const after = firstFU >= 0 ? m.recentResults.slice(firstFU) : [];
      const pct = (xs: typeof before) => (xs.length ? Math.round((xs.filter((x) => x.correct).length / xs.length) * 100) : null);
      return { conceptId: m.conceptId, title: m.conceptTitle, before: pct(before), after: pct(after), followUpsCorrect: m.followUpCorrect, followUps: m.followUpAttempts };
    });

  const active = sessions.find((s) => s.status === "active");
  const lvl = levelForXp(user.totalXP);
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      totalXP: user.totalXP,
      level: lvl,
      streakDays: user.currentStreakDays,
      lastActiveDay: user.lastActiveDay,
      questionsAnswered: user.questionsAnswered,
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, earnedAt: user.achievements.find((x) => x.id === a.id)?.earnedAt ?? null })),
      worldsPlayed: user.worldsPlayed,
    },
    hasActivity: user.questionsAnswered > 0,
    overallMastery,
    subjects,
    chapters,
    accuracyOverTime,
    weak,
    improvement,
    concepts: practised
      .map((m) => ({
        conceptId: m.conceptId,
        title: m.conceptTitle,
        subject: m.subject,
        mastery: m.masteryScore,
        label: masteryLabel(m.masteryScore, m.attempts),
        attempts: m.attempts,
        correct: m.correctAttempts,
        followUps: m.followUpAttempts,
        followUpCorrect: m.followUpCorrect,
        lastPracticedAt: m.lastPracticedAt,
        questId: m.questId,
      }))
      .sort((a, b) => a.mastery - b.mastery),
    recentSessions: sessions.slice(0, 8).map((s) => {
      const main = s.answers.filter((a) => !a.isFollowUp);
      return {
        id: s.id,
        questId: s.questId,
        title: questById.get(s.questId)?.title ?? "Quest",
        subject: questById.get(s.questId)?.subject ?? "",
        status: s.status,
        kind: s.kind,
        world: s.world,
        answered: main.length,
        playLength: s.playLength,
        correct: main.filter((a) => a.isCorrect).length,
        xp: s.xp + s.completionBonus,
        startedAt: s.startedAt,
      };
    }),
    continueSession: active
      ? { id: active.id, questId: active.questId, title: questById.get(active.questId)?.title ?? "Quest", answered: active.answers.filter((a) => !a.isFollowUp).length, playLength: active.playLength, world: active.world }
      : null,
    materials: materials.map((m) => ({ id: m.id, title: m.title, subject: m.settings.subject, stage: m.stage, questId: m.questId, createdAt: m.createdAt, files: m.files.length, error: m.error })),
    masteryConfig: MASTERY_CONFIG,
  };
}

export type ProgressSnapshot = Awaited<ReturnType<typeof progressSnapshot>>;
