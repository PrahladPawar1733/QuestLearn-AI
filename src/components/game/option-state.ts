import type { OptionId, Phase } from "./types";

export type OptionVisualState = "idle" | "selected" | "correct" | "wrong" | "dimmed";

/** Shared state logic so every world shows outcomes the same way. */
export function optionState(id: string, selected: OptionId | null, phase: Phase, correctOptionId?: string): OptionVisualState {
  const settled = phase === "correct" || phase === "wrong";
  if (!settled) return selected === id ? "selected" : "idle";
  if (id === correctOptionId) return "correct";
  if (id === selected) return "wrong";
  return "dimmed";
}

export function optionAria(label: string, state: OptionVisualState) {
  const suffix = state === "correct" ? ", correct answer" : state === "wrong" ? ", your answer, incorrect" : state === "selected" ? ", selected" : "";
  return `Option ${label}${suffix}`;
}
