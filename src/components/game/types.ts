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

export const WORLDS: WorldMeta[] = [
  { id: "classic", name: "Quest Arena", tagline: "Clean cards, pure focus.", unit: "1 question = 1 checkpoint", accent: "bg-tint/12", emoji: "🎯" },
  { id: "balloons", name: "Balloon Pop", tagline: "Every answer rides a balloon. Pick wisely.", unit: "1 question = 1 balloon cluster", accent: "bg-pink/12", emoji: "🎈" },
  { id: "rocket", name: "Rocket Launch", tagline: "Each right answer bolts a stage onto your rocket.", unit: "1 question = 1 rocket stage", accent: "bg-blue/12", emoji: "🚀" },
  { id: "maze", name: "Maze Escape", tagline: "Answer at each gate to light your way out.", unit: "1 question = 1 gate", accent: "bg-success-fill/12", emoji: "🧭" },
  { id: "bubbles", name: "Bubble Lab", tagline: "Answers float up in the lab tank. Catch the right one.", unit: "1 question = 1 bubble", accent: "bg-teal/14", emoji: "🫧" },
  { id: "castle", name: "Castle Defense", tagline: "Correct answers fire the cannon. Mistakes raise your shield.", unit: "1 question = 1 wave", accent: "bg-amber-fill/14", emoji: "🏰" },
];

export function worldMeta(id: GameWorld) {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}
