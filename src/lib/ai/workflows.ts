import "server-only";
import { config } from "../config";
import { AppError } from "../errors";
import { newId, nowIso } from "../ids";
import type { Concept, ExtractedContent, Question, QuestSettings, TranscribedPage, TutorContent, VisualSpec } from "../types";
import { hashSeed, rng } from "../demo/templates";
import { similarity, validateQuestion } from "../validation/questions";
import { generateJson, type InputPart } from "./client";
import { DESIGN_SYSTEM, EXTRACT_SYSTEM, REPORT_SYSTEM, REVIEW_SYSTEM, simplerStyle, TRANSCRIBE_SYSTEM, TUTOR_SYSTEM } from "./prompts";
import { ExtractionOut, QuestionSetOut, ReportOut, ReviewOut, TranscriptionOut, TutorOut, type QuestionOut } from "./schemas";

/* ================================================================== */
/* Material Analyst                                                    */
/* ================================================================== */

export interface ModelFile {
  ref: string;
  mimeType: string;
  /** Inline bytes (demo/local storage, or a page range cut from a longer PDF) … */
  base64?: string;
  /** … or a gs:// URI that Vertex AI reads directly (large files). */
  fileUri?: string;
  /** Pages this file holds (1 for an image). Used to size reading batches. */
  pages?: number;
}

/**
 * Pages per reading call. One call for a whole 11-page PDF took 35-270 s with
 * gemini-3.5-flash and kept hitting the timeout, which restarted it from
 * scratch. Small batches read in parallel finish well inside it (2026-10-17).
 */
export const PAGES_PER_READ = 3;

/** Groups files into reading batches of about PAGES_PER_READ pages, keeping order. */
export function readBatches(files: ModelFile[]): ModelFile[][] {
  const out: ModelFile[][] = [];
  let cur: ModelFile[] = [];
  let pages = 0;
  for (const f of files) {
    const n = f.pages ?? 1;
    if (cur.length && pages + n > PAGES_PER_READ) {
      out.push(cur);
      cur = [];
      pages = 0;
    }
    cur.push(f);
    pages += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function readBatch(files: ModelFile[], ownerId: string, materialId: string) {
  const parts: InputPart[] = [];
  for (const f of files) {
    parts.push({ text: `Source: ${f.ref}` });
    if (f.fileUri) parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.fileUri } });
    else parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 ?? "" } });
  }
  parts.push({ text: "Transcribe all sources above." });
  return generateJson({
    operation: "material.transcribe",
    schema: TranscriptionOut,
    system: TRANSCRIBE_SYSTEM,
    parts,
    temperature: 0.1,
    ownerId,
    inputRefs: [materialId],
    timeoutMs: Math.max(config.aiTimeoutMs, 120_000),
    // Copying text off a page needs little reasoning; thinking only adds latency here.
    thinking: "minimal",
    // A 3-page read takes ~9-25 s; past 30 s it has almost certainly stalled.
    hedgeAfterMs: 30_000,
  });
}

