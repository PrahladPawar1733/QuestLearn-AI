import "server-only";
import { aiAvailable } from "../ai/client";
import { designQuestions, extractChapter, transcribeMaterial, type ModelFile } from "../ai/workflows";
import { config } from "../config";
import { db } from "../db";
import { AppError, Errors } from "../errors";
import { newId, nowIso } from "../ids";
import { ingestFile, validateBatch } from "../ingest/files";
import { blobs } from "../storage";
import type { Attempt, Concept, ConceptMastery, LearningAsset, Material, ProcessingStage, Quest, Question, QuestSettings, Session } from "../types";
import { loadOwnedMaterial } from "./access";

/* ------------------------------------------------------------------ */
/* upload                                                              */
/* ------------------------------------------------------------------ */

/**
 * Placeholder used when the student does not name their upload. It is treated
 * as "no title", so the chapter title the model reads off the pages wins —
 * otherwise a real chapter called "Human Reproduction" stays filed forever as
 * "My chapter" and is impossible to find again.
 */
export const UNTITLED = "My chapter";

/** The student's own title if they gave one, else the one read from the pages. */
function bestTitle(given: string | undefined, extractedTitle: string | undefined): string {
  const t = (given ?? "").trim();
  if (t && t !== UNTITLED) return t;
  return (extractedTitle ?? "").trim() || UNTITLED;
}

