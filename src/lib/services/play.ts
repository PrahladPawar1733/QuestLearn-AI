import "server-only";
import { db } from "../db";
import { generateFollowUp } from "../demo/templates";
import { initialDifficulty, nextTargetDifficulty, pickNextQuestion } from "../engine/adaptive";
import { applyResult, emptyMastery, masteryLabel } from "../engine/mastery";
import { ACHIEVEMENTS, newAchievements, updateDailyStreak, XP_RULES, xpForAnswer } from "../engine/scoring";
import { AppError, Errors } from "../errors";
import { newId, nowIso } from "../ids";
import type { Attempt, Concept, ConceptMastery, GameWorld, Material, Question, Quest, Session, User } from "../types";
import { loadQuest, loadSession } from "./access";
import { toPublicQuestion } from "./public";
import { getOrCreateUser, updateUser } from "./users";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function conceptMap(ids: string[]) {
  const list = await db().getMany<Concept>("concepts", [...new Set(ids)]);
  return new Map(list.map((c) => [c.id, c]));
}

export async function masteryMap(uid: string, conceptIds: string[]) {
  const list = await db().getMany<ConceptMastery>("mastery", conceptIds.map((c) => `${uid}__${c}`));
  return new Map(list.map((m) => [m.conceptId, m]));
}

function mainAnswers(s: Session) {
  return s.answers.filter((a) => !a.isFollowUp);
}

export interface SessionView {
  session: {
    id: string;
    questId: string;
    kind: Session["kind"];
    world: GameWorld;
    status: Session["status"];
    xp: number;
    streak: number;
    bestStreak: number;
    answered: number;
    correct: number;
    playLength: number;
    targetDifficulty: Session["targetDifficulty"];
    lastAdaptation?: Session["adaptations"][number];
    /** Ordered outcomes of main questions, used to build the game world. */
    outcomes: ("correct" | "wrong")[];
    /** A lesson that was open when the page was left (resume support). */
    tutorFor?: { questionId: string; conceptId: string; isFollowUp: boolean };
  };
  quest: { id: string; title: string; subject: string; origin: Quest["origin"] };
  current: ReturnType<typeof toPublicQuestion> | null;
  currentIsFollowUp: boolean;
  hint?: string;
  user: { totalXP: number };
}

export async function viewSession(session: Session, quest: Quest, user?: User): Promise<SessionView> {
  const curId = session.pendingFollowUpId ?? session.currentQuestionId;
  let current: SessionView["current"] = null;
  let hint: string | undefined;
  if (curId && session.status === "active") {
    const q = await db().get<Question>("questions", curId);
    if (q) {
      const concepts = await conceptMap([q.conceptId]);
      current = toPublicQuestion(q, concepts.get(q.conceptId));
      if (session.hintsUsed.includes(q.id)) hint = q.hint;
    }
  }
  const main = mainAnswers(session);
  const u = user ?? (await getOrCreateUser(session.ownerId));
  return {
    session: {
      id: session.id,
      questId: session.questId,
      kind: session.kind,
      world: session.world,
      status: session.status,
      xp: session.xp + session.completionBonus,
      streak: session.streak,
      bestStreak: session.bestStreak,
      answered: main.length,
      correct: main.filter((a) => a.isCorrect).length,
      playLength: session.playLength,
      targetDifficulty: session.targetDifficulty,
      lastAdaptation: session.adaptations[session.adaptations.length - 1],
      outcomes: main.map((a) => (a.isCorrect ? "correct" : "wrong")),
      tutorFor: (() => {
        const a = session.tutorForQuestionId ? session.answers.find((x) => x.questionId === session.tutorForQuestionId) : undefined;
        return a ? { questionId: a.questionId, conceptId: a.conceptId, isFollowUp: a.isFollowUp } : undefined;
      })(),
    },
    quest: { id: quest.id, title: quest.title, subject: quest.subject, origin: quest.origin },
    current,
    currentIsFollowUp: !!session.pendingFollowUpId,
    hint,
    user: { totalXP: u.totalXP },
  };
}

/* ------------------------------------------------------------------ */
/* start                                                               */
/* ------------------------------------------------------------------ */

