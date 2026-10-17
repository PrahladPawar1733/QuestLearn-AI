import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared enums                                                        */
/* ------------------------------------------------------------------ */

export const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology", "Other"] as const;
export const Subject = z.enum(SUBJECTS);
export type Subject = z.infer<typeof Subject>;

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const Difficulty = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof Difficulty>;

export const DifficultyPreference = z.enum(["easy", "medium", "hard", "mixed"]);
export type DifficultyPreference = z.infer<typeof DifficultyPreference>;

/** Pedagogical category: used to build a balanced quest. */
export const QuestionCategory = z.enum(["understanding", "application", "numerical", "reasoning"]);
export type QuestionCategory = z.infer<typeof QuestionCategory>;

/**
 * Question types. Only single-answer MCQ is playable in the MVP, but the
 * schema is a discriminated union so new types can be added without
 * touching existing records.
 */
export const QuestionType = z.enum(["mcq_single"]);
export type QuestionType = z.infer<typeof QuestionType>;

/** Where a piece of content came from. Shown to the student, never faked. */
export const ContentOrigin = z.enum([
  "demo_prepared", // hand-written, reviewed sample content
  "template", // deterministic parametric generator (no AI)
  "ai_generated", // produced by Gemini and validated by app code
]);
export type ContentOrigin = z.infer<typeof ContentOrigin>;

export const GameWorld = z.enum(["classic", "balloons", "maze", "rocket", "bubbles", "castle"]);
export type GameWorld = z.infer<typeof GameWorld>;

/* ------------------------------------------------------------------ */
/* Visual specifications (rendered deterministically on the client)    */
/* ------------------------------------------------------------------ */

export const CollisionVisual = z.object({
  kind: z.literal("collision-1d"),
  title: z.string().optional(),
  m1: z.number().positive(),
  m2: z.number().positive(),
  u1: z.number(),
  u2: z.number(),
  /** Coefficient of restitution. 1 = elastic, 0 = perfectly inelastic. */
  e: z.number().min(0).max(1),
  label1: z.string().default("A"),
  label2: z.string().default("B"),
  /** Units shown on labels. */
  massUnit: z.string().default("kg"),
  velocityUnit: z.string().default("m/s"),
  /** Hide numbers when the question is symbolic (e.g. speed "u"). */
  symbolic: z.boolean().default(false),
});
export type CollisionVisual = z.infer<typeof CollisionVisual>;

export const BounceVisual = z.object({
  kind: z.literal("bounce"),
  title: z.string().optional(),
  dropHeight: z.number().positive(),
  e: z.number().min(0).max(1),
  heightUnit: z.string().default("m"),
});
export type BounceVisual = z.infer<typeof BounceVisual>;

export const MomentumBarsVisual = z.object({
  kind: z.literal("momentum-bars"),
  title: z.string().optional(),
  items: z
    .array(z.object({ label: z.string(), value: z.number(), unit: z.string().default("kg·m/s") }))
    .min(1)
    .max(6),
});
export type MomentumBarsVisual = z.infer<typeof MomentumBarsVisual>;

export const VisualSpec = z.discriminatedUnion("kind", [CollisionVisual, BounceVisual, MomentumBarsVisual]);
export type VisualSpec = z.infer<typeof VisualSpec>;

/* ------------------------------------------------------------------ */
/* Numerical calculation spec (recomputed by app code)                 */
/* ------------------------------------------------------------------ */

export const CalcVariable = z.object({
  value: z.number(),
  /** Unit string understood by src/lib/validation/units.ts, e.g. "kg", "m/s", "" */
  unit: z.string(),
});

export const CalcSpec = z.object({
  /** Arithmetic expression over the variables, e.g. "(m1*u1 + m2*u2)/(m1+m2)" */
  expression: z.string().min(1).max(300),
  variables: z.record(z.string(), CalcVariable),
  /** Unit the answer is expressed in; must be dimensionally consistent. */
  answerUnit: z.string(),
  /** Allowed relative tolerance when matching the correct option. */
  tolerance: z.number().min(0).max(0.1).default(0.02),
});
export type CalcSpec = z.infer<typeof CalcSpec>;

