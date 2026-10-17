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

/** Mock independent solver: answers correctly by recognising the right option's text. */
function solve(item: { options: { id: string; text: string }[] }) {
  const right = item.options.find((o) => o.text === "6.0 kg·m/s" || o.text.startsWith("Correct statement"));
  return right?.id ?? "A";
}

let wf: typeof import("../ai/workflows");
let materials: typeof import("../services/materials");
let tutor: typeof import("../services/tutor");
let play: typeof import("../services/play");
let demo: typeof import("../demo/collisions");
let report: typeof import("../services/report");

beforeAll(async () => {
  wf = await import("../ai/workflows");
  materials = await import("../services/materials");
  tutor = await import("../services/tutor");
  play = await import("../services/play");
  demo = await import("../demo/collisions");
  report = await import("../services/report");
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
        const items = JSON.parse(opts.parts[0].text!.split("QUESTIONS:\n")[1]) as { id: string; text: string; options: { id: string; text: string }[] }[];
        return {
          // Disagree on the rifle question by picking a wrong option.
          reviews: items.map((it) => {
            const right = solve(it);
            const wrong = it.options.find((o) => o.id !== right)!.id;
            return { id: it.id, chosenOptionId: it.text.startsWith("Why does a rifle") ? wrong : right, ambiguous: false, factualProblem: false, issue: "" };
          }),
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

describe("parallel reading", () => {
  it("cuts a long PDF into 3-page pieces labelled with real page numbers", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 7; i++) doc.addPage([200, 200]);
    const pieces = await materials.splitPdf(Buffer.from(await doc.save()), 1, 7);
    expect(pieces.map((p) => p.ref)).toEqual(["PDF 1, pages 1-3 of 7", "PDF 1, pages 4-6 of 7", "PDF 1, page 7"]);
    expect(pieces.map((p) => p.pages)).toEqual([3, 3, 1]);
    for (const p of pieces) expect((await PDFDocument.load(Buffer.from(p.base64!, "base64"))).getPageCount()).toBe(p.pages);
  });

  it("reads batches in parallel and keeps page order; one non-study batch doesn't reject the chapter", async () => {
    const files = Array.from({ length: 7 }, (_, i) => ({ ref: `Image ${i + 1}`, mimeType: "image/jpeg", base64: "", pages: 1 }));
    expect(wf.readBatches(files).map((b) => b.length)).toEqual([3, 3, 1]);
    handler = (_op, opts) => {
      const refs = opts.parts.map((p) => p.text).filter((t): t is string => !!t?.startsWith("Source: ")).map((t) => t.slice(8));
      const cover = refs.includes("Image 7");
      return {
        isStudyMaterial: !cover,
        overallReadability: "clear",
        detectedSubject: "Physics",
        detectedTopic: "Momentum",
        pages: refs.map((ref) => ({ ref, transcript: `Momentum notes on ${ref}. p = mv, conserved in collisions.`, readability: "clear", notes: "" })),
      };
    };
    calls.length = 0;
    const t = await wf.transcribeMaterial(files, "u", "m");
    expect(calls.filter((c) => c === "material.transcribe")).toHaveLength(3);
    expect(t.pages.map((p) => p.ref)).toEqual(files.map((f) => f.ref));
  });
});

describe("parallel question batches", () => {
  it("splits a quest into batches of ~4 and spreads concepts across them", () => {
    const plan = wf.planBatches(15, ["a", "b", "c", "d", "e", "f"]);
    expect(plan.map((b) => b.count)).toEqual([4, 4, 4, 3]);
    expect(plan.flatMap((b) => b.keys).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    // Shared concept: each batch is steered to different categories instead.
    const shared = wf.planBatches(8, ["only"]);
    expect(shared.every((b) => b.keys[0] === "only" && b.focus)).toBe(true);
    expect(new Set(shared.map((b) => b.focus)).size).toBe(shared.length);
  });

  it("keeps the questions from batches that succeeded when one batch fails", async () => {
    let n = 0;
    handler = (op, opts) => {
      if (op === "questions.generate") {
        if (n++ === 0) throw new AppError("AI_TIMEOUT", "timeout", 504, true);
        return { questions: [q({}), conceptual(1), conceptual(3), conceptual(4)] };
      }
      const items = JSON.parse(opts.parts[0].text!.split("QUESTIONS:\n")[1]) as { id: string; options: { id: string; text: string }[] }[];
      return { reviews: items.map((it) => ({ id: it.id, chosenOptionId: solve(it), ambiguous: false, factualProblem: false, issue: "" })) };
    };
    const progress: { done: number; total: number }[] = [];
    const out = await wf.designQuestions({ extracted, settings, questId: "qst_y", concepts: [], conceptKeyById: { c1: "momentum" }, ownerId: "u", onProgress: (p) => void progress.push(p) });
    expect(out.accepted.length).toBe(4);
    // Identical batches don't produce duplicate questions.
    expect(new Set(out.accepted.map((x) => x.text)).size).toBe(4);
    expect(progress.at(-1)!.done).toBeGreaterThan(0);
  });
});

describe("answer-position shuffling", () => {
  it("spreads the correct answer across positions and keeps key + misconceptions aligned", () => {
    const positions = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const m = wf.mapQuestionOut(q({}) as never, { questId: "x", conceptIdByKey: { momentum: "c1" }, id: `q${i}` })!;
      positions.add(m.correctOptionId);
      // The keyed option is still the right answer text, and labels follow their options.
      expect(m.options.find((o) => o.id === m.correctOptionId)!.text).toBe("6.0 kg·m/s");
      for (const d of m.distractorFeedback) expect(d.optionId).not.toBe(m.correctOptionId);
      const ke = m.distractorFeedback.find((d) => d.misconception === "used-kinetic-energy-formula")!;
      expect(m.options.find((o) => o.id === ke.optionId)!.text).toBe("9.0 kg·m/s");
    }
    expect(positions.size).toBeGreaterThanOrEqual(3);
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
        const items = JSON.parse(opts.parts[0].text!.split("QUESTIONS:\n")[1]) as { id: string; options: { id: string; text: string }[] }[];
        return { reviews: items.map((it) => ({ id: it.id, chosenOptionId: solve(it), ambiguous: false, factualProblem: false, issue: "" })) };
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

  it("serves the stored lesson instantly (no AI call) while the tailored one is written", async () => {
    calls.length = 0;
    handler = () => {
      throw new Error("quick path must not call the model");
    };
    const uid = "u_tutor-quick-0000000001";
    const v = await play.startSession(uid, demo.DEMO_QUEST_ID, { world: "classic" });
    const key = demo.demoQuestions().find((x) => x.id === v.current!.id)!.correctOptionId;
    const wrong = (["A", "B", "C", "D"] as const).find((o) => o !== key)!;
    await play.submitAnswer(uid, v.session.id, v.current!.id, wrong);
    const ex = await tutor.explainMistake(uid, v.session.id, v.current!.id, v.current!.conceptId, { quick: true });
    expect(calls).toEqual([]);
    expect(ex.pending).toBe(true);
    expect(ex.correctOption.id).toBe(key);
    expect(ex.tutor.steps.length).toBeGreaterThan(0);
  });
});

describe("end-of-run report", () => {
  async function playWrong(uid: string) {
    const v = await play.startSession(uid, demo.DEMO_QUEST_ID, { world: "classic" });
    const q = demo.demoQuestions().find((x) => x.id === v.current!.id)!;
    const wrong = (["A", "B", "C", "D"] as const).find((o) => o !== q.correctOptionId)!;
    await play.submitAnswer(uid, v.session.id, q.id, wrong);
    return { sessionId: v.session.id, q, wrong };
  }

  it("explains the real mistakes, drops concepts the model invents, and is written only once", async () => {
    const { sessionId, q, wrong } = await playWrong("u_report-test-00000001");
    let prompt = "";
    handler = (op, opts) => {
      if (op !== "report.session") throw new Error(op);
      prompt = opts.parts[0].text!;
      return {
        summary: "You mixed up momentum and energy.",
        focus: [
          { conceptId: q.conceptId, whatWentWrong: "Units confused.", keyIdea: "$p = mv$", nextSteps: ["Re-read the definition."], sourceRef: "" },
          { conceptId: "made-up-concept", whatWentWrong: "x", keyIdea: "y", nextSteps: ["z"], sourceRef: "" },
        ],
        strengths: "",
      };
    };
    calls.length = 0;
    const r = await report.sessionReport("u_report-test-00000001", sessionId);
    // The model saw the actual wrong answer, with the option the student chose.
    expect(prompt).toContain(q.text);
    expect(prompt).toContain(`Chose: ${wrong}.`);
    expect(r.origin).toBe("ai_generated");
    expect(r.focus.map((f) => f.conceptId)).toEqual([q.conceptId]);
    expect(r.focus[0].title.length).toBeGreaterThan(0);
    await report.sessionReport("u_report-test-00000001", sessionId);
    expect(calls.filter((c) => c === "report.session")).toHaveLength(1);
  });

  it("falls back to the stored explanations, labelled, when the AI fails", async () => {
    const { sessionId, q } = await playWrong("u_report-test-00000002");
    handler = () => {
      throw new AppError("AI_TIMEOUT", "The AI took too long to respond.", 504, true);
    };
    const r = await report.sessionReport("u_report-test-00000002", sessionId);
    expect(r.origin).toBe("demo_prepared");
    expect(r.fallbackReason).toMatch(/too long/);
    expect(r.focus[0].conceptId).toBe(q.conceptId);
    expect(r.focus[0].whatWentWrong.length).toBeGreaterThan(0);
    // Not cached: the next visit tries the AI again.
    handler = () => ({ summary: "s", focus: [], strengths: "" });
    expect((await report.sessionReport("u_report-test-00000002", sessionId)).origin).toBe("ai_generated");
  });
});
