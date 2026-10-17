import "server-only";
import { aiAvailable } from "../ai/client";
import { tutorExplain, tutorFollowUp } from "../ai/workflows";
import { audit } from "../audit";
import { db } from "../db";
import { DEMO_LESSONS, isDemoQuest } from "../demo/collisions";
import { generateFollowUp } from "../demo/templates";
import { AppError } from "../errors";
import { newId, nowIso } from "../ids";
import type { Attempt, Concept, ConceptMastery, ContentOrigin, Difficulty, LearningAsset, Material, Question, Session, TutorContent } from "../types";
import { loadConcept, loadQuest, loadSession } from "./access";
import { toPublicQuestion } from "./public";

/* ------------------------------------------------------------------ */
/* Tools: narrowly scoped, authorized data access for the tutor        */
/* workflow. The model never writes records; app code does.           */
/* ------------------------------------------------------------------ */

export const tutorTools = {
  /** get_source_content: transcript excerpt for the concept's source pages. */
  async getSourceContent(concept: Concept): Promise<string> {
    const material = await db().get<Material>("materials", concept.materialId);
    if (!material) return "";
    if (material.isDemo) {
      const lesson = DEMO_LESSONS[concept.id];
      return lesson ? `${concept.title}: ${lesson.explanation}` : concept.description;
    }
    const refs = new Set(concept.sourceRefs.map((r) => r.ref));
    const pages = material.transcription ?? [];
    const relevant = pages.filter((p) => refs.has(p.ref));
    return (relevant.length ? relevant : pages).map((p) => `### ${p.ref}\n${p.transcript}`).join("\n\n").slice(0, 8000);
  },
  /** get_question: full question incl. key (server only). */
  async getQuestion(id: string) {
    return db().get<Question>("questions", id);
  },
  /** get_student_attempt_history: misconception counts for this concept. */
  async getStudentAttemptHistory(uid: string, conceptId: string) {
    const m = await db().get<ConceptMastery>("mastery", `${uid}__${conceptId}`);
    return { misconceptions: m?.misconceptions ?? {}, attempts: m?.attempts ?? 0, mastery: m?.masteryScore ?? null };
  },
  /** save_learning_asset */
  async saveLearningAsset(asset: LearningAsset) {
    await db().set("assets", asset);
  },
};

/* ------------------------------------------------------------------ */
/* Prepared (non-AI) tutor content                                     */
/* ------------------------------------------------------------------ */

export function preparedTutor(q: Question, selectedOptionId: string, concept: Concept, struggle: number): TutorContent {
  const lesson = DEMO_LESSONS[concept.id];
  const df = q.distractorFeedback.find((d) => d.optionId === selectedOptionId);
  const correct = q.options.find((o) => o.id === q.correctOptionId)!;
  const simplified = struggle >= 2 && !!lesson?.simple;
  const steps = (q.steps?.length ? q.steps : [q.explanation]).map((s, i) => ({ title: `Step ${i + 1}`, body: s }));
  return {
    heading: "Let's understand this",
    conceptTitle: concept.title,
    simpleExplanation: simplified ? lesson!.simple : lesson?.explanation ?? q.explanation,
    whyWrong:
      df?.feedback ??
      `The correct answer is ${correct.id}: ${correct.text}. Compare your choice with the explanation below to spot the difference.`,
    misconception: {
      label: df?.misconception ?? "unclassified",
      description: df ? df.feedback : "We don't have a specific misconception recorded for this choice.",
    },
    steps,
    keyEquations: lesson?.keyEquations ?? [],
    visual: q.visual,
    grounding: concept.fromNotes ? "notes" : "mixed",
    simplified,
  };
}

/* ------------------------------------------------------------------ */
/* explain                                                             */
/* ------------------------------------------------------------------ */

async function wrongAttempt(uid: string, sessionId: string, questionId: string) {
  const attempt = await db().get<Attempt>("attempts", `${sessionId}__${questionId}`);
  if (!attempt || attempt.ownerId !== uid) throw new AppError("NO_ATTEMPT", "Answer the question first.", 409);
  if (attempt.isCorrect) throw new AppError("ALREADY_CORRECT", "You got this one right, so there's nothing to fix!", 409);
  return attempt;
}