/** Optional extra physics invariants to verify for collision problems. */
export const CollisionCheck = z.object({
  kind: z.literal("collision-1d"),
  m1: z.number().positive(),
  m2: z.number().positive(),
  u1: z.number(),
  u2: z.number(),
  v1: z.number(),
  v2: z.number(),
});
export type CollisionCheck = z.infer<typeof CollisionCheck>;

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

export const OPTION_IDS = ["A", "B", "C", "D", "E"] as const;

export const QuestionOption = z.object({
  id: z.enum(OPTION_IDS),
  text: z.string().min(1).max(400),
});
export type QuestionOption = z.infer<typeof QuestionOption>;

export const DistractorFeedback = z.object({
  optionId: z.enum(OPTION_IDS),
  /** Short, stable label, e.g. "momentum-is-scalar" */
  misconception: z.string().min(1).max(80),
  /** Why a student might pick this, and why it is wrong. */
  feedback: z.string().min(1).max(600),
});
export type DistractorFeedback = z.infer<typeof DistractorFeedback>;

export const SourceRef = z.object({
  ref: z.string().max(80), // e.g. "Page 2", "Image 1", "Demo chapter §3"
  quote: z.string().max(300).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** The full question as stored on the server. Contains the answer key. */
export const Question = z.object({
  id: z.string(),
  questId: z.string(),
  conceptId: z.string(),
  type: QuestionType,
  category: QuestionCategory,
  difficulty: Difficulty,
  text: z.string().min(5).max(1200),
  options: z.array(QuestionOption).min(3).max(5),
  correctOptionId: z.enum(OPTION_IDS),
  explanation: z.string().min(1).max(1500),
  distractorFeedback: z.array(DistractorFeedback),
  hint: z.string().max(400).optional(),
  steps: z.array(z.string().max(400)).max(8).optional(),
  calc: CalcSpec.optional(),
  physicsCheck: CollisionCheck.optional(),
  visual: VisualSpec.optional(),
  sourceRefs: z.array(SourceRef).default([]),
  origin: ContentOrigin,
  /** Set when this is a follow-up generated for a specific mistake. */
  followUpOf: z.string().optional(),
  validation: z.object({
    status: z.enum(["passed", "failed"]),
    checks: z.array(z.string()),
    issues: z.array(z.string()),
    reviewedByModel: z.boolean().default(false),
  }),
  createdAt: z.string(),
});
export type Question = z.infer<typeof Question>;

/** The question as sent to the browser while it is open. No answer key. */
export type PublicQuestion = Pick<
  Question,
  "id" | "conceptId" | "type" | "category" | "difficulty" | "text" | "options" | "origin" | "followUpOf"
> & {
  hasHint: boolean;
  visual?: VisualSpec;
  conceptTitle: string;
};

/* ------------------------------------------------------------------ */
/* Materials, concepts, quests                                          */
/* ------------------------------------------------------------------ */

export const ProcessingStage = z.enum([
  "uploaded",
  "reading",
  "concepts",
  "questions",
  "preparing",
  "ready",
  "failed",
]);
export type ProcessingStage = z.infer<typeof ProcessingStage>;

export const MaterialFile = z.object({
  index: z.number().int(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  storagePath: z.string(),
  /** Processed copy sent to the model (oriented, resized). */
  processedPath: z.string().optional(),
  pageCount: z.number().int().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type MaterialFile = z.infer<typeof MaterialFile>;

export const TranscribedPage = z.object({
  ref: z.string(),
  transcript: z.string(),
  readability: z.enum(["clear", "partial", "unreadable"]),
  notes: z.string().optional(),
});
export type TranscribedPage = z.infer<typeof TranscribedPage>;

export const ExtractedContent = z.object({
  chapterTitle: z.string(),
  subject: z.string(),
  grade: z.string().optional(),
  summary: z.string(),
  concepts: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        description: z.string(),
        difficulty: Difficulty,
        sourceRefs: z.array(SourceRef),
        /** true = explicitly in the student's notes; false = supplied by the model */
        fromNotes: z.boolean(),
      }),
    )
    .min(1),
  definitions: z.array(
    z.object({ term: z.string(), definition: z.string(), sourceRef: z.string().optional(), fromNotes: z.boolean() }),
  ),
  formulas: z.array(
    z.object({ latex: z.string(), meaning: z.string(), sourceRef: z.string().optional(), fromNotes: z.boolean() }),
  ),
  examples: z.array(z.object({ problem: z.string(), solution: z.string().optional(), sourceRef: z.string().optional() })),
  relationships: z.array(z.object({ from: z.string(), to: z.string(), relation: z.string() })),
  uncertain: z.array(z.object({ ref: z.string(), issue: z.string() })),
});
export type ExtractedContent = z.infer<typeof ExtractedContent>;

export const QuestSettings = z.object({
  subject: Subject,
  grade: z.string().max(20),
  goal: z.string().max(200).default(""),
  difficulty: DifficultyPreference,
  questionCount: z.number().int().min(4).max(15),
});
export type QuestSettings = z.infer<typeof QuestSettings>;

export const Material = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  settings: QuestSettings,
  files: z.array(MaterialFile),
  stage: ProcessingStage,
  /** Last stage that completed successfully; retries resume after it. */
  completedStages: z.array(ProcessingStage),
  error: z
    .object({ code: z.string(), message: z.string(), stage: ProcessingStage, retryable: z.boolean() })
    .optional(),
  transcription: z.array(TranscribedPage).optional(),
  extracted: ExtractedContent.optional(),
  questId: z.string().optional(),
  isDemo: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Material = z.infer<typeof Material>;

export const Concept = z.object({
  id: z.string(),
  materialId: z.string(),
  questId: z.string().optional(),
  ownerId: z.string(),
  /** Short key used in model prompts (AI-generated chapters). */
  key: z.string().optional(),
  title: z.string(),
  description: z.string(),
  subject: z.string(),
  difficulty: Difficulty,
  sourceRefs: z.array(SourceRef),
  fromNotes: z.boolean(),
  /** Key of a deterministic follow-up generator, if one exists. */
  generatorKey: z.string().optional(),
});
export type Concept = z.infer<typeof Concept>;

export const Quest = z.object({
  id: z.string(),
  ownerId: z.string(),
  materialId: z.string(),
  title: z.string(),
  subject: z.string(),
  grade: z.string(),
  conceptIds: z.array(z.string()),
  questionIds: z.array(z.string()),
  /** Number of main questions in one play-through. */
  playLength: z.number().int(),
  status: z.enum(["ready", "archived"]),
  origin: ContentOrigin,
  rejectedCount: z.number().int().default(0),
  createdAt: z.string(),
});
export type Quest = z.infer<typeof Quest>;

/* ------------------------------------------------------------------ */
/* Play sessions, attempts, mastery                                    */
/* ------------------------------------------------------------------ */

export const AdaptationNote = z.object({
  at: z.string(),
  questionId: z.string(),
  targetDifficulty: Difficulty,
  reason: z.string(),
});
export type AdaptationNote = z.infer<typeof AdaptationNote>;

export const SessionAnswer = z.object({
  questionId: z.string(),
  conceptId: z.string(),
  selectedOptionId: z.string(),
  isCorrect: z.boolean(),
  isFollowUp: z.boolean(),
  hintUsed: z.boolean(),
  xpAwarded: z.number(),
  difficulty: Difficulty,
  answeredAt: z.string(),
});
export type SessionAnswer = z.infer<typeof SessionAnswer>;

export const Session = z.object({
  id: z.string(),
  ownerId: z.string(),
  questId: z.string(),
  world: GameWorld,
  kind: z.enum(["quest", "practice"]),
  /** Questions this session may draw from (quest pool, or practice set). */
  poolQuestionIds: z.array(z.string()),
  /** Number of main questions in this play-through. */
  playLength: z.number().int(),
  status: z.enum(["active", "completed"]),
  /** Ordered main questions already served. */
  servedQuestionIds: z.array(z.string()),
  currentQuestionId: z.string().optional(),
  /** Follow-up question waiting to be answered, if any. */
  pendingFollowUpId: z.string().optional(),
  /** Question just answered incorrectly whose lesson is open. */
  tutorForQuestionId: z.string().optional(),
  hintsUsed: z.array(z.string()),
  answers: z.array(SessionAnswer),
  xp: z.number(),
  streak: z.number(),
  bestStreak: z.number(),
  targetDifficulty: Difficulty,
  adaptations: z.array(AdaptationNote),
  /** Wrong answers per concept within this session (drives simplification). */
  struggles: z.record(z.string(), z.number()),
  achievementsEarned: z.array(z.string()),
  completionBonus: z.number().default(0),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type Session = z.infer<typeof Session>;

export const Attempt = z.object({
  id: z.string(),
  ownerId: z.string(),
  sessionId: z.string(),
  questId: z.string(),
  questionId: z.string(),
  conceptId: z.string(),
  selectedOptionId: z.string(),
  isCorrect: z.boolean(),
  misconception: z.string().optional(),
  isFollowUp: z.boolean(),
  hintUsed: z.boolean(),
  xpAwarded: z.number(),
  createdAt: z.string(),
});
export type Attempt = z.infer<typeof Attempt>;

export const MasteryResult = z.object({
  correct: z.boolean(),
  followUp: z.boolean(),
  hint: z.boolean(),
  difficulty: Difficulty,
  at: z.string(),
});
export type MasteryResult = z.infer<typeof MasteryResult>;

export const ConceptMastery = z.object({
  id: z.string(), // `${ownerId}__${conceptId}`
  ownerId: z.string(),
  conceptId: z.string(),
  conceptTitle: z.string(),
  subject: z.string(),
  questId: z.string(),
  attempts: z.number(),
  correctAttempts: z.number(),
  followUpAttempts: z.number(),
  followUpCorrect: z.number(),
  recentResults: z.array(MasteryResult),
  misconceptions: z.record(z.string(), z.number()),
  masteryScore: z.number(), // 0..100
  lastPracticedAt: z.string(),
});
export type ConceptMastery = z.infer<typeof ConceptMastery>;

export const User = z.object({
  id: z.string(),
  displayName: z.string(),
  grade: z.string().optional(),
  isGuest: z.boolean(),
  totalXP: z.number(),
  currentStreakDays: z.number(),
  lastActiveDay: z.string().optional(),
  questionsAnswered: z.number(),
  achievements: z.array(z.object({ id: z.string(), earnedAt: z.string() })),
  worldsPlayed: z.array(GameWorld),
  createdAt: z.string(),
});
export type User = z.infer<typeof User>;

/* ------------------------------------------------------------------ */
/* Tutor content                                                       */
/* ------------------------------------------------------------------ */

export const TutorContent = z.object({
  heading: z.string().default("Let's understand this"),
  conceptTitle: z.string(),
  simpleExplanation: z.string().min(1).max(1200),
  whyWrong: z.string().min(1).max(900),
  misconception: z.object({ label: z.string(), description: z.string() }),
  steps: z
    .array(z.object({ title: z.string().max(120), body: z.string().max(600), latex: z.string().max(300).optional() }))
    .min(1)
    .max(7),
  keyEquations: z.array(z.object({ latex: z.string().max(300), meaning: z.string().max(240) })).max(4),
  visual: VisualSpec.optional(),
  grounding: z.enum(["notes", "general", "mixed"]),
  uncertainty: z.string().max(400).optional(),
  simplified: z.boolean().default(false),
});
export type TutorContent = z.infer<typeof TutorContent>;

export const LearningAsset = z.object({
  id: z.string(),
  ownerId: z.string(),
  conceptId: z.string(),
  sessionId: z.string().optional(),
  type: z.enum(["tutor", "video", "diagram"]),
  origin: ContentOrigin,
  storagePath: z.string().optional(),
  content: z.unknown().optional(),
  generationStatus: z.enum(["pending", "processing", "ready", "failed", "unavailable"]),
  operationName: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningAsset = z.infer<typeof LearningAsset>;

export const AuditEntry = z.object({
  id: z.string(),
  ownerId: z.string().optional(),
  operation: z.string(),
  model: z.string().optional(),
  inputRefs: z.array(z.string()),
  outcome: z.enum(["success", "validation_failed", "error", "fallback"]),
  detail: z.string().optional(),
  retries: z.number().default(0),
  durationMs: z.number(),
  action: z.string().optional(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
