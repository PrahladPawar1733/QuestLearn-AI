"use client";

/**
 * The game registry.
 *
 * One list, read by the chooser and by the player. Adding a game means adding
 * one entry here plus its id in `GameWorld`/`REALTIME_GAMES` — not editing a
 * hard-coded component in the quest page, which is how `city-swing` ended up
 * declared in exactly one of four places and unable to run.
 *
 * Every `load()` is a dynamic import. A game pulls in three.js and its own
 * geometry, so none of it may sit in the initial bundle: a student reading a
 * chapter brief should not be downloading a renderer.
 */
import type { GameModule } from "@/lib/game/module";
import type { GameId } from "@/lib/game/types";

/**
 * HUD shapes are heterogeneous by design — each game defines its own. The
 * host never inspects a HUD value: it receives one from the game and hands it
 * straight back to that same game's `Hud` component, so the type is opaque at
 * this layer. `GameModule<HudShape>` is invariant in its parameter, so there
 * is no sound supertype to use here; this is the one place the erasure is
 * genuinely correct.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any>;

export interface GameListing {
  id: GameId;
  name: string;
  /** One line a student reads when choosing. */
  tagline: string;
  /** Subjects this game genuinely suits. Honest — not every game fits every subject. */
  subjects: string[];
  /** How demanding the controls are. Students self-select on this. */
  intensity: "calm" | "steady" | "fast";
  /** False while a game is still being built, so it never appears half-finished. */
  ready: boolean;
  load: () => Promise<{ default: AnyGameModule }>;
}

/**
 * Only the simple, purposeful games are offered.
 *
 * Four 3D open-world games were built and then deleted: they had controls to
 * learn and answering was a pause *in* the game rather than the game itself,
 * so students could not tell what they were for. The model that works is the
 * one here — the answer IS the move.
 *
 * `ready: false` entries are hidden from the chooser. Shipping a
 * half-built game is worse than shipping fewer: a student who bounces off a
 * broken one does not come back to try the good one.
 */
export const GAME_LISTINGS: GameListing[] = [
  {
    id: "force-rush",
    name: "Force Rush",
    tagline: "Every obstacle asks one question. The right answer opens the way.",
    subjects: ["Physics", "Chemistry", "Biology", "Maths"],
    intensity: "steady",
    ready: true,
    load: () => import("./force-rush"),
  },
  {
    id: "spider-climb",
    name: "Spider Climb",
    tagline: "At every gap a question appears. Your answer picks the web anchor.",
    subjects: ["Physics", "Chemistry", "Biology", "Maths"],
    intensity: "calm",
    ready: true,
    load: () => import("./spider-climb"),
  },
];

/** Only the games a student may actually pick today. */
export function playableGames(): GameListing[] {
  return GAME_LISTINGS.filter((g) => g.ready);
}

export function gameListing(id: GameId): GameListing | undefined {
  return GAME_LISTINGS.find((g) => g.id === id);
}
