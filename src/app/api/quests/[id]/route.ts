import { db } from "@/lib/db";
import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { loadQuest } from "@/lib/services/access";
import type { Concept, Material, Question } from "@/lib/types";

/** GET /api/quests/:id: quest summary for the preview screen (no answer keys). */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/quests/[id]">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  const quest = await loadQuest(id, uid);
  const [concepts, questions, material] = await Promise.all([
    db().getMany<Concept>("concepts", quest.conceptIds),
    db().getMany<Question>("questions", quest.questionIds),
    db().get<Material>("materials", quest.materialId),
  ]);
  return json({
    quest: {
      id: quest.id,
      title: quest.title,
      subject: quest.subject,
      grade: quest.grade,
      origin: quest.origin,
      playLength: quest.playLength,
      questionCount: questions.length,
      rejectedCount: quest.rejectedCount,
      difficultyMix: { easy: questions.filter((q) => q.difficulty === "easy").length, medium: questions.filter((q) => q.difficulty === "medium").length, hard: questions.filter((q) => q.difficulty === "hard").length },
      categories: [...new Set(questions.map((q) => q.category))],
    },
    concepts: concepts.map((c) => ({ id: c.id, title: c.title, description: c.description, difficulty: c.difficulty, fromNotes: c.fromNotes, sourceRefs: c.sourceRefs, questionCount: questions.filter((q) => q.conceptId === c.id).length })),
    summary: material?.extracted?.summary,
    uncertain: material?.extracted?.uncertain ?? [],
  });
});
