/**
 * The plug-in contract for a game.
 *
 * `LearningGame` (./types.ts) describes the simulation. This describes the
 * whole *package* a game must hand the app: the simulation plus its HUD, its
 * touch controls and the few bits of copy the shared host needs. Once a game
 * exports a `GameModule`, it needs no changes anywhere else — the registry
 * picks it up and the generic player hosts it.
 *
 * Before this existed, adding a game meant editing four unrelated places
 * (the `GameWorld` enum, `REALTIME_GAMES`, the metadata list, and a
 * hard-coded component in the quest page), which is why `city-swing` was
 * declared in exactly one of them and could never actually run.
 */
import type { ComponentType } from "react";
import type { InputManager } from "./input";
import type { CarPaintLike, GameId, LearningGame } from "./types";

/** Props every game HUD receives. Games keep their own HUD shape. */
export interface GameHudProps<THud> {
  hud: THud;
  /** False while a question, pause menu or summary is covering the game. */
  visible: boolean;
  /**
   * Report the student's answer. Page-layout games render the options as real
   * DOM buttons (proper typography, focus, screen-reader support), so the
   * choice arrives from the HUD rather than from a canvas hit-test.
   */
  onChoose?: (optionId: string) => void;
  /** Dismiss the feedback and move to the next question. */
  onContinue?: () => void;
}

/** A single row in the pre-race controls help. */
export interface ControlHint {
  keys: string;
  action: string;
}

export interface GameCreateOptions {
  /** Driver/player assist 0..1. Always a *skill* aid, never an academic one. */
  assist: number;
  /** How many teaching moments the level should contain. */
  learningCheckpoints: number;
  /** Optional per-game cosmetic choice (vehicle, suit, colour). */
  cosmetic?: CarPaintLike;
}

export interface GameModule<THud = unknown> {
  readonly id: GameId;
  /** Shown on the ready screen above the controls table. */
  readonly tagline: string;
  /** One line explaining how a correct answer helps, in this game's terms. */
  readonly rewardLine: string;
  /** Keyboard help rows. Touch help is rendered from the controls component. */
  readonly controls: ControlHint[];
  /** A short line telling phone players how to play. */
  readonly touchHint?: string;
  /** Starting HUD value, rendered before the first frame arrives. */
  readonly emptyHud: THud;

  create(opts: GameCreateOptions): LearningGame<THud>;
  Hud: ComponentType<GameHudProps<THud>>;
  /** Rendered only while the game is playable, on coarse-pointer devices. */
  TouchControls?: ComponentType<{ input: InputManager }>;
  /**
   * True when the game draws the question itself (answer-as-action). The host
   * then suppresses its own question card and only scores what the game reports.
   */
  readonly presentsOwnQuestions?: boolean;
  /**
   * How the game occupies the screen.
   *
   * `fullscreen` — the canvas fills the viewport and the HUD floats over it.
   * `page` — the canvas is a BAND inside a normal page, with the question
   *   rendered as real DOM beneath it. This is the better layout for a
   *   learning game: the animation is a reward strip, and the question gets
   *   proper typography, selectable text and real focus handling instead of
   *   being drawn into a canvas.
   */
  readonly layout?: "fullscreen" | "page";
}

/**
 * A lazily-imported game. Games pull in three.js and their own geometry, so
 * they must never be in the initial bundle — a student reading a chapter
 * brief should not download a renderer.
 */
export interface GameEntry {
  id: GameId;
  name: string;
  tagline: string;
  /** Subjects this game genuinely suits, for the chooser. */
  subjects: string[];
  load: () => Promise<GameModule<never>>;
}
