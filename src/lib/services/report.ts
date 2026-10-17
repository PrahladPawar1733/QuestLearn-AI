import "server-only";
import { aiAvailable } from "../ai/client";
import { writeSessionReport, type ReportInput } from "../ai/workflows";
import { audit } from "../audit";
import { db } from "../db";
import { DEMO_LESSONS } from "../demo/collisions";
import { AppError } from "../errors";
import { nowIso } from "../ids";
import type { Concept, ContentOrigin, LearningAsset, Question } from "../types";
import { loadQuest, loadSession } from "./access";
import { tutorTools } from "./tutor";

export interface SessionReport {
  /** "ai_generated" when Gemini wrote it; otherwise built from the stored explanations. */
  origin: ContentOrigin;
  summary: string;
  focus: { conceptId: string; title: string; whatWentWrong: string; keyIdea: string; nextSteps: string[]; sourceRef?: string }[];
  strengths: string;
  fallbackReason?: string;
}

const optionText = (q: Question, id: string) => {
  const o = q.options.find((x) => x.id === id);
  return o ? `${o.id}. ${o.text}` : id;
};

/**
 * End-of-run coaching report: which concepts to learn, why the answers went wrong, what to do next.
 * The app supplies every fact (scores, the actual wrong answers, misconceptions, page labels);
 * the model only explains them. Cached per session so a refresh never re-bills the model.
 */
export async function sessionReport(uid: string, sessionId: string): Promise<SessionReport> {
  const s = await loadSession(sessionId, uid);
  if (s.answers.length === 0) throw new AppError("NO_ANSWERS", "Answer some questions first.", 409);
  const quest = await loadQuest(s.questId, uid);

  const assetId = `report__${sessionId}`;
  const cached = await db().get<LearningAsset>("assets", assetId);
  if (cached?.generationStatus === "ready" && cached.content) return cached.content as SessionReport;

  const questions = new Map((await db().getMany<Question>("questions", [...new Set(s.answers.map((a) => a.questionId))])).map((q) => [q.id, q]));
  const conceptIds = [...new Set(s.answers.map((a) => a.conceptId))];
  const concepts = new Map((await db().getMany<Concept>("concepts", conceptIds)).map((c) => [c.id, c]));
  const wrong = s.answers.filter((a) => !a.isCorrect && questions.has(a.questionId));

  const perConcept = conceptIds.map((cid) => {
    const ans = s.answers.filter((a) => a.conceptId === cid);
    return {
      id: cid,
      title: concepts.get(cid)?.title ?? "Concept",
      answered: ans.length,
      correct: ans.filter((a) => a.isCorrect).length,
      fixedOnRetry: ans.some((a) => a.isFollowUp && a.isCorrect),
    };
  });

  let report: SessionReport;
  if (wrong.length === 0) {
    // Nothing to diagnose: no model call needed, and nothing invented.
    report = {
      origin: "template",
      summary: `You answered all ${s.answers.length} questions correctly. Keep these ideas fresh with a short revision run in a few days, or move on to your next chapter.`,
      focus: [],
      strengths: `Every concept in this run: ${perConcept.map((c) => c.title).join(", ")}.`,
    };
  } else {
    const mistakes = wrong.map((a) => {
      const q = questions.get(a.questionId)!;
      return {
        conceptId: a.conceptId,
        question: q.text,
        chosen: optionText(q, a.selectedOptionId),
        correct: optionText(q, q.correctOptionId),
        misconception: q.distractorFeedback.find((d) => d.optionId === a.selectedOptionId)?.feedback,
        isFollowUp: a.isFollowUp,
      };
    });
    const weakIds = [...new Set(wrong.map((a) => a.conceptId))];
    if (aiAvailable()) {
      try {
        const input: ReportInput = {
          subject: quest.subject,
          grade: quest.grade,
          chapter: quest.title,
          concepts: await Promise.all(
            perConcept.map(async (c) => ({ ...c, notes: weakIds.includes(c.id) && concepts.get(c.id) ? (await tutorTools.getSourceContent(concepts.get(c.id)!)).slice(0, 2500) : "" })),
          ),
          mistakes,
          ownerId: uid,
          sessionId,
        };
        const out = await writeSessionReport(input);
        report = {
          origin: "ai_generated",
          summary: out.summary,
          focus: out.focus.map((f) => ({ ...f, title: concepts.get(f.conceptId)?.title ?? "Concept", sourceRef: f.sourceRef || undefined })),
          strengths: out.strengths,
        };
      } catch (e) {
        report = preparedReport(weakIds, mistakes, perConcept, concepts, quest.origin);
        report.fallbackReason = e instanceof AppError ? e.userMessage : "The AI report couldn't be written right now.";
        await audit({ operation: "report.session", ownerId: uid, inputRefs: [sessionId], outcome: "fallback", detail: (e as AppError).code, durationMs: 0, action: "served stored explanations" });
      }
    } else {
      report = preparedReport(weakIds, mistakes, perConcept, concepts, quest.origin);
      report.fallbackReason = "AI isn't configured, so this report is built from the stored explanations.";
    }
  }

  // Fallbacks aren't stored, so the next visit tries the AI report again.
  if (report.fallbackReason) return report;
  await db().set("assets", {
    id: assetId,
    ownerId: uid,
    conceptId: conceptIds[0],
    sessionId,
    type: "report",
    origin: report.origin,
    content: report,
    generationStatus: "ready",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  } satisfies LearningAsset);
  return report;
}

/** Without AI: the stored misconception feedback and explanations, arranged the same way. */
function preparedReport(
  weakIds: string[],
  mistakes: { conceptId: string; misconception?: string; correct: string }[],
  perConcept: { id: string; title: string; answered: number; correct: number }[],
  concepts: Map<string, Concept>,
  origin: ContentOrigin,
): SessionReport {
  const strong = perConcept.filter((c) => c.correct === c.answered);
  return {
    origin: origin === "demo_prepared" ? "demo_prepared" : "template",
    summary: `You missed questions on ${weakIds.length} concept${weakIds.length === 1 ? "" : "s"}. Start with ${concepts.get(weakIds[0])?.title ?? "the first one"}.`,
    focus: weakIds.map((cid) => {
      const c = concepts.get(cid);
      const ms = mistakes.filter((m) => m.conceptId === cid);
      const lesson = DEMO_LESSONS[cid];
      return {
        conceptId: cid,
        title: c?.title ?? "Concept",
        whatWentWrong: ms.map((m) => m.misconception).filter(Boolean)[0] ?? `The right answer was ${ms[0]?.correct}.`,
        keyIdea: lesson?.explanation ?? c?.description ?? "",
        nextSteps: [`Re-read ${c?.sourceRefs[0]?.ref ?? "this concept in your notes"}.`, "Practise it again with a short revision run."],
        sourceRef: c?.sourceRefs[0]?.ref,
      };
    }),
    strengths: strong.length ? `No misses on ${strong.map((c) => c.title).join(", ")}.` : "",
  };
}