export async function createMaterial(uid: string, input: { title: string; settings: QuestSettings; files: { name: string; data: Buffer }[] }) {
  validateBatch(input.files.map((f) => ({ name: f.name, size: f.data.length })));
  const ingested = [];
  for (const f of input.files) ingested.push(await ingestFile(f.name, f.data));

  const id = newId("mat");
  const store = blobs();
  const files: Material["files"] = [];
  for (const [i, f] of ingested.entries()) {
    const ext = f.type === "application/pdf" ? "pdf" : f.type === "image/png" ? "png" : "jpg";
    const base = `users/${uid}/materials/${id}/${String(i).padStart(2, "0")}`;
    const storagePath = await store.put(`${base}-original.${ext}`, f.original, f.type);
    const processedPath = f.processed ? await store.put(`${base}-processed.jpg`, f.processed, "image/jpeg") : undefined;
    files.push({
      index: i,
      originalName: f.name.slice(0, 120),
      mimeType: f.type,
      sizeBytes: f.original.length,
      storagePath,
      processedPath,
      pageCount: f.pageCount,
      width: f.width,
      height: f.height,
    });
  }
  const material: Material = {
    id,
    ownerId: uid,
    title: input.title.trim().slice(0, 120) || UNTITLED,
    settings: input.settings,
    files,
    stage: "uploaded",
    completedStages: ["uploaded"],
    isDemo: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db().set("materials", material);
  return material;
}

function keyFromPath(p: string) {
  return p.replace(/^local:\/\//, "").replace(/^gs:\/\/[^/]+\//, "");
}

async function modelFiles(m: Material): Promise<ModelFile[]> {
  const out: ModelFile[] = [];
  let pdfN = 0;
  let imgN = 0;
  let inlineBytes = 0;
  for (const f of m.files) {
    const isPdf = f.mimeType === "application/pdf";
    const ref = isPdf ? `PDF ${++pdfN} (${f.pageCount ?? "?"} pages)` : `Image ${++imgN}`;
    const path = f.processedPath ?? f.storagePath;
    const mimeType = f.processedPath ? "image/jpeg" : f.mimeType;
    if (config.aiMode === "vertex" && path.startsWith("gs://")) {
      out.push({ ref, mimeType, fileUri: path });
      continue;
    }
    const buf = await blobs().get(keyFromPath(path));
    inlineBytes += buf.length;
    out.push({ ref, mimeType, base64: buf.toString("base64") });
  }
  if (inlineBytes > 18 * 1024 * 1024) {
    throw new AppError("TOO_LARGE_FOR_AI", "This upload is too large to analyze in one go. Split the chapter into smaller uploads (under ~18 MB).", 413);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* pipeline                                                            */
/* ------------------------------------------------------------------ */

async function save(m: Material, patch: Partial<Material>) {
  Object.assign(m, patch, { updatedAt: nowIso() });
  await db().set("materials", m);
}

async function fail(m: Material, stage: ProcessingStage, e: unknown): Promise<never> {
  const err =
    e instanceof AppError ? e : new AppError("PROCESSING_FAILED", "Something went wrong while processing your material. Please retry.", 500, true);
  if (!(e instanceof AppError)) console.error("[pipeline]", (e as Error)?.stack ?? e);
  await save(m, { stage: "failed", error: { code: err.code, message: err.userMessage, stage, retryable: err.retryable || err.status >= 500 } });
  throw err;
}

const running = new Set<string>();

/** Reading + concept extraction. Resumes after the last completed stage. */
export async function analyzeMaterial(uid: string, materialId: string) {
  const m = await loadOwnedMaterial(materialId, uid);
  if (m.completedStages.includes("concepts")) return m;
  if (!aiAvailable()) throw Errors.aiUnavailable();
  if (running.has(m.id)) throw new AppError("IN_PROGRESS", "This material is already being processed.", 409, true);
  running.add(m.id);
  try {
    if (!m.completedStages.includes("reading")) {
      await save(m, { stage: "reading", error: undefined });
      try {
        const files = await modelFiles(m);
        const t = await transcribeMaterial(files, uid, m.id);
        await save(m, { transcription: t.pages, completedStages: [...m.completedStages, "reading"] });
      } catch (e) {
        await fail(m, "reading", e);
      }
    }
    await save(m, { stage: "concepts", error: undefined });
    try {
      const { extracted, templateKeys } = await extractChapter(m.transcription!, m.settings, m.title, uid, m.id);
      for (const c of extracted.concepts) {
        const concept: Concept = {
          id: `${m.id}--${c.key}`,
          key: c.key,
          materialId: m.id,
          ownerId: uid,
          title: c.title,
          description: c.description,
          subject: extracted.subject || m.settings.subject,
          difficulty: c.difficulty,
          sourceRefs: c.sourceRefs,
          fromNotes: c.fromNotes,
          generatorKey: m.settings.subject === "Physics" ? templateKeys[c.key] : undefined,
        };
        await db().set("concepts", concept);
      }
      await save(m, { extracted, title: bestTitle(m.title, extracted.chapterTitle), completedStages: [...m.completedStages, "concepts"] });
    } catch (e) {
      await fail(m, "concepts", e);
    }
    return m;
  } finally {
    running.delete(m.id);
  }
}

/** Question generation + validation + quest assembly. Never creates a duplicate quest. */
export async function generateQuestForMaterial(uid: string, materialId: string) {
  const m = await loadOwnedMaterial(materialId, uid);
  if (m.questId) {
    const existing = await db().get<Quest>("quests", m.questId);
    if (existing) return { material: m, quest: existing };
  }
  if (!m.completedStages.includes("concepts") || !m.extracted) {
    throw new AppError("NOT_ANALYZED", "Analyze the material before generating a quest.", 409);
  }
  if (!aiAvailable()) throw Errors.aiUnavailable();
  if (running.has(m.id)) throw new AppError("IN_PROGRESS", "This material is already being processed.", 409, true);
  running.add(m.id);
  try {
    const questId = newId("qst");
    const concepts = await db().list<Concept>("concepts", { materialId: m.id });
    const conceptKeyById = Object.fromEntries(concepts.map((c) => [c.id, c.key ?? c.id]));
    await save(m, { stage: "questions", error: undefined });
    let accepted: Question[] = [];
    let rejectedCount = 0;
    try {
      const set = await designQuestions({
        extracted: m.extracted,
        pages: m.transcription,
        settings: m.settings,
        questId,
        concepts,
        conceptKeyById,
        ownerId: uid,
      });
      accepted = set.accepted;
      rejectedCount = set.rejected.length;
      if (accepted.length < 4) {
        throw new AppError(
          "TOO_FEW_VALID_QUESTIONS",
          `Only ${accepted.length} question(s) passed our accuracy checks, which isn't enough for a quest. Retry, or upload clearer or longer notes.`,
          422,
          true,
        );
      }
    } catch (e) {
      await fail(m, "questions", e);
    }
    await save(m, { stage: "preparing", completedStages: [...m.completedStages, "questions"] });
    try {
      for (const q of accepted) await db().set("questions", q);
      const usedConcepts = [...new Set(accepted.map((q) => q.conceptId))];
      for (const c of concepts) await db().set("concepts", { ...c, questId });
      const quest: Quest = {
        id: questId,
        ownerId: uid,
        materialId: m.id,
        title: bestTitle(m.title, m.extracted.chapterTitle),
        subject: m.settings.subject,
        grade: m.settings.grade,
        conceptIds: usedConcepts,
        questionIds: accepted.map((q) => q.id),
        playLength: Math.min(m.settings.questionCount, accepted.length),
        status: "ready",
        origin: "ai_generated",
        rejectedCount,
        createdAt: nowIso(),
      };
      await db().set("quests", quest);
      await save(m, { stage: "ready", questId, completedStages: [...m.completedStages, "preparing", "ready"] });
      return { material: m, quest };
    } catch (e) {
      return await fail(m, "preparing", e);
    }
  } finally {
    running.delete(m.id);
  }
}

/* ------------------------------------------------------------------ */
/* deletion                                                            */
/* ------------------------------------------------------------------ */

export async function deleteMaterial(uid: string, materialId: string) {
  const m = await loadOwnedMaterial(materialId, uid);
  const store = db();
  await blobs().delete(`users/${uid}/materials/${m.id}`);
  const concepts = await store.list<Concept>("concepts", { materialId: m.id });
  if (m.questId) {
    const qs = await store.list<Question>("questions", { questId: m.questId });
    for (const q of qs) await store.delete("questions", q.id);
    const sessions = await store.list<Session>("sessions", { questId: m.questId, ownerId: uid });
    for (const s of sessions) await store.delete("sessions", s.id);
    const attempts = await store.list<Attempt>("attempts", { questId: m.questId, ownerId: uid });
    for (const a of attempts) await store.delete("attempts", a.id);
    await store.delete("quests", m.questId);
  }
  for (const c of concepts) {
    await store.delete("concepts", c.id);
    await store.delete("mastery", `${uid}__${c.id}`);
  }
  await store.delete("materials", m.id);
}

/** Removes every record and file belonging to this guest. */
export async function deleteAllUserData(uid: string) {
  const store = db();
  const mats = await store.list<Material>("materials", { ownerId: uid });
  for (const m of mats) await deleteMaterial(uid, m.id);
  for (const c of ["sessions", "attempts", "mastery", "assets", "audit"] as const) {
    const docs = await store.list<{ id: string }>(c, { ownerId: uid });
    for (const d of docs) await store.delete(c, d.id);
  }
  await blobs().delete(`users/${uid}`);
  await store.delete("users", uid);
}

export type { ConceptMastery, LearningAsset };
