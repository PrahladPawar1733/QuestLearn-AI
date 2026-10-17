import "server-only";
import { db } from "../db";
import { cellConcepts, cellMaterial, cellQuest, cellQuestions, CELL_QUEST_ID } from "../demo/cell-transport";
import { demoConcepts, demoMaterial, demoQuest, demoQuestions, DEMO_QUEST_ID } from "../demo/collisions";
import { validateQuestion } from "../validation/questions";

const DEMO_VERSION = "2026-10-17.3";
let seeded: Promise<void> | null = null;

/**
 * Writes the prepared demo chapter into the store (idempotent, versioned).
 * Each demo question is re-validated at seed time; a question that fails is
 * excluded rather than shown.
 */
export function ensureDemoSeeded(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const store = db();
      const existing = await store.get<{ id: string; demoVersion?: string }>("quests", DEMO_QUEST_ID);
      if (existing?.demoVersion === DEMO_VERSION) return;

      // Every prepared chapter goes through the SAME validator a generated
      // question must pass. A hand-written question gets no exemption.
      const chapters = [
        { concepts: demoConcepts(), questions: demoQuestions(), material: demoMaterial(), quest: demoQuest() },
        { concepts: cellConcepts(), questions: cellQuestions(), material: cellMaterial(), quest: cellQuest() },
      ];

      for (const ch of chapters) {
        const ok = ch.questions.filter((q) => {
          const r = validateQuestion(q, ch.questions.filter((o) => o.id !== q.id));
          q.validation = { status: r.ok ? "passed" : "failed", checks: r.checks, issues: r.issues, reviewedByModel: false };
          if (!r.ok) console.error(`[seed] prepared question ${q.id} failed validation`, r.issues);
          return r.ok;
        });
        for (const c of ch.concepts) await store.set("concepts", c);
        for (const q of ok) await store.set("questions", q);
        await store.set("materials", ch.material);
        await store.set("quests", { ...ch.quest, questionIds: ok.map((q) => q.id), demoVersion: DEMO_VERSION });
      }
      void CELL_QUEST_ID;
    })().catch((e) => {
      seeded = null;
      throw e;
    });
  }
  return seeded;
}
