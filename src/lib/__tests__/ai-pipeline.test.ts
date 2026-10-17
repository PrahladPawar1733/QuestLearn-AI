/**
 * AI pipeline tests with a mocked Gemini client. They verify that the app
 * (not the model) decides what reaches students: bad answer keys, unit
 * errors and reviewer disagreement are rejected; failures fall back honestly;
 * retries resume from checkpoints without duplicating quests.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";

process.env.QL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ql-ai-"));
delete process.env.QL_FORCE_DEMO;

type Handler = (op: string, opts: { parts: { text?: string }[] }) => unknown;
let handler: Handler = () => {
  throw new Error("no handler");
};
const calls: string[] = [];

vi.mock("../ai/client", () => ({
  aiAvailable: () => true,
  generateJson: async (opts: { operation: string; schema: { parse: (x: unknown) => unknown }; parts: { text?: string }[] }) => {
    calls.push(opts.operation);
    const out = handler(opts.operation, opts);
    return opts.schema.parse(out);
  },
}));

const q = (over: Record<string, unknown>) => ({
  conceptKey: "momentum",
  category: "numerical",
  difficulty: "easy",
  text: "A 2 kg trolley moves at 3 m/s. What is the magnitude of its momentum?",
  options: [
    { id: "A", text: "6.0 kg·m/s" },
    { id: "B", text: "9.0 kg·m/s" },
    { id: "C", text: "1.5 kg·m/s" },
    { id: "D", text: "0.67 kg·m/s" },
  ],
  correctOptionId: "A",
  explanation: "p = mv = 6 kg·m/s",
  distractors: [
    { optionId: "B", misconception: "used-kinetic-energy-formula", feedback: "That is ½mv²." },
    { optionId: "C", misconception: "divided", feedback: "v/m" },
    { optionId: "D", misconception: "divided", feedback: "m/v" },
  ],
  hint: "p = mv",
  steps: ["p = mv"],
  calc: { expression: "m*v", variables: [{ name: "m", value: 2, unit: "kg" }, { name: "v", value: 3, unit: "m/s" }], answerUnit: "kg·m/s" },
  collision: null,
  sourceRefs: [{ ref: "Image 1", quote: "p = mv" }],
  ...over,
});

const STEMS = [
  "Which quantity stays constant for an isolated system of colliding trolleys?",
  "Why does a rifle recoil backwards when it fires a bullet forwards?",
  "A ball bounces off a wall with unchanged speed. What happened to its momentum?",
  "Two skaters push apart from rest. What can you say about their momenta afterwards?",
];
const conceptual = (i: number) =>
  q({
    category: "understanding",
    calc: null,
    text: STEMS[(i - 1) % STEMS.length],
    options: [
      { id: "A", text: `Correct statement ${i}` },
      { id: "B", text: `Tempting distractor ${i}` },
      { id: "C", text: `Another distractor ${i}` },
      { id: "D", text: `Unrelated idea ${i}` },
    ],
  });

let wf: typeof import("../ai/workflows");
let materials: typeof import("../services/materials");
let tutor: typeof import("../services/tutor");
let play: typeof import("../services/play");
let demo: typeof import("../demo/collisions");

beforeAll(async () => {
  wf = await import("../ai/workflows");
  materials = await import("../services/materials");
  tutor = await import("../services/tutor");
  play = await import("../services/play");
  demo = await import("../demo/collisions");
});
beforeEach(() => {
  calls.length = 0;
});

const extracted = {
  chapterTitle: "Collisions",
  subject: "Physics",
  grade: "11",
  summary: "Momentum and collisions.",
  concepts: [{ key: "momentum", title: "Momentum", description: "p = mv", difficulty: "easy" as const, fromNotes: true, sourceRefs: [] }],
  definitions: [],
  formulas: [],
  examples: [],
  relationships: [],
  uncertain: [],
};
const settings = { subject: "Physics" as const, grade: "11", goal: "", difficulty: "mixed" as const, questionCount: 4 };

describe("question designer + validator", () => {
  it("rejects a wrong answer key, a unit mismatch and reviewer disagreement; keeps valid ones", async () => {
    handler = (op, opts) => {
      if (op === "questions.generate") {
        return {
          questions: [
            q({}), // valid numerical
            q({ text: "A 4 kg cart moves at 2 m/s. What is the magnitude of its momentum?", correctOptionId: "B", distractors: [{ optionId: "A", misconception: "x", feedback: "y" }] }), // key wrong (8 ≠ 9)
            q({ text: "A 5 kg cart moves at 2 m/s. Find the magnitude of its momentum.", options: [{ id: "A", text: "10 J" }, { id: "B", text: "25 J" }, { id: "C", text: "2.5 J" }, { id: "D", text: "0.4 J" }] }), // unit mismatch
            conceptual(1),
            conceptual(2), // reviewer will disagree on this one
            conceptual(3),
          ],
        };
      }
      if (op === "questions.review") {
        const items = JSON.parse(opts.parts[0].text!.split("QUESTIONS:\n")[1]) as { id: string; text: string }[];
        return {
          reviews: items.map((it) => ({ id: it.id, chosenOptionId: it.text.startsWith("Why does a rifle") ? "B" : "A", ambiguous: false, factualProblem: false, issue: "" })),
        };
      }
      throw new Error("unexpected " + op);
    };
    const out = await wf.designQuestions({ extracted, settings, questId: "qst_x", concepts: [], conceptKeyById: { c1: "momentum" }, ownerId: "u" });
    const texts = out.accepted.map((x) => x.text);
    expect(out.accepted.every((x) => x.validation.status === "passed" && x.validation.reviewedByModel)).toBe(true);
    expect(texts.some((t) => t.startsWith("A 2 kg trolley"))).toBe(true);
    expect(texts.some((t) => t.startsWith("A 4 kg cart"))).toBe(false);
    expect(texts.some((t) => t.startsWith("A 5 kg cart"))).toBe(false);
    expect(texts.some((t) => t.startsWith("Why does a rifle"))).toBe(false);
    const reasons = out.rejected.flatMap((r) => r.issues).join(" | ");
    expect(reasons).toMatch(/Answer key mismatch/);
    expect(reasons).toMatch(/Dimension check failed|does not match the answer unit/);
    expect(reasons).toMatch(/Independent solver chose/);
  });
});

describe("material pipeline", () => {
  it("resumes from checkpoints after a failure and never duplicates the quest", async () => {
    const img = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const m = await materials.createMaterial("u_pipeline-test-00000001", { title: "Collisions", settings, files: [{ name: "p1.jpg", data: img }] });
    let failExtract = true;
    handler = (op, opts) => {
      if (op === "material.transcribe")
        return { isStudyMaterial: true, overallReadability: "clear", detectedSubject: "Physics", detectedTopic: "Momentum", pages: [{ ref: "Image 1", transcript: "Momentum p = mv. ".repeat(20), readability: "clear", notes: "" }] };
      if (op === "material.extract") {
        if (failExtract) throw new AppError("AI_TIMEOUT", "timeout", 504, true);
        return { ...extracted, concepts: extracted.concepts.map((c) => ({ ...c, sourceRefs: [{ ref: "Image 1", quote: "p = mv" }], templateKey: "momentum" })), definitions: [], formulas: [], examples: [] };
      }
      if (op === "questions.generate") return { questions: [q({}), conceptual(1), conceptual(2), conceptual(3), conceptual(4)] };
      if (op === "questions.review") {
        const items = JSON.parse(opts.parts[0].text!.split("QUESTIONS:\n")[1]) as { id: string }[];
        return { reviews: items.map((it) => ({ id: it.id, chosenOptionId: "A", ambiguous: false, factualProblem: false, issue: "" })) };
      }
      throw new Error(op);
    };
    await expect(materials.analyzeMaterial(m.ownerId, m.id)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    const failed = await (await import("../db")).db().get<{ stage: string; completedStages: string[]; error?: { stage: string; retryable: boolean } }>("materials", m.id);
    expect(failed!.stage).toBe("failed");
    expect(failed!.completedStages).toContain("reading");
    expect(failed!.error).toMatchObject({ stage: "concepts", retryable: true });

    failExtract = false;
    calls.length = 0;
    await materials.analyzeMaterial(m.ownerId, m.id);
    expect(calls).not.toContain("material.transcribe"); // resumed after "reading"
    const r1 = await materials.generateQuestForMaterial(m.ownerId, m.id);
    const r2 = await materials.generateQuestForMaterial(m.ownerId, m.id);
    expect(r2.quest.id).toBe(r1.quest.id);
    expect(r1.quest.questionIds.length).toBeGreaterThanOrEqual(4);
  });

  it("asks for a clearer upload instead of inventing content", async () => {
    handler = () => ({ isStudyMaterial: true, overallReadability: "unreadable", detectedSubject: "", detectedTopic: "", pages: [{ ref: "Image 1", transcript: "[illegible]", readability: "unreadable", notes: "blurry" }] });
    await expect(wf.transcribeMaterial([{ ref: "Image 1", mimeType: "image/jpeg", base64: "" }], "u", "m")).rejects.toMatchObject({ code: "UNREADABLE" });
  });
});

describe("tutor recovery", () => {
  it("falls back to the stored lesson (clearly labelled) when the AI tutor fails", async () => {
    handler = () => {
      throw new AppError("AI_RATE_LIMITED", "The AI service is busy right now.", 429, true);
    };
    const uid = "u_tutor-fallback-000001";
    const v = await play.startSession(uid, demo.DEMO_QUEST_ID, { world: "classic" });
    const key = demo.demoQuestions().find((x) => x.id === v.current!.id)!.correctOptionId;
    const wrong = (["A", "B", "C", "D"] as const).find((o) => o !== key)!;
    await play.submitAnswer(uid, v.session.id, v.current!.id, wrong); // attempt persisted first
    const ex = await tutor.explainMistake(uid, v.session.id, v.current!.id, v.current!.conceptId);
    expect(ex.origin).toBe("demo_prepared");
    expect(ex.fallbackReason).toMatch(/busy/);
    expect(ex.tutor.whyWrong.length).toBeGreaterThan(0);
  });
});