export async function transcribeMaterial(files: ModelFile[], ownerId: string, materialId: string) {
  // Every page is needed, so any batch failing fails the step (it is retryable).
  const results = await Promise.all(readBatches(files).map((b) => readBatch(b, ownerId, materialId)));
  const out = {
    // One cover or blank page shouldn't sink a whole chapter: reject only if no batch is study material.
    isStudyMaterial: results.some((r) => r.isStudyMaterial),
    overallReadability: results.every((r) => r.overallReadability === "unreadable") ? ("unreadable" as const) : ("partial" as const),
    detectedSubject: results.find((r) => r.detectedSubject)?.detectedSubject ?? "",
    detectedTopic: results.find((r) => r.detectedTopic)?.detectedTopic ?? "",
    pages: results.flatMap((r) => r.pages),
  };
  if (!out.isStudyMaterial) {
    throw new AppError(
      "NOT_STUDY_MATERIAL",
      "This doesn't look like study material. Please upload photos or a PDF of your notes or textbook chapter.",
      422,
    );
  }
  const readable = out.pages.filter((p) => p.readability !== "unreadable");
  const totalChars = readable.reduce((s, p) => s + p.transcript.replace(/\[illegible\]/g, "").trim().length, 0);
  if (out.overallReadability === "unreadable" || readable.length === 0 || totalChars < 120) {
    throw new AppError(
      "UNREADABLE",
      "We couldn't read enough of your material. Try a clearer, well-lit photo taken straight on, or upload a PDF.",
      422,
    );
  }
  const pages: TranscribedPage[] = out.pages.map((p) => ({ ref: p.ref, transcript: p.transcript, readability: p.readability, notes: p.notes || undefined }));
  return { pages, detectedSubject: out.detectedSubject, detectedTopic: out.detectedTopic };
}

