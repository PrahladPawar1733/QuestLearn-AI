/**
 * The contract between a real-time game and the learning engine.
 *
 * Three invariants hold for every game in this app:
 *
 *  1. A game never decides correctness. It renders, it takes input, and it
 *     reacts to an outcome the *server* produced from the stored answer key.
 *     This is the same rule the old "worlds" followed and it is what lets us
 *     promise students that a skin can never mark them wrong.
 *
 *  2. A game never talks to Gemini. Questions arrive pre-generated and
 *     pre-validated through `LearningDirector`, which fetches them while the
 *     student is still playing. Nothing in a frame callback does I/O.
 *
 *  3. Driving skill and subject knowledge are scored separately. Crashing a
 *     car must never move a mastery number, and missing a physics question
 *     must never end a run. `GameRunSummary` keeps the two columns apart.
 */
import type { ContentOrigin, Difficulty, VisualSpec } from "@/lib/types";
import type { InputManager } from "./input";

/** A cosmetic option (paint, suit, colour), kept structural so the shared
 * module contract does not depend on any one game's asset types. */
export interface CarPaintLike {
  id: string;
  name: string;
}

/** Games are addressed by a stable id so saves and previews can reference them. */
export type GameId = "spider-climb" | "force-rush";

/* ------------------------------------------------------------------ */
/* Quality + motion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Graphics tiers. A mid-range Android phone should hold 60fps on "low", so
 * "low" is a real, playable tier rather than a degraded apology: it drops
 * shadows and post-processing but keeps the art direction intact.
 */
export type QualityTier = "low" | "medium" | "high";

export interface QualitySettings {
  tier: QualityTier;
  /** Cap on devicePixelRatio. Retina phones render 3x by default, which no mobile GPU can sustain in 3D. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** How far the camera can see, in world metres. Drives fog distance too. */
  drawDistance: number;
  /** Number of scenery instances (buildings, props) kept alive around the player. */
  sceneryDensity: number;
  antialias: boolean;
  /** Reflections on the car body and wet road. */
  reflections: boolean;
  particles: boolean;
  /** Target frame rate used by the loop's catch-up guard. */
  targetFps: 30 | 60;
}

/**
 * Accessibility switches a game must honour. These are separate from
 * `QualitySettings` because they are a student's stated preference, not a
 * performance trade-off, and must survive a quality change.
 */
export interface MotionPreferences {
  /** prefers-reduced-motion, or the in-app toggle. Disables shake and blur. */
  reducedMotion: boolean;
  cameraShake: boolean;
  motionBlur: boolean;
  /** Hides the speed-streak vignette, which some students find nauseating. */
  speedEffects: boolean;
}

/* ------------------------------------------------------------------ */
/* Questions as a game sees them                                       */
/* ------------------------------------------------------------------ */

/**
 * A validated question in the shape a game needs. This is deliberately a
 * narrower view than `PublicQuestion`: a game gets no answer key, and the
 * fields are flattened so a HUD can render one without touching app types.
 */
export interface GameQuestion {
  id: string;
  conceptId: string;
  conceptTitle: string;
  text: string;
  options: { id: string; text: string }[];
  difficulty: Difficulty;
  origin: ContentOrigin;
  hasHint: boolean;
  visual?: VisualSpec;
  /** True when this question is a second chance at a concept the student just missed. */
  isRecovery: boolean;
  /** Why the adaptive engine chose this one, shown as "Why this question". */
  reason?: string;
}

/**
 * What the game grants for a correct answer. The game chooses which rewards
 * it supports; the learning layer only decides *whether* one is earned, so
 * the same director drives a racer and a swinging game unchanged.
 */
export type CheckpointReward =
  | { kind: "nitro"; amount: number }
  | { kind: "repair"; amount: number }
  | { kind: "shortcut" }
  | { kind: "time"; seconds: number }
  | { kind: "none" };

/** A game asking for a teaching moment, raised only when gameplay is safe to pause. */
export interface CheckpointRequest {
  /** Stable id of the checkpoint in the track/level, so a retry is not double-counted. */
  checkpointId: string;
  /** What the game will grant if the student answers correctly. */
  offered: CheckpointReward;
  /** Where to anchor the question card in screen space, so it appears at the gate. */
  anchor?: { x: number; y: number };
}

/** The settled result of a checkpoint, handed back to the game to apply. */
export interface CheckpointOutcome {
  checkpointId: string;
  questionId: string;
  conceptId: string;
  correct: boolean;
  /** Granted reward. `none` when the answer was wrong — but never a penalty. */
  reward: CheckpointReward;
  /** True when the student has been offered a recovery question on this concept. */
  recoveryOffered: boolean;
}

/* ------------------------------------------------------------------ */
/* The game itself                                                     */
/* ------------------------------------------------------------------ */

