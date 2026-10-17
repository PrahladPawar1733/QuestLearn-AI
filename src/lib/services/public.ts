import type { Concept, Material, PublicQuestion, Question } from "../types";

/** Strip the answer key and explanations before sending an open question to the browser. */
export function toPublicQuestion(q: Question, concept?: Pick<Concept, "title">): PublicQuestion {
  return {
    id: q.id,
    conceptId: q.conceptId,
    type: q.type,
    category: q.category,
    difficulty: q.difficulty,
    text: q.text,
    options: q.options,
    origin: q.origin,
    followUpOf: q.followUpOf,
    hasHint: !!q.hint,
    visual: q.category === "numerical" && q.visual?.kind !== "bounce" ? undefined : revealSafeVisual(q),
    conceptTitle: concept?.title ?? "",
  };
}

/**
 * Visuals that would give the answer away (e.g. the after-collision state of
 * a numerical question) are withheld until the question is settled. A
 * "bounce" diagram only shows heights, so it is safe. Collision diagrams for
 * conceptual questions are shown before-state only by the client.
 */
function revealSafeVisual(q: Question) {
  if (!q.visual) return undefined;
  if (q.visual.kind === "momentum-bars") return undefined;
  return q.visual;
}

export function publicMaterial(m: Material) {
  return {
    id: m.id,
    title: m.title,
    settings: m.settings,
    stage: m.stage,
    completedStages: m.completedStages,
    error: m.error,
    questId: m.questId,
    progress: m.progress,
    files: m.files.map((f) => ({ index: f.index, name: f.originalName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, pageCount: f.pageCount })),
    extracted: m.extracted,
    createdAt: m.createdAt,
  };
}
