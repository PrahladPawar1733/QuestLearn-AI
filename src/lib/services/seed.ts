import "server-only";
import { db } from "../db";
import { demoConcepts, demoMaterial, demoQuest, demoQuestions, DEMO_QUEST_ID } from "../demo/collisions";
import { validateQuestion } from "../validation/questions";

const DEMO_VERSION = "2026-10-17.1";
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
      const questions = demoQuestions();
      const ok = questions.filter((q) => {
        const r = validateQuestion(q, questions.filter((o) => o.id !== q.id));
        q.validation = { status: r.ok ? "passed" : "failed", checks: r.checks, issues: r.issues, reviewedByModel: false };
        if (!r.ok) console.error(`[seed] demo question ${q.id} failed validation`, r.issues);
        return r.ok;
      });
      for (const c of demoConcepts()) await store.set("concepts", c);
      for (const q of ok) await store.set("questions", q);
      await store.set("materials", demoMaterial());
      await store.set("quests", { ...demoQuest(), questionIds: ok.map((q) => q.id), demoVersion: DEMO_VERSION });
    })().catch((e) => {
      seeded = null;
      throw e;
    });
  }
  return seeded;
}
