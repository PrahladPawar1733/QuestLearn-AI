"use client";

/**
 * Multimodal feedback, used only for meaningful commits (utility), fired on
 * the same frame as the visual change (harmony), and only for the student's
 * own action (causality). Uses the Vibration API where supported (Android);
 * a silent no-op elsewhere.
 */
type Kind = "success" | "error" | "selection" | "complete";

const PATTERNS: Record<Kind, number | number[]> = {
  selection: 8,
  success: [14, 40, 22],
  error: [30, 50, 30],
  complete: [18, 60, 18, 60, 30],
};

export function haptic(kind: Kind) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}