export async function startSession(
  uid: string,
  questId: string,
  opts: { world: GameWorld; practiceConceptIds?: string[] },
): Promise<SessionView> {
  const quest = await loadQuest(questId, uid);
  const material = await db().get<Material>("materials", quest.materialId);
  const pool = await db().getMany<Question>("questions", quest.questionIds);
  if (pool.length === 0) throw new AppError("EMPTY_QUEST", "This quest has no playable questions.", 409);

  let kind: Session["kind"] = "quest";
  let poolIds = pool.map((q) => q.id);
  let playLength = Math.min(quest.playLength, pool.length);

  const sessionId = newId("ses");
  if (opts.practiceConceptIds?.length) {
    // Revision practice: fresh template questions where possible, otherwise quest questions on those concepts.
    kind = "practice";
    const concepts = await conceptMap(opts.practiceConceptIds);
    const practice: Question[] = [];
    for (const cid of opts.practiceConceptIds.slice(0, 4)) {
      const c = concepts.get(cid);
      if (!c || !quest.conceptIds.includes(cid)) continue;
      const mastery = (await masteryMap(uid, [cid])).get(cid);
      const diff = (mastery?.masteryScore ?? 0) < 45 ? "easy" : "medium";
      for (let i = 0; i < 2; i++) {
        const generated = c.generatorKey
          ? generateFollowUp({
              generatorKey: c.generatorKey,
              conceptId: cid,
              questId: quest.id,
              difficulty: i === 0 ? diff : "medium",
              seed: `${sessionId}:${cid}:${i}`,
              id: newId("q"),
              avoid: [...pool, ...practice],
            })
          : null;
        if (generated) practice.push(generated);
      }
      if (!c.generatorKey) practice.push(...pool.filter((q) => q.conceptId === cid).slice(0, 2));
    }
    if (practice.length === 0) throw new AppError("NOTHING_TO_PRACTICE", "There's nothing to practise for those concepts yet.", 409);
    for (const q of practice) if (q.origin === "template") await db().set("questions", q);
    poolIds = practice.map((q) => q.id);
    playLength = practice.length;
  }

  const session: Session = {
    id: sessionId,
    ownerId: uid,
    questId: quest.id,
    world: opts.world,
    kind,
    poolQuestionIds: poolIds,
    playLength,
    status: "active",
    servedQuestionIds: [],
    hintsUsed: [],
    answers: [],
    xp: 0,
    streak: 0,
    bestStreak: 0,
    targetDifficulty: kind === "practice" ? "easy" : initialDifficulty(material?.settings.difficulty ?? "mixed"),
    adaptations: [],
    struggles: {},
    achievementsEarned: [],
    completionBonus: 0,
    startedAt: nowIso(),
  };
  const poolQs = await db().getMany<Question>("questions", poolIds);
  const mastery = await masteryMap(uid, quest.conceptIds);
  const first = kind === "practice" ? poolQs[0] : pickNextQuestion(poolQs, session, session.targetDifficulty, mastery);
  if (!first) throw new AppError("EMPTY_QUEST", "This quest has no playable questions.", 409);
  session.currentQuestionId = first.id;
  session.servedQuestionIds.push(first.id);
  session.adaptations.push({
    at: nowIso(),
    questionId: first.id,
    targetDifficulty: first.difficulty,
    reason: kind === "practice" ? "Revision practice on your weakest concepts, starting gently." : `Starting at ${session.targetDifficulty} difficulty.`,
  });
  await db().set("sessions", session);
  const u = await updateUser(uid, (x) => ({ ...x, worldsPlayed: x.worldsPlayed.includes(opts.world) ? x.worldsPlayed : [...x.worldsPlayed, opts.world] }));
  return viewSession(session, quest, u);
}

/* ------------------------------------------------------------------ */
/* hint                                                                */
/* ------------------------------------------------------------------ */

export async function takeHint(uid: string, sessionId: string, questionId: string) {
  return db().withLock(`session:${sessionId}`, async () => {
    const s = await loadSession(sessionId, uid);
    const cur = s.pendingFollowUpId ?? s.currentQuestionId;
    if (s.status !== "active" || cur !== questionId) throw new AppError("NOT_CURRENT", "That question isn't open right now.", 409);
    const q = await db().get<Question>("questions", questionId);
    if (!q?.hint) throw new AppError("NO_HINT", "There's no hint for this question.", 404);
    if (!s.hintsUsed.includes(questionId)) {
      s.hintsUsed.push(questionId);
      await db().set("sessions", s);
    }
    return { hint: q.hint, xpPenalty: XP_RULES.hintPenalty };
  });
}