export type PauseReason =
  /** Student pressed pause. */
  | "user"
  /** A question is open. Gameplay must be fully frozen, never merely slowed. */
  | "checkpoint"
  /** Tab hidden / window blurred. */
  | "hidden"
  /** Showing the run summary. */
  | "finished";

/**
 * Everything a game is given by its React host. The game owns the canvas and
 * the render loop; the host owns the DOM chrome, the question UI and the
 * network. They talk only through these callbacks, which is what keeps
 * rendering independent of question generation and progress tracking.
 */
export interface GameHostContext<THud = unknown> {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  quality: QualitySettings;
  motion: MotionPreferences;
  /** Deterministic seed so a track can be replayed and shared. */
  seed: string;

  /** Raised when the player reaches a safe teaching moment. The host pauses the game. */
  onCheckpoint: (req: CheckpointRequest) => void;
  /**
   * Per-frame HUD snapshot. The host throttles this into React state — a game
   * must be able to call it every frame without causing a re-render storm.
   */
  onHud: (state: THud) => void;
  /** The run ended (finished the track, or the student quit from the pause menu). */
  onFinish: (summary: GameRunSummary) => void;
  /** Non-recoverable failure, e.g. WebGL context lost and not restorable. */
  onError: (error: Error) => void;
  /** Transient, student-facing notice ("Shortcut unlocked"), shown as a toast. */
  onNotice?: (text: string) => void;
  /**
   * The student chose an answer inside the game world (e.g. shot at a corner
   * of the goal). Only used by games that implement `presentQuestion`.
   */
  onAnswerChosen?: (optionId: string) => void;
  /**
   * The player pressed Escape / Start inside the canvas. The game does not
   * open its own menu — the host owns all DOM chrome — so it asks here.
   */
  onPauseRequest?: () => void;
}

/**
 * Lifecycle of a game. Implementations are plain classes, not React
 * components, so the render loop never participates in reconciliation.
 */
export interface LearningGame<THud = unknown> {
  readonly id: GameId;
  /** Allocate GPU resources and build the scene. May be async to code-split assets. */
  mount(host: GameHostContext<THud>): Promise<void> | void;
  start(): void;
  pause(reason: PauseReason): void;
  resume(): void;
  resize(width: number, height: number): void;
  setQuality(q: QualitySettings): void;
  setMotionPreferences(p: MotionPreferences): void;
  /** Apply a settled checkpoint: grant nitro, repair damage, open a shortcut. */
  applyCheckpointOutcome(outcome: CheckpointOutcome): void;
  /** Release GPU resources, listeners and audio. Must be idempotent. */
  dispose(): void;

  /* ---- host <-> game channel -------------------------------------------
     These began as ad-hoc methods on Car Rush. Every game needs all of them,
     so they belong in the contract: without them the shared host has to know
     which game it is hosting, which defeats the point. ------------------- */

  /** The game's own InputManager, so on-screen controls write to the real one. */
  readonly inputManager: InputManager;
  /** Smoothed frame rate, for the host's quality governor. */
  readonly fps: number;
  /** End the run now and emit a summary (the pause menu's "end run"). */
  quit(): void;
  /** True when a question is buffered and the next safe moment may ask it. */
  setQuestionArmed(armed: boolean): void;
  /** False once the quest is out of questions, so the game stops queueing them. */
  setQuestionsRemain(remain: boolean): void;
  /** Learning state for the HUD rail. Display only — the game never computes it. */
  setLearningState(state: { intent: string; learned: number; met: number; nextConcept: string | null }): void;

  /**
   * Optional: the game presents the question itself, in the world.
   *
   * The best learning games do not stop play to show a quiz card — the answer
   * IS the move. A penalty shootout puts one option in each corner of the
   * goal; choosing a corner is both the answer and the shot. A game that
   * implements this receives the question and reports the chosen option
   * through `onAnswerChosen`; the host then scores it exactly as before and
   * never renders its own card.
   */
  presentQuestion?(question: GameQuestion): void;
  /** Called with the settled result so the game can animate the outcome. */
  settleQuestion?(correct: boolean, correctOptionId: string): void;
}

/* ------------------------------------------------------------------ */
/* Run summary                                                         */
/* ------------------------------------------------------------------ */

/**
 * The end-of-run report. `game` and `learning` are deliberately separate
 * blocks: a student who drives badly but answers well should see that
 * plainly, and vice versa.
 */
export interface GameRunSummary {
  gameId: GameId;
  outcome: "finished" | "quit";
  game: {
    /** Seconds of elapsed race/run time. */
    durationSec: number;
    distanceM: number;
    topSpeedKph: number;
    checkpointsPassed: number;
    checkpointsTotal: number;
    crashes: number;
    /** Game-only score. Never mixed into XP, which the server owns. */
    score: number;
    /** Per-game extras (drift metres, rescues completed). Rendered as plain stats. */
    extras?: Record<string, number>;
  };
  learning: {
    answered: number;
    correct: number;
    recoveriesFixed: number;
  };
}
