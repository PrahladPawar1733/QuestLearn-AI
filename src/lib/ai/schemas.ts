/**
 * Model-facing output schemas. Deliberately flatter than the domain types
 * (no records, no defaults) so they map cleanly onto Gemini structured output.
 * Every model result is parsed with these, then mapped and re-validated by
 * application code before it is stored.
 */
import { z } from "zod";

export const TranscriptionOut = z.object({
  isStudyMaterial: z.boolean().describe("false if the images/PDF are not educational notes or textbook content"),
  overallReadability: z.enum(["clear", "partial", "unreadable"]),
  detectedSubject: z.string(),
  detectedTopic: z.string(),
  pages: z
    .array(
      z.object({
        ref: z.string().describe('Source label exactly as given, e.g. "Image 2" or "PDF 1, page 3"'),
        transcript: z
          .string()
          .describe("Faithful transcription in Markdown. Equations in LaTeX between $...$. Mark illegible parts as [illegible]. Describe diagrams in [diagram: ...]."),
        readability: z.enum(["clear", "partial", "unreadable"]),
        notes: z.string().describe("What could not be read, or empty string"),
      }),
    )
    .min(1),
});
export type TranscriptionOut = z.infer<typeof TranscriptionOut>;

const Diff = z.enum(["easy", "medium", "hard"]);

export const ExtractionOut = z.object({
  chapterTitle: z.string(),
  subject: z.string(),
  grade: z.string(),
  summary: z.string().describe("2-3 sentence summary for a student"),
  concepts: z
    .array(
      z.object({
        key: z.string().describe("short kebab-case id, unique"),
        title: z.string(),
        description: z.string().describe("one or two sentences, student-friendly"),
        difficulty: Diff,
        fromNotes: z.boolean().describe("true only if the concept is explicitly present in the notes"),
        sourceRefs: z.array(z.object({ ref: z.string(), quote: z.string() })),
        templateKey: z
          .enum(["none", "momentum", "conservation", "elastic", "inelastic", "restitution", "problems"])
          .describe("Matching deterministic practice generator, or none"),
      }),
    )
    .min(1)
    .max(10),
  definitions: z.array(z.object({ term: z.string(), definition: z.string(), sourceRef: z.string(), fromNotes: z.boolean() })),
  formulas: z.array(z.object({ latex: z.string(), meaning: z.string(), sourceRef: z.string(), fromNotes: z.boolean() })),
  examples: z.array(z.object({ problem: z.string(), solution: z.string(), sourceRef: z.string() })),
  relationships: z.array(z.object({ from: z.string(), to: z.string(), relation: z.string() })),
  uncertain: z.array(z.object({ ref: z.string(), issue: z.string() })),
});
export type ExtractionOut = z.infer<typeof ExtractionOut>;

const OptionId = z.enum(["A", "B", "C", "D"]);

export const QuestionOut = z.object({
  conceptKey: z.string(),
  category: z.enum(["understanding", "application", "numerical", "reasoning"]),
  difficulty: Diff,
  text: z.string(),
  options: z.array(z.object({ id: OptionId, text: z.string() })).length(4),
  correctOptionId: OptionId,
  explanation: z.string(),
  distractors: z
    .array(z.object({ optionId: OptionId, misconception: z.string().describe("kebab-case label"), feedback: z.string() }))
    .describe("one entry for each WRONG option"),
  hint: z.string(),
  steps: z.array(z.string()).max(6),
  calc: z
    .object({
      expression: z.string().describe("arithmetic over the variable names using + - * / ^ ( ) sqrt abs"),
      variables: z.array(z.object({ name: z.string(), value: z.number(), unit: z.string() })),
      answerUnit: z.string(),
    })
    .nullable()
    .describe("REQUIRED for numerical questions, null otherwise"),
  collision: z
    .object({ m1: z.number(), m2: z.number(), u1: z.number(), u2: z.number(), v1: z.number(), v2: z.number() })
    .nullable()
    .describe("For 1D two-body collision questions: masses and initial/final velocities, else null"),
  sourceRefs: z.array(z.object({ ref: z.string(), quote: z.string() })),
});
export type QuestionOut = z.infer<typeof QuestionOut>;

export const QuestionSetOut = z.object({ questions: z.array(QuestionOut).min(1).max(24) });

export const ReviewOut = z.object({
  reviews: z.array(
    z.object({
      id: z.string(),
      chosenOptionId: z.enum(["A", "B", "C", "D", "E"]),
      ambiguous: z.boolean(),
      factualProblem: z.boolean(),
      issue: z.string(),
    }),
  ),
});
export type ReviewOut = z.infer<typeof ReviewOut>;

/** End-of-run coaching report: one entry per concept the student slipped on. */
export const ReportOut = z.object({
  summary: z.string().describe("2-3 sentences, second person: how the run went and the single most important thing to work on"),
  focus: z
    .array(
      z.object({
        conceptId: z.string().describe("Exactly one of the concept ids given"),
        whatWentWrong: z.string().describe("The pattern behind the student's wrong answers on this concept, in 1-2 sentences. Name the misunderstanding, don't just restate the question."),
        keyIdea: z.string().describe("The one idea to learn so it doesn't happen again, 1-2 sentences, $...$ for maths"),
        nextSteps: z.array(z.string()).min(1).max(3).describe("Concrete actions, each one short sentence: what to re-read (cite the page label), what kind of problem to redo, what to check"),
        sourceRef: z.string().describe("Page label from the notes to revisit, or empty string"),
      }),
    )
    .max(6),
  strengths: z.string().describe("One sentence on what went well, or empty string if nothing did"),
});
export type ReportOut = z.infer<typeof ReportOut>;

export const TutorOut = z.object({
  simpleExplanation: z.string(),
  whyWrong: z.string(),
  misconceptionLabel: z.string(),
  misconceptionDescription: z.string(),
  steps: z.array(z.object({ title: z.string(), body: z.string(), latex: z.string() })).min(2).max(6),
  keyEquations: z.array(z.object({ latex: z.string(), meaning: z.string() })).max(3),
  visual: z
    .object({ m1: z.number(), m2: z.number(), u1: z.number(), u2: z.number(), e: z.number() })
    .nullable()
    .describe("Only for 1D collision scenarios; else null"),
  grounding: z.enum(["notes", "general", "mixed"]),
  uncertainty: z.string().describe("Empty string if confident; otherwise what the notes don't support"),
});
export type TutorOut = z.infer<typeof TutorOut>;
