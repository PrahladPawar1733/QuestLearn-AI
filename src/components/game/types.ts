import type { GameWorld, PublicQuestion } from "@/lib/types";

export type OptionId = "A" | "B" | "C" | "D" | "E";
export type Phase = "answering" | "submitting" | "correct" | "wrong";

/**
 * Contract every game world implements. A world is a skin over the same
 * question engine: it renders the scene and the answer options, and reacts
 * to the server-scored outcome. Worlds never decide correctness.
 */
export interface WorldProps {
  question: PublicQuestion;
  phase: Phase;
  selected: OptionId | null;
  onSelect: (id: OptionId) => void;
  /** Known only after the server has scored the answer. */
  correctOptionId?: string;
  /** Outcomes of main questions so far, used to build the world (1 question = 1 unit). */
  outcomes: ("correct" | "wrong")[];
  total: number;
  streak: number;
  isFollowUp: boolean;
  reducedMotion: boolean;
}

export interface WorldMeta {
  id: GameWorld;
  name: string;
  tagline: string;
  /** What one question builds in this world. */
  unit: string;
  accent: string; // soft tinted tile background (Tailwind classes)
  emoji: string;
}

/**
 * Playable experiences.
 *
 * Five of the original six "worlds" (Balloon Pop, Rocket Launch, Maze Escape,
 * Bubble Lab, Castle Defense) have been retired. They were not games: each
 * was an SVG scene that could only react *after* the server scored an answer,
 * their interactive layer was `aria-hidden` so it was invisible to assistive
 * tech, and every one of them had to render a duplicate option list
 * underneath — two tap targets per answer. Offering a six-way choice whose
 * own subtitle said "same questions and scoring in every world" asked
 * students to decide something that did not matter.
 *
 * What remains is a real choice: play it as a game, or read the cards.
 * The retired ids stay valid in the `GameWorld` enum so stored sessions
 * remain parseable and resume in Focus.
 */
export const WORLDS: WorldMeta[] = [
  {
    id: "classic",
    name: "Focus",
    tagline: "Just the question, the diagram and your answer. No distractions.",
    unit: "Best for revision and low-end devices",
    accent: "bg-tint/12",
    emoji: "",
  },
];

/** Names for retired worlds, so old sessions still render a sensible label. */
const RETIRED_WORLD_META: WorldMeta[] = (
  [
    ["balloons", "Balloon Pop"],
    ["rocket", "Rocket Launch"],
    ["maze", "Maze Escape"],
    ["bubbles", "Bubble Lab"],
    ["castle", "Castle Defense"],
  ] as const
).map(([id, name]) => ({
  id: id as GameWorld,
  name,
  tagline: "Retired — this run now plays in Focus.",
  unit: "",
  accent: "bg-fill-3",
  emoji: "",
}));


/**
 * Real-time 3D games. Kept out of `WORLDS` because they are not skins over
 * the option list: they have their own player, their own loop and their own
 * art direction. The lobby features them separately for the same reason.
 */
export const REALTIME_GAME_META: WorldMeta[] = [
  {
    id: "spider-climb",
    name: "Spider Climb",
    tagline: "At every gap a question appears. Your answer picks the web anchor.",
    unit: "1 question = 1 gap",
    accent: "bg-blue/12",
    // Shown only in list rows (history, progress). The games themselves use no
    // emoji anywhere in their art.
    emoji: "\u{1F3C1}",
  },
];

/** Metadata for any experience, 2D skin or real-time game. */
export function worldMeta(id: GameWorld) {
  return (
    WORLDS.find((w) => w.id === id) ??
    REALTIME_GAME_META.find((g) => g.id === id) ??
    RETIRED_WORLD_META.find((w) => w.id === id) ??
    WORLDS[0]
  );
}
