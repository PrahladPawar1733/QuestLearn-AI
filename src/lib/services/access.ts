import "server-only";
import { db } from "../db";
import { DEMO_OWNER } from "../demo/collisions";
import { Errors } from "../errors";
import type { Concept, Material, Quest, Question, Session } from "../types";
import { ensureDemoSeeded } from "./seed";

/** Server-side authorization: users can read their own resources and the public demo. */
export async function loadQuest(questId: string, uid: string): Promise<Quest> {
  await ensureDemoSeeded();
  const quest = await db().get<Quest>("quests", questId);
  if (!quest) throw Errors.notFound("quest");
  if (quest.ownerId !== uid && quest.ownerId !== DEMO_OWNER) throw Errors.notFound("quest");
  return quest;
}

export async function loadMaterial(materialId: string, uid: string): Promise<Material> {
  const m = await db().get<Material>("materials", materialId);
  if (!m || (m.ownerId !== uid && m.ownerId !== DEMO_OWNER)) throw Errors.notFound("study material");
  return m;
}

export async function loadOwnedMaterial(materialId: string, uid: string): Promise<Material> {
  const m = await db().get<Material>("materials", materialId);
  if (!m || m.ownerId !== uid) throw Errors.notFound("study material");
  return m;
}

export async function loadSession(sessionId: string, uid: string): Promise<Session> {
  const s = await db().get<Session>("sessions", sessionId);
  if (!s || s.ownerId !== uid) throw Errors.notFound("session");
  return s;
}

export async function loadConcept(conceptId: string, uid: string): Promise<Concept> {
  await ensureDemoSeeded();
  const c = await db().get<Concept>("concepts", conceptId);
  if (!c || (c.ownerId !== uid && c.ownerId !== DEMO_OWNER)) throw Errors.notFound("concept");
  return c;
}

export async function loadQuestion(questionId: string): Promise<Question> {
  const q = await db().get<Question>("questions", questionId);
  if (!q) throw Errors.notFound("question");
  return q;
}