export async function extractChapter(pages: TranscribedPage[], settings: QuestSettings, title: string, ownerId: string, materialId: string) {
  const transcript = pages.map((p) => `### ${p.ref} (readability: ${p.readability})\n${p.transcript}`).join("\n\n");
  const out = await generateJson({
    operation: "material.extract",
    schema: ExtractionOut,
    system: EXTRACT_SYSTEM,
    parts: [
      {
        text: `${
          settings.autoDetect
            ? `The student did not say the subject or grade: detect them from the notes. "subject" must be one of Physics, Chemistry, Mathematics, Biology, Other. "grade" is the school class as a number (e.g. "11"), or "" if the notes don't make it clear.`
            : `Student settings: subject=${settings.subject}, grade=${settings.grade}.`
        } Chapter title given by student="${title}", goal="${settings.goal}".\n\nTRANSCRIPTION:\n${transcript}`,
      },
    ],
    temperature: 0.2,
    ownerId,
    inputRefs: [materialId],
    timeoutMs: Math.max(config.aiTimeoutMs, 120_000),
    // Normally 27-37 s.
    hedgeAfterMs: 50_000,
  });
  const seen = new Set<string>();
  const concepts = out.concepts
    .map((c) => ({ ...c, key: c.key.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "concept" }))
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
  const extracted: ExtractedContent = {
    chapterTitle: out.chapterTitle || title,
    subject: out.subject || settings.subject,
    grade: out.grade || settings.grade,
    summary: out.summary,
    concepts: concepts.map((c) => ({
      key: c.key,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      fromNotes: c.fromNotes,
      sourceRefs: c.sourceRefs.map((s) => ({ ref: s.ref, quote: s.quote || undefined })),
    })),
    definitions: out.definitions.map((d) => ({ ...d, sourceRef: d.sourceRef || undefined })),
    formulas: out.formulas.map((d) => ({ ...d, sourceRef: d.sourceRef || undefined })),
    examples: out.examples.map((e) => ({ problem: e.problem, solution: e.solution || undefined, sourceRef: e.sourceRef || undefined })),
    relationships: out.relationships,
    uncertain: out.uncertain,
  };
  const templateKeys = Object.fromEntries(concepts.map((c) => [c.key, c.templateKey === "none" ? undefined : c.templateKey]));
  return { extracted, templateKeys };
}

/* ================================================================== */
/* Question Designer + Validator                                       */
/* ================================================================== */

/**
 * Models tend to put the correct answer first. Shuffle option positions with a
 * per-question seed and remap the answer key and distractor labels, so the key
 * position carries no signal.
 */
export function shuffleOptions(q: QuestionOut, seed: string): QuestionOut {
  const letters = ["A", "B", "C", "D"] as const;
  const order = rng(hashSeed(seed)).shuffle(q.options.map((o) => o.id));
  const remap = new Map(order.map((oldId, i) => [oldId, letters[i]]));
  return {
    ...q,
    options: order.map((oldId, i) => ({ id: letters[i], text: q.options.find((o) => o.id === oldId)!.text })),
    correctOptionId: remap.get(q.correctOptionId) ?? q.correctOptionId,
    distractors: q.distractors.map((d) => ({ ...d, optionId: remap.get(d.optionId) ?? d.optionId })),
  };
}

export function mapQuestionOut(raw: QuestionOut, ctx: { questId: string; conceptIdByKey: Record<string, string>; followUpOf?: string; id?: string }): Question | null {
  const conceptId = ctx.conceptIdByKey[raw.conceptKey];
  if (!conceptId) return null;
  const id = ctx.id ?? newId("q");
  // Only shuffle well-formed A–D sets; anything else is left for the validator to reject.
  const ids = raw.options.map((o) => o.id).join();
  const q = ids === "A,B,C,D" ? shuffleOptions(raw, id) : raw;
  return {
    id,
    questId: ctx.questId,
    conceptId,
    type: "mcq_single",
    category: q.category,
    difficulty: q.difficulty,
    text: q.text,
    options: q.options,
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
    distractorFeedback: q.distractors.filter((d) => d.optionId !== q.correctOptionId),
    hint: q.hint || undefined,
    steps: q.steps.length ? q.steps : undefined,
    calc: q.calc
      ? {
          expression: q.calc.expression,
          variables: Object.fromEntries(q.calc.variables.map((v) => [v.name, { value: v.value, unit: v.unit }])),
          answerUnit: q.calc.answerUnit,
          tolerance: 0.02,
        }
      : undefined,
    physicsCheck: q.collision ? { kind: "collision-1d", ...q.collision } : undefined,
    visual:
      q.collision && q.collision.m1 > 0 && q.collision.m2 > 0 && q.collision.u1 !== q.collision.u2
        ? {
            kind: "collision-1d",
            m1: q.collision.m1,
            m2: q.collision.m2,
            u1: q.collision.u1,
            u2: q.collision.u2,
            e: clamp01((q.collision.v2 - q.collision.v1) / (q.collision.u1 - q.collision.u2)),
            label1: "1",
            label2: "2",
            massUnit: "kg",
            velocityUnit: "m/s",
            symbolic: false,
          }
        : undefined,
    sourceRefs: q.sourceRefs.map((s) => ({ ref: s.ref, quote: s.quote || undefined })),
    origin: "ai_generated",
    followUpOf: ctx.followUpOf,
    validation: { status: "failed", checks: [], issues: [], reviewedByModel: false },
    createdAt: nowIso(),
  };
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** Independent-solve review: the model answers without the key; disagreement rejects the question. */
export async function reviewQuestions(questions: Question[], ownerId: string, sourceText: string) {
  if (questions.length === 0) return new Map<string, { ok: boolean; issue: string }>();
  const blind = questions.map((q) => ({ id: q.id, text: q.text, options: q.options }));
  const out = await generateJson({
    operation: "questions.review",
    schema: ReviewOut,
    system: REVIEW_SYSTEM,
    model: config.reviewModel,
    parts: [{ text: `Context notes (for grounding only):\n${sourceText.slice(0, 12000)}\n\nQUESTIONS:\n${JSON.stringify(blind)}` }],
    temperature: 0,
    ownerId,
    inputRefs: questions.map((q) => q.id),
    // Normally 10-15 s.
    hedgeAfterMs: 25_000,
  });
  const verdicts = new Map<string, { ok: boolean; issue: string }>();
  for (const q of questions) {
    const r = out.reviews.find((x) => x.id === q.id);
    if (!r) verdicts.set(q.id, { ok: false, issue: "Reviewer did not return a verdict" });
    else if (r.chosenOptionId !== q.correctOptionId)
      verdicts.set(q.id, { ok: false, issue: `Independent solver chose ${r.chosenOptionId}, key says ${q.correctOptionId}` });
    else if (r.ambiguous) verdicts.set(q.id, { ok: false, issue: `Ambiguous: ${r.issue}` });
    else if (r.factualProblem) verdicts.set(q.id, { ok: false, issue: `Factual problem: ${r.issue}` });
    else verdicts.set(q.id, { ok: true, issue: "" });
  }
  return verdicts;
}

function sourceText(pages: TranscribedPage[] | undefined, extracted: ExtractedContent) {
  const notes = (pages ?? []).map((p) => `### ${p.ref}\n${p.transcript}`).join("\n\n");
  return `CHAPTER OUTLINE:\n${JSON.stringify(extracted)}\n\nNOTES:\n${notes}`.slice(0, 40000);
}

export interface GeneratedQuestionSet {
  accepted: Question[];
  rejected: { text: string; issues: string[] }[];
}

export interface GenerationProgress {
  /** Batches written and checked so far / planned so far (a replacement round adds more). */
  done: number;
  total: number;
  accepted: number;
}

/**
 * Questions per model call. One call for a whole quest (~15 questions, ~11k output tokens) took
 * ~107 s with gemini-3.5-flash and kept tripping the timeout, which restarted it from scratch.
 * Batches of 4 take ~55-65 s and run in parallel (measured 2026-10-17).
 */
const BATCH_SIZE = 4;
const CATEGORY_FOCUS = ["understanding and reasoning", "numerical and application", "application and understanding", "reasoning and numerical"];

/** Splits a request into batches; concepts are spread across batches so they don't overlap. */
export function planBatches(need: number, keys: string[]) {
  const n = Math.max(1, Math.ceil(need / BATCH_SIZE));
  const batches = Array.from({ length: n }, (_, i) => ({ count: Math.floor(need / n) + (i < need % n ? 1 : 0), keys: [] as string[], focus: "" }));
  if (keys.length >= n) keys.forEach((k, i) => batches[i % n].keys.push(k));
  else
    batches.forEach((b, i) => {
      // Fewer concepts than batches: batches share concepts, so steer each to different categories.
      if (keys.length) b.keys.push(keys[i % keys.length]);
      b.focus = CATEGORY_FOCUS[i % CATEGORY_FOCUS.length];
    });
  return batches;
}

/**
 * Generates a validated, balanced question set. Questions are written in small
 * parallel batches; each batch is checked (deterministic validation, then
 * independent-solve review) as soon as it arrives. Questions failing either check
 * are excluded; one replacement round is attempted if too many are rejected.
 */
export async function designQuestions(opts: {
  extracted: ExtractedContent;
  pages?: TranscribedPage[];
  settings: QuestSettings;
  questId: string;
  concepts: Concept[];
  conceptKeyById: Record<string, string>;
  ownerId: string;
  onProgress?: (p: GenerationProgress) => void | Promise<void>;
}): Promise<GeneratedQuestionSet> {
  const target = opts.settings.questionCount;
  const conceptIdByKey = Object.fromEntries(Object.entries(opts.conceptKeyById).map(([id, key]) => [key, id]));
  const src = sourceText(opts.pages, opts.extracted);
  const accepted: Question[] = [];
  const rejected: GeneratedQuestionSet["rejected"] = [];
  const progress: GenerationProgress = { done: 0, total: 0, accepted: 0 };
  const report = () => opts.onProgress?.({ ...progress });

  for (let round = 0; round < 2 && accepted.length < target; round++) {
    const need = Math.min(20, Math.ceil((target - accepted.length) * 1.4) + 1);
    const feedback =
      round > 0 && rejected.length
        ? `\nSome earlier questions were rejected for: ${rejected
            .slice(-6)
            .map((r) => r.issues[0])
            .join(" | ")}. Avoid these problems. Do not repeat these existing questions: ${accepted.map((q) => q.text.slice(0, 80)).join(" | ")}`
        : "";
    const batches = planBatches(need, Object.keys(conceptIdByKey));
    progress.total += batches.length;
    await report();

    const prior = [...accepted];
    const results = await Promise.allSettled(
      batches.map(async (b) => {
        const out = await generateJson({
          operation: "questions.generate",
          schema: QuestionSetOut,
          system: DESIGN_SYSTEM,
          parts: [
            {
              text: `Write ${b.count} questions for grade ${opts.settings.grade} ${opts.settings.subject}. Preferred difficulty: ${opts.settings.difficulty} (if "mixed", spread easy/medium/hard roughly 30/40/30). Learning goal: "${opts.settings.goal || "understand the chapter"}".
Use only these concept keys: ${b.keys.join(", ")}.
Cover every listed concept at least once if possible.${b.focus ? ` Favour ${b.focus} questions.` : ""}${feedback}

${src}`,
            },
          ],
          temperature: 0.7,
          ownerId: opts.ownerId,
          inputRefs: [opts.questId],
          timeoutMs: Math.max(config.aiTimeoutMs, 150_000),
          // Minimal thinking measured 31 s vs 55 s for a batch of 4 (2026-10-17). Correctness doesn't
          // rest on it: every question still passes the deterministic checks and an independent
          // review at full thinking before it is used.
          thinking: "minimal",
          hedgeAfterMs: 60_000,
        });

        const candidates: Question[] = [];
        const bad: GeneratedQuestionSet["rejected"] = [];
        for (const raw of out.questions) {
          const q = mapQuestionOut(raw, { questId: opts.questId, conceptIdByKey });
          if (!q) {
            bad.push({ text: raw.text, issues: [`Unknown concept key ${raw.conceptKey}`] });
            continue;
          }
          const check = validateQuestion(q, [...prior, ...candidates]);
          if (!check.ok) {
            bad.push({ text: q.text, issues: check.issues });
            continue;
          }
          q.validation = { status: "passed", checks: check.checks, issues: [], reviewedByModel: false };
          candidates.push(q);
        }

        const verdicts = await reviewQuestions(candidates, opts.ownerId, src);
        const good: Question[] = [];
        for (const q of candidates) {
          const v = verdicts.get(q.id);
          if (v?.ok) {
            q.validation.reviewedByModel = true;
            q.validation.checks.push("independent-solve-agrees");
            good.push(q);
          } else bad.push({ text: q.text, issues: [v?.issue ?? "Review failed"] });
        }
        progress.done++;
        progress.accepted += good.length;
        await report();
        return { good, bad };
      }),
    );

    for (const r of results) {
      if (r.status === "rejected") continue;
      rejected.push(...r.value.bad);
      // Batches ran in parallel, so check for duplicates across them here.
      for (const q of r.value.good) {
        const dup = accepted.find((o) => similarity(o.text, q.text) >= 0.8);
        if (dup) rejected.push({ text: q.text, issues: [`Near-duplicate of question ${dup.id}`] });
        else accepted.push(q);
      }
    }
    // Only give up when nothing at all came back; partial batch failures are covered by the next round.
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure && accepted.length === 0) throw failure.reason;
  }

  return { accepted: balance(accepted, Math.min(target + 4, accepted.length)), rejected };
}

/** Keep a balanced subset: round-robin over concepts, preferring category variety. */
function balance(qs: Question[], n: number): Question[] {
  const byConcept = new Map<string, Question[]>();
  for (const q of qs) byConcept.set(q.conceptId, [...(byConcept.get(q.conceptId) ?? []), q]);
  const out: Question[] = [];
  while (out.length < n) {
    let added = false;
    for (const list of byConcept.values()) {
      if (out.length >= n) break;
      const usedCats = new Set(out.map((q) => q.category));
      const idx = Math.max(0, list.findIndex((q) => !usedCats.has(q.category)));
      const [q] = list.splice(idx, 1);
      if (q) {
        out.push(q);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/* ================================================================== */
/* Personalized Tutor                                                  */
/* ================================================================== */

export async function tutorExplain(opts: {
  question: Question;
  selectedOptionId: string;
  conceptTitle: string;
  conceptDescription: string;
  grade: string;
  sourceExcerpt: string;
  priorMisconceptions: Record<string, number>;
  struggle: number;
  ownerId: string;
  thinking?: "minimal" | "low";
}): Promise<TutorContent> {
  const q = opts.question;
  const correct = q.options.find((o) => o.id === q.correctOptionId)!;
  const chosen = q.options.find((o) => o.id === opts.selectedOptionId);
  const df = q.distractorFeedback.find((d) => d.optionId === opts.selectedOptionId);
  const out = await generateJson({
    operation: "tutor.explain",
    schema: TutorOut,
    system: TUTOR_SYSTEM,
    parts: [
      {
        text: `Grade: ${opts.grade}. ${simplerStyle(opts.struggle)}
Concept: ${opts.conceptTitle}: ${opts.conceptDescription}
Question: ${q.text}
Options: ${q.options.map((o) => `${o.id}) ${o.text}`).join(" | ")}
Student chose: ${chosen ? `${chosen.id}) ${chosen.text}` : opts.selectedOptionId}
Correct answer (final, do not change): ${correct.id}) ${correct.text}
Stored explanation: ${q.explanation}
Known misconception for this choice: ${df ? `${df.misconception}: ${df.feedback}` : "unknown"}
Student's past misconceptions on this concept: ${JSON.stringify(opts.priorMisconceptions)}
Source notes excerpt:
${opts.sourceExcerpt.slice(0, 6000) || "(none: use established subject knowledge and set grounding to general)"}`,
      },
    ],
    temperature: 0.5,
    ownerId: opts.ownerId,
    inputRefs: [q.id],
    timeoutMs: 45_000,
    retries: 1,
    thinking: opts.thinking,
    // Normally 5-16 s at minimal thinking.
    hedgeAfterMs: 15_000,
  });
  let visual: VisualSpec | undefined = q.visual;
  if (out.visual && out.visual.m1 > 0 && out.visual.m2 > 0 && out.visual.u1 !== out.visual.u2) {
    visual = {
      kind: "collision-1d",
      title: "Worked example",
      m1: out.visual.m1,
      m2: out.visual.m2,
      u1: out.visual.u1,
      u2: out.visual.u2,
      e: clamp01(out.visual.e),
      label1: "1",
      label2: "2",
      massUnit: "kg",
      velocityUnit: "m/s",
      symbolic: false,
    };
  }
  return {
    heading: "Let's understand this",
    conceptTitle: opts.conceptTitle,
    simpleExplanation: out.simpleExplanation,
    whyWrong: out.whyWrong,
    misconception: { label: df?.misconception ?? out.misconceptionLabel, description: out.misconceptionDescription },
    steps: out.steps.map((s) => ({ title: s.title, body: s.body, latex: s.latex || undefined })),
    keyEquations: out.keyEquations,
    visual,
    grounding: out.grounding,
    uncertainty: out.uncertainty || undefined,
    simplified: opts.struggle >= 2,
  };
}

export async function tutorFollowUp(opts: {
  missed: Question;
  conceptKey: string;
  conceptTitle: string;
  difficulty: Question["difficulty"];
  misconception?: string;
  sourceExcerpt: string;
  grade: string;
  subject: string;
  avoid: Pick<Question, "id" | "text">[];
  ownerId: string;
  thinking?: "minimal" | "low";
}): Promise<Question | null> {
  const out = await generateJson({
    operation: "tutor.followup",
    schema: QuestionSetOut,
    system: `${DESIGN_SYSTEM}\nThis is a FOLLOW-UP question after a mistake. It must test the same underlying concept in a DIFFERENT context with different numbers, so it checks transfer rather than memory. Return exactly 1 question.`,
    parts: [
      {
        text: `Grade ${opts.grade} ${opts.subject}. Concept key: ${opts.conceptKey} (${opts.conceptTitle}). Difficulty: ${opts.difficulty}.
The student missed this question: ${opts.missed.text}
Misconception shown: ${opts.misconception ?? "unknown"}. Include a distractor that would catch this misconception again.
Notes excerpt:
${opts.sourceExcerpt.slice(0, 5000)}`,
      },
    ],
    temperature: 0.8,
    ownerId: opts.ownerId,
    inputRefs: [opts.missed.id],
    // It used to time out at 45 s twice and fall back; a stall now gets a backup request instead.
    timeoutMs: 90_000,
    retries: 1,
    hedgeAfterMs: 35_000,
    thinking: opts.thinking,
  });
  const raw = out.questions[0];
  const q = mapQuestionOut({ ...raw, conceptKey: opts.conceptKey }, {
    questId: opts.missed.questId,
    conceptIdByKey: { [opts.conceptKey]: opts.missed.conceptId },
    followUpOf: opts.missed.id,
  });
  if (!q) return null;
  const report = validateQuestion(q, [...opts.avoid, opts.missed]);
  if (!report.ok) return null;
  const verdict = (await reviewQuestions([q], opts.ownerId, opts.sourceExcerpt)).get(q.id);
  if (!verdict?.ok) return null;
  q.validation = { status: "passed", checks: [...report.checks, "independent-solve-agrees"], issues: [], reviewedByModel: true };
  return q;
}

/* ================================================================== */
/* End-of-run report                                                   */
/* ================================================================== */

export interface ReportInput {
  subject: string;
  grade: string;
  chapter: string;
  concepts: { id: string; title: string; answered: number; correct: number; fixedOnRetry: boolean; notes: string }[];
  mistakes: { conceptId: string; question: string; chosen: string; correct: string; misconception?: string; isFollowUp: boolean }[];
  ownerId: string;
  sessionId: string;
}

/** Writes the coaching report. Facts (scores, mistakes) come from the app; the model only explains them. */
export async function writeSessionReport(input: ReportInput): Promise<ReportOut> {
  const out = await generateJson({
    operation: "report.session",
    schema: ReportOut,
    system: REPORT_SYSTEM,
    parts: [
      {
        text: `Grade ${input.grade} ${input.subject}, chapter "${input.chapter}".

CONCEPTS (id · title · right/answered this run):
${input.concepts.map((c) => `- ${c.id} · ${c.title} · ${c.correct}/${c.answered}${c.fixedOnRetry ? " · fixed on a retry" : ""}`).join("\n")}

WRONG ANSWERS:
${input.mistakes.map((m, i) => `${i + 1}. [${m.conceptId}]${m.isFollowUp ? " (retry)" : ""} Q: ${m.question}\n   Chose: ${m.chosen}\n   Correct: ${m.correct}\n   Usual misconception: ${m.misconception ?? "unknown"}`).join("\n")}

NOTES EXCERPTS (for page labels):
${input.concepts
  .filter((c) => c.notes)
  .map((c) => `## ${c.title}\n${c.notes}`)
  .join("\n\n")
  .slice(0, 9000) || "(none)"}`,
      },
    ],
    temperature: 0.4,
    ownerId: input.ownerId,
    inputRefs: [input.sessionId],
    timeoutMs: 90_000,
    retries: 1,
    // Explaining known mistakes needs little reasoning; keep the results screen quick.
    thinking: "minimal",
    hedgeAfterMs: 25_000,
  });
  const ids = new Set(input.concepts.map((c) => c.id));
  const seen = new Set<string>();
  return { ...out, focus: out.focus.filter((f) => ids.has(f.conceptId) && !seen.has(f.conceptId) && (seen.add(f.conceptId), true)) };
}
