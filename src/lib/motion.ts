/**
 * Motion presets, expressed the way Apple does: a damping ratio and a
 * response (seconds). In Motion, `bounce` ≈ 1 − damping and `duration` ≈ response.
 *
 * Default to critically damped springs (no overshoot). Add bounce only when
 * the user's gesture carried momentum (a flick or a drag release).
 */
import type { Transition } from "motion/react";

export const spring = {
  /** Default UI motion: damping 1.0, response 0.4 */
  default: { type: "spring", bounce: 0, duration: 0.4 } satisfies Transition,
  /** Small, quick state changes: damping 1.0, response 0.3 */
  snappy: { type: "spring", bounce: 0, duration: 0.3 } satisfies Transition,
  /** Sheets / drawers after a flick: damping 0.8, response 0.3 */
  momentum: { type: "spring", bounce: 0.2, duration: 0.35 } satisfies Transition,
  /** Large surfaces entering: damping 1.0, response 0.5 */
  gentle: { type: "spring", bounce: 0, duration: 0.5 } satisfies Transition,
};

/** Reduced-motion replacement: a short cross-fade, no movement. */
export const fade = { duration: 0.2, ease: "easeOut" } satisfies Transition;

/**
 * "Materialize": glass surfaces arrive with blur + scale together,
 * not as a plain opacity fade. Exit reverses along the same path.
 */
export const materialize = {
  initial: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
};
