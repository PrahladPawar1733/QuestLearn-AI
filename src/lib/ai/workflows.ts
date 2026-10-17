import "server-only";
import { config } from "../config";
import { AppError } from "../errors";
import { newId, nowIso } from "../ids";
import type { Concept, ExtractedContent, Question, QuestSettings, TranscribedPage, TutorContent, VisualSpec } from "../types";
import { validateQuestion } from "../validation/questions";
import { generateJson, type InputPart } from "./client";
import { DESIGN_SYSTEM, EXTRACT_SYSTEM, REVIEW_SYSTEM, simplerStyle, TRANSCRIBE_SYSTEM, TUTOR_SYSTEM } from "./prompts";
import { ExtractionOut, QuestionSetOut, ReviewOut, TranscriptionOut, TutorOut, type QuestionOut } from "./schemas";

/* ================================================================== */
/* Material Analyst                                                    */
/* ================================================================== */

export interface ModelFile {
  ref: string;
  mimeType: string;
  /** Inline bytes (demo/local storage) … */
  base64?: string;
  /** … or a gs:// URI that Vertex AI reads directly (large files). */
  fileUri?: string;
}

export async function transcribeMaterial(files: ModelFile[], ownerId: string, materialId: string) {
  const parts: InputPart[] = [];
  for (const f of files) {
    parts.push({ text: `Source: ${f.ref}` });
    if (f.fileUri) parts.push({ fileData: { mimeType: f.mimeType, fileUri: f.fileUri } });
    else parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 ?? "" } });
  }
  parts.push({ text: "Transcribe all sources above." });
  const out = await generateJson({
    operation: "material.transcribe",
    schema: TranscriptionOut,
    system: TRANSCRIBE_SYSTEM,
    parts,
    temperature: 0.1,
    ownerId,
    inputRefs: [materialId],
  });
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
        text: `Student settings: subject=${settings.subject}, grade=${settings.grade}, chapter title given by student="${title}", goal="${settings.goal}".\n\nTRANSCRIPTION:\n${transcript}`,
      },
    ],
    temperature: 0.2,
    ownerId,
    inputRefs: [materialId],
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

export function mapQuestionOut(q: QuestionOut, ctx: { questId: string; conceptIdByKey: Record<string, string>; followUpOf?: string; id?: string }): Question | null {
  const conceptId = ctx.conceptIdByKey[q.conceptKey];
  if (!conceptId) return null;
  return {
    id: ctx.id ?? newId("q"),
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

/**
 * Generates a validated, balanced question set. Questions failing
 * deterministic validation or independent-solve review are excluded; one
 * replacement round is attempted if too many are rejected.
 */
export async function designQuestions(opts: {
  extracted: ExtractedContent;
  pages?: TranscribedPage[];
  settings: QuestSettings;
  questId: string;
  concepts: Concept[];
  conceptKeyById: Record<string, string>;
  ownerId: string;
}): Promise<GeneratedQuestionSet> {
  const target = opts.settings.questionCount;
  const conceptIdByKey = Object.fromEntries(Object.entries(opts.conceptKeyById).map(([id, key]) => [key, id]));
  const src = sourceText(opts.pages, opts.extracted);
  const accepted: Question[] = [];
  const rejected: GeneratedQuestionSet["rejected"] = [];

  for (let round = 0; round < 2 && accepted.length < target; round++) {
    const need = Math.min(20, Math.ceil((target - accepted.length) * 1.4) + 1);
    const feedback =
      round > 0 && rejected.length
        ? `\nSome earlier questions were rejected for: ${rejected
            .slice(-6)
            .map((r) => r.issues[0])
            .join(" | ")}. Avoid these problems. Do not repeat these existing questions: ${accepted.map((q) => q.text.slice(0, 80)).join(" | ")}`
        : "";
    const out = await generateJson({
      operation: "questions.generate",
      schema: QuestionSetOut,
      system: DESIGN_SYSTEM,
      parts: [
        {
          text: `Write ${need} questions for grade ${opts.settings.grade} ${opts.settings.subject}. Preferred difficulty: ${opts.settings.difficulty} (if "mixed", spread easy/medium/hard roughly 30/40/30). Learning goal: "${opts.settings.goal || "understand the chapter"}".
Use only these concept keys: ${Object.keys(conceptIdByKey).join(", ")}.
Cover every concept at least once if possible.${feedback}

${src}`,
        },
      ],
      temperature: 0.7,
      ownerId: opts.ownerId,
      inputRefs: [opts.questId],
      timeoutMs: Math.max(config.aiTimeoutMs, 120_000),
    });

    const candidates: Question[] = [];
    for (const raw of out.questions) {
      const q = mapQuestionOut(raw, { questId: opts.questId, conceptIdByKey });
      if (!q) {
        rejected.push({ text: raw.text, issues: [`Unknown concept key ${raw.conceptKey}`] });
        continue;
      }
      const report = validateQuestion(q, [...accepted, ...candidates]);
      if (!report.ok) {
        rejected.push({ text: q.text, issues: report.issues });
        continue;
      }
      q.validation = { status: "passed", checks: report.checks, issues: [], reviewedByModel: false };
      candidates.push(q);
    }

    const verdicts = await reviewQuestions(candidates, opts.ownerId, src);
    for (const q of candidates) {
      const v = verdicts.get(q.id);
      if (v?.ok) {
        q.validation.reviewedByModel = true;
        q.validation.checks.push("independent-solve-agrees");
        accepted.push(q);
      } else rejected.push({ text: q.text, issues: [v?.issue ?? "Review failed"] });
    }
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
    timeoutMs: 45_000,
    retries: 1,
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