export interface ExplainResult {
  tutor: TutorContent;
  origin: ContentOrigin;
  fallbackReason?: string;
  correctOption: { id: string; text: string };
  selectedOption: { id: string; text: string };
  questionText: string;
  struggle: number;
}

export async function explainMistake(uid: string, sessionId: string, questionId: string, conceptId: string): Promise<ExplainResult> {
  const session = await loadSession(sessionId, uid);
  const quest = await loadQuest(session.questId, uid);
  const attempt = await wrongAttempt(uid, sessionId, questionId);
  const q = await tutorTools.getQuestion(questionId);
  if (!q || q.conceptId !== conceptId || q.questId !== quest.id) throw new AppError("MISMATCH", "That question doesn't belong to this concept.", 400);
  const concept = await loadConcept(conceptId, uid);
  const struggle = session.struggles[conceptId] ?? 1;
  const selected = q.options.find((o) => o.id === attempt.selectedOptionId)!;
  const correct = q.options.find((o) => o.id === q.correctOptionId)!;
  const base = { correctOption: correct, selectedOption: selected, questionText: q.text, struggle };

  // Cached for this attempt (retries / refreshes don't re-bill the model).
  const assetId = `tutor__${sessionId}__${questionId}`;
  const cached = await db().get<LearningAsset>("assets", assetId);
  if (cached?.generationStatus === "ready" && cached.content) {
    const c = cached.content as { tutor: TutorContent; fallbackReason?: string };
    return { ...base, tutor: c.tutor, origin: cached.origin, fallbackReason: c.fallbackReason };
  }

  let tutor: TutorContent;
  let origin: ContentOrigin;
  let fallbackReason: string | undefined;
  if (aiAvailable()) {
    try {
      const history = await tutorTools.getStudentAttemptHistory(uid, conceptId);
      tutor = await tutorExplain({
        question: q,
        selectedOptionId: attempt.selectedOptionId,
        conceptTitle: concept.title,
        conceptDescription: concept.description,
        grade: quest.grade,
        sourceExcerpt: await tutorTools.getSourceContent(concept),
        priorMisconceptions: history.misconceptions,
        struggle,
        ownerId: uid,
      });
      origin = "ai_generated";
    } catch (e) {
      tutor = preparedTutor(q, attempt.selectedOptionId, concept, struggle);
      origin = isDemoQuest(quest.id) ? "demo_prepared" : q.origin;
      fallbackReason = e instanceof AppError ? e.userMessage : "The AI tutor is unavailable right now.";
      await audit({ operation: "tutor.explain", ownerId: uid, inputRefs: [q.id], outcome: "fallback", detail: (e as AppError).code, durationMs: 0, action: "served stored explanation" });
    }
  } else {
    tutor = preparedTutor(q, attempt.selectedOptionId, concept, struggle);
    origin = isDemoQuest(quest.id) ? "demo_prepared" : q.origin;
    fallbackReason = "Demo mode: AI isn't configured, so this is the prepared lesson for this question.";
  }

  await tutorTools.saveLearningAsset({
    id: assetId,
    ownerId: uid,
    conceptId,
    sessionId,
    type: "tutor",
    origin,
    content: { tutor, fallbackReason },
    generationStatus: "ready",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { ...base, tutor, origin, fallbackReason };
}

/* ------------------------------------------------------------------ */
/* follow-up                                                           */
/* ------------------------------------------------------------------ */

const ORDER: Difficulty[] = ["easy", "medium", "hard"];

export async function createFollowUp(uid: string, sessionId: string, missedQuestionId: string, conceptId: string) {
  return db().withLock(`session:${sessionId}`, async () => {
    const session = await loadSession(sessionId, uid);
    const quest = await loadQuest(session.questId, uid);
    if (session.status !== "active") throw new AppError("SESSION_DONE", "This quest is already finished.", 409);
    const attempt = await wrongAttempt(uid, sessionId, missedQuestionId);
    const missed = await tutorTools.getQuestion(missedQuestionId);
    if (!missed || missed.conceptId !== conceptId) throw new AppError("MISMATCH", "That question doesn't belong to this concept.", 400);

    // Idempotent: return the pending follow-up if one exists for this mistake.
    if (session.pendingFollowUpId) {
      const pending = await db().get<Question>("questions", session.pendingFollowUpId);
      if (pending?.followUpOf === missedQuestionId) {
        const c = await loadConcept(conceptId, uid);
        return { question: toPublicQuestion(pending, c), origin: pending.origin, difficulty: pending.difficulty, reason: "Your follow-up question is ready." };
      }
    }
    const answeredFollowUps = await db().getMany<Question>(
      "questions",
      session.answers.filter((a) => a.isFollowUp).map((a) => a.questionId),
    );
    if (answeredFollowUps.some((f) => f.followUpOf === missedQuestionId)) {
      throw new AppError("FOLLOWUP_DONE", "You've already answered a follow-up for this mistake.", 409);
    }

    const concept = await loadConcept(conceptId, uid);
    const struggle = session.struggles[conceptId] ?? 1;
    const di = ORDER.indexOf(missed.difficulty);
    const difficulty: Difficulty = struggle >= 2 ? ORDER[Math.max(0, di - 1)] : missed.difficulty;
    const reason =
      struggle >= 2
        ? `You've missed ${concept.title} ${struggle} times, so this follow-up is a step easier (${difficulty}) with a fresh scenario.`
        : `Same concept, new scenario, ${difficulty} difficulty. Can you apply what you just learned?`;

    const poolQs = await db().getMany<Question>("questions", session.poolQuestionIds);
    const avoid = [...poolQs, missed];
    let q: Question | null = null;
    let note: string | undefined;

    if (aiAvailable() && !isDemoQuest(quest.id)) {
      try {
        const key = concept.key ?? concept.id;
        q = await tutorFollowUp({
          missed,
          conceptKey: key,
          conceptTitle: concept.title,
          difficulty,
          misconception: attempt.misconception,
          sourceExcerpt: await tutorTools.getSourceContent(concept),
          grade: quest.grade,
          subject: quest.subject,
          avoid,
          ownerId: uid,
        });
        if (!q) note = "The AI follow-up didn't pass validation, so we used a backup question.";
      } catch (e) {
        note = e instanceof AppError ? e.userMessage : "The AI follow-up failed, so we used a backup question.";
      }
    }
    if (!q && concept.generatorKey) {
      q = generateFollowUp({
        generatorKey: concept.generatorKey,
        conceptId,
        questId: quest.id,
        difficulty,
        seed: `${sessionId}:${missedQuestionId}`,
        id: newId("q"),
        followUpOf: missedQuestionId,
        avoid,
      });
    }
    if (!q) {
      // Last resort: an unplayed validated question on the same concept.
      const unplayed = poolQs.filter((p) => p.conceptId === conceptId && !session.servedQuestionIds.includes(p.id));
      const pick = unplayed.sort((a, b) => Math.abs(ORDER.indexOf(a.difficulty) - ORDER.indexOf(difficulty)) - Math.abs(ORDER.indexOf(b.difficulty) - ORDER.indexOf(difficulty)))[0];
      if (pick) {
        q = { ...pick, id: newId("q"), followUpOf: missedQuestionId };
      }
    }
    if (!q) {
      throw new AppError("NO_FOLLOWUP", "We couldn't prepare a reliable follow-up question for this concept. Let's continue the quest.", 503, false);
    }

    await db().set("questions", q);
    session.pendingFollowUpId = q.id;
    session.tutorForQuestionId = undefined;
    session.adaptations.push({ at: nowIso(), questionId: q.id, targetDifficulty: difficulty, reason });
    await db().set("sessions", session as Session);
    return { question: toPublicQuestion(q, concept), origin: q.origin, difficulty, reason, note };
  });
}