/* ------------------------------------------------------------------ */
/* answer                                                              */
/* ------------------------------------------------------------------ */

export interface AnswerResult {
  duplicate: boolean;
  isCorrect: boolean;
  correctOptionId: string;
  selectedOptionId: string;
  explanation: string;
  steps: string[];
  selectedFeedback?: { misconception: string; feedback: string };
  visual?: Question["visual"];
  xpAwarded: number;
  xpBreakdown: { label: string; xp: number }[];
  isFollowUp: boolean;
  mastery: { conceptId: string; conceptTitle: string; before: number; after: number; label: string; attempts: number };
  newAchievements: { id: string; title: string; description: string; icon: string }[];
  nextAction: "next" | "tutor";
  session: SessionView["session"];
  origin: Question["origin"];
}

function attemptId(sessionId: string, questionId: string) {
  return `${sessionId}__${questionId}`;
}

export async function submitAnswer(uid: string, sessionId: string, questionId: string, selectedOptionId: string): Promise<AnswerResult> {
  return db().withLock(`session:${sessionId}`, async () => {
    const s = await loadSession(sessionId, uid);
    const quest = await loadQuest(s.questId, uid);
    const q = await db().get<Question>("questions", questionId);
    if (!q || (q.questId !== quest.id)) throw Errors.notFound("question");

    // Idempotency: a repeated submission returns the original result.
    const existing = await db().get<Attempt & { result?: AnswerResult }>("attempts", attemptId(sessionId, questionId));
    if (existing?.result) return { ...existing.result, duplicate: true };

    const isFollowUp = s.pendingFollowUpId === questionId;
    if (s.status !== "active" || (!isFollowUp && s.currentQuestionId !== questionId)) {
      throw new AppError("NOT_CURRENT", "That question isn't open right now. Refresh to continue your quest.", 409);
    }
    if (!q.options.some((o) => o.id === selectedOptionId)) throw Errors.badRequest("That answer option doesn't exist.");

    // Score in application code against the stored, validated key.
    const isCorrect = selectedOptionId === q.correctOptionId;
    const hintUsed = s.hintsUsed.includes(questionId);
    const xp = xpForAnswer({ correct: isCorrect, hintUsed, streakBefore: s.streak, isFollowUp });
    const df = q.distractorFeedback.find((d) => d.optionId === selectedOptionId);
    const at = nowIso();

    const attempt: Attempt = {
      id: attemptId(sessionId, questionId),
      ownerId: uid,
      sessionId,
      questId: quest.id,
      questionId,
      conceptId: q.conceptId,
      selectedOptionId,
      isCorrect,
      misconception: isCorrect ? undefined : df?.misconception,
      isFollowUp,
      hintUsed,
      xpAwarded: xp.total,
      createdAt: at,
    };
    // Persist the attempt first so progress survives any later failure.
    const created = await db().create("attempts", attempt);
    if (!created) {
      const again = await db().get<Attempt & { result?: AnswerResult }>("attempts", attempt.id);
      if (again?.result) return { ...again.result, duplicate: true };
    }

    // Session state
    s.answers.push({
      questionId,
      conceptId: q.conceptId,
      selectedOptionId,
      isCorrect,
      isFollowUp,
      hintUsed,
      xpAwarded: xp.total,
      difficulty: q.difficulty,
      answeredAt: at,
    });
    s.xp += xp.total;
    s.streak = isCorrect ? s.streak + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (!isCorrect) s.struggles[q.conceptId] = (s.struggles[q.conceptId] ?? 0) + 1;
    if (isFollowUp) s.pendingFollowUpId = undefined;
    else s.currentQuestionId = undefined;
    s.tutorForQuestionId = isCorrect ? undefined : questionId;

    // Mastery (application code, transparent formula)
    const concepts = await conceptMap([q.conceptId]);
    const concept = concepts.get(q.conceptId);
    const mId = `${uid}__${q.conceptId}`;
    const prev =
      (await db().get<ConceptMastery>("mastery", mId)) ??
      emptyMastery(uid, { id: q.conceptId, title: concept?.title ?? "Concept", subject: concept?.subject ?? quest.subject, questId: quest.id }, at);
    const next = applyResult(prev, { correct: isCorrect, followUp: isFollowUp, hint: hintUsed, difficulty: q.difficulty, at }, df?.misconception);
    await db().set("mastery", next);

    // User totals + achievements
    const physicsConcepts = (await db().list<ConceptMastery>("mastery", { ownerId: uid, subject: "Physics" })).filter((m) => m.attempts > 0).length;
    let earned: string[] = [];
    const user = await updateUser(uid, (u) => {
      const streak = updateDailyStreak(u, at);
      const updated: User = { ...u, ...streak, totalXP: u.totalXP + xp.total, questionsAnswered: u.questionsAnswered + 1 };
      earned = newAchievements(updated, s, { physicsConceptsPractised: physicsConcepts, questCompletedNow: false });
      updated.achievements = [...updated.achievements, ...earned.map((id) => ({ id, earnedAt: at }))];
      return updated;
    });
    s.achievementsEarned.push(...earned);
    await db().set("sessions", s);

    const view = await viewSession(s, quest, user);
    const result: AnswerResult = {
      duplicate: false,
      isCorrect,
      correctOptionId: q.correctOptionId,
      selectedOptionId,
      explanation: q.explanation,
      steps: q.steps ?? [],
      selectedFeedback: df ? { misconception: df.misconception, feedback: df.feedback } : undefined,
      visual: q.visual,
      xpAwarded: xp.total,
      xpBreakdown: xp.breakdown,
      isFollowUp,
      mastery: {
        conceptId: q.conceptId,
        conceptTitle: concept?.title ?? "",
        before: prev.masteryScore,
        after: next.masteryScore,
        label: masteryLabel(next.masteryScore, next.attempts),
        attempts: next.attempts,
      },
      newAchievements: ACHIEVEMENTS.filter((a) => earned.includes(a.id)),
      nextAction: isCorrect ? "next" : "tutor",
      session: view.session,
      origin: q.origin,
    };
    await db().set("attempts", { ...attempt, result });
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* next / complete                                                     */
/* ------------------------------------------------------------------ */

export async function advance(uid: string, sessionId: string): Promise<SessionView & { completed: boolean; newAchievements: typeof ACHIEVEMENTS }> {
  return db().withLock(`session:${sessionId}`, async () => {
    const s = await loadSession(sessionId, uid);
    const quest = await loadQuest(s.questId, uid);
    if (s.status === "completed") return { ...(await viewSession(s, quest)), completed: true, newAchievements: [] };
    // Already have an open question (e.g. double click): just return it.
    if (s.currentQuestionId || s.pendingFollowUpId) return { ...(await viewSession(s, quest)), completed: false, newAchievements: [] };

    s.tutorForQuestionId = undefined;
    const main = mainAnswers(s);
    const pool = await db().getMany<Question>("questions", s.poolQuestionIds);
    const mastery = await masteryMap(uid, quest.conceptIds);
    const { target, reason } = nextTargetDifficulty(s);
    s.targetDifficulty = target;
    const nextQ = main.length < s.playLength ? (s.kind === "practice" ? pool.find((q) => !s.servedQuestionIds.includes(q.id)) ?? null : pickNextQuestion(pool, s, target, mastery)) : null;

    if (!nextQ) return completeSession(s, quest, uid);

    s.currentQuestionId = nextQ.id;
    s.servedQuestionIds.push(nextQ.id);
    const why =
      nextQ.difficulty === target
        ? reason
        : `${reason} No unplayed ${target} question was left, so this one is ${nextQ.difficulty}.`;
    s.adaptations.push({ at: nowIso(), questionId: nextQ.id, targetDifficulty: target, reason: why });
    await db().set("sessions", s);
    return { ...(await viewSession(s, quest)), completed: false, newAchievements: [] };
  });
}

async function completeSession(s: Session, quest: Quest, uid: string) {
  const at = nowIso();
  const main = mainAnswers(s);
  const correct = main.filter((a) => a.isCorrect).length;
  s.status = "completed";
  s.completedAt = at;
  s.completionBonus = XP_RULES.questCompletion + (main.length > 0 && correct === main.length ? XP_RULES.perfectQuest : 0);
  const physicsConcepts = (await db().list<ConceptMastery>("mastery", { ownerId: uid, subject: "Physics" })).filter((m) => m.attempts > 0).length;
  let earned: string[] = [];
  const user = await updateUser(uid, (u) => {
    const updated: User = { ...u, totalXP: u.totalXP + s.completionBonus };
    earned = newAchievements(updated, s, { physicsConceptsPractised: physicsConcepts, questCompletedNow: s.kind === "quest" });
    updated.achievements = [...updated.achievements, ...earned.map((id) => ({ id, earnedAt: at }))];
    return updated;
  });
  s.achievementsEarned.push(...earned);
  await db().set("sessions", s);
  return { ...(await viewSession(s, quest, user)), completed: true, newAchievements: ACHIEVEMENTS.filter((a) => earned.includes(a.id)) };
}

/* ------------------------------------------------------------------ */
/* results                                                             */
/* ------------------------------------------------------------------ */

export async function sessionResults(uid: string, sessionId: string) {
  const s = await loadSession(sessionId, uid);
  const quest = await loadQuest(s.questId, uid);
  const main = mainAnswers(s);
  const followUps = s.answers.filter((a) => a.isFollowUp);
  const correct = main.filter((a) => a.isCorrect).length;
  const conceptIds = [...new Set(s.answers.map((a) => a.conceptId))];
  const concepts = await conceptMap(conceptIds);
  const mastery = await masteryMap(uid, conceptIds);
  const perConcept = conceptIds.map((cid) => {
    const ans = s.answers.filter((a) => a.conceptId === cid);
    const m = mastery.get(cid);
    return {
      conceptId: cid,
      title: concepts.get(cid)?.title ?? "Concept",
      answered: ans.length,
      correct: ans.filter((a) => a.isCorrect).length,
      followUpFixed: ans.some((a) => a.isFollowUp && a.isCorrect),
      mastery: m?.masteryScore ?? 0,
      label: masteryLabel(m?.masteryScore ?? 0, m?.attempts ?? 0),
    };
  });
  perConcept.sort((a, b) => a.mastery - b.mastery);
  const weak = perConcept.filter((c) => c.label === "Needs revision" || c.correct < c.answered);
  const strong = perConcept.filter((c) => !weak.includes(c));
  const durationMs = s.completedAt ? Date.parse(s.completedAt) - Date.parse(s.startedAt) : null;

  let recommendation: { title: string; detail: string; action: "practice" | "replay" | "new" };
  if (weak.length > 0) {
    recommendation = {
      title: `Practise ${weak.slice(0, 2).map((w) => w.title).join(" & ")}`,
      detail: `You missed ${weak.reduce((n, w) => n + (w.answered - w.correct), 0)} question(s) on ${weak.length === 1 ? "this concept" : "these concepts"}. A short revision round with fresh questions will lock it in.`,
      action: "practice",
    };
  } else if (main.length && correct / main.length >= 0.8) {
    recommendation = {
      title: "Try a new chapter",
      detail: "You answered at least 80% correctly. Upload your next chapter and turn it into a quest.",
      action: "new",
    };
  } else {
    recommendation = { title: "Replay this quest", detail: "Another run will give you new question orders and difficulty.", action: "replay" };
  }

  return {
    session: s,
    quest: { id: quest.id, title: quest.title, subject: quest.subject, origin: quest.origin },
    totals: {
      xp: s.xp + s.completionBonus,
      completionBonus: s.completionBonus,
      accuracy: main.length ? Math.round((correct / main.length) * 100) : 0,
      answered: main.length,
      correct,
      followUps: followUps.length,
      followUpsCorrect: followUps.filter((a) => a.isCorrect).length,
      bestStreak: s.bestStreak,
      durationMs,
    },
    perConcept,
    weakConceptIds: weak.map((w) => w.conceptId),
    strongConcepts: strong,
    weakConcepts: weak,
    adaptations: s.adaptations,
    achievements: ACHIEVEMENTS.filter((a) => s.achievementsEarned.includes(a.id)),
    recommendation,
  };
}
