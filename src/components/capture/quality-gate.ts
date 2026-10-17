/**
 * The quality gate: what the UI does with an `ImageQuality` verdict.
 *
 * POLICY — warn, never block.
 *
 * `assessImageQuality` is a cheap proxy for "can the model read this", not an
 * oracle. It measures a Laplacian variance and a mean luminance, so it is wrong
 * in both directions on real student material: a photo of a whiteboard, a
 * screen, or a page of sparse pencil working can score "blurry" while being
 * perfectly legible, and a phone that focused on the desk instead of the page
 * can score "good". Refusing the only photo a student has of tonight's
 * homework because of a number like that is a worse failure than a weak quest.
 *
 * So every verdict is a warning with a fix attached, the retake is made the
 * obvious primary action on a bad frame, and "Keep anyway" is always there.
 * `canKeep` is deliberately a constant `true` rather than a condition: it
 * documents that nothing in this file may ever become a hard block. The real
 * backstop is the server pipeline, which still refuses unreadable material
 * after transcription (`UNREADABLE`), and that refusal at least comes with the
 * model's own reading of the page instead of a guess from 65k pixels.
 *
 * Pure on purpose — no React, no canvas — so the policy is unit-tested.
 */
import { MIN_SEPARABILITY, QUALITY_THRESHOLDS, type ImageQuality, type QualityVerdict } from "@/lib/capture";

/**
 * - `ok`: upload it.
 * - `warn`: usable, but there is an easy improvement; shown, not blocking.
 * - `poor`: we expect the model to struggle; retake is the primary action.
 * - `unknown`: the check could not run (no canvas in this browser). Never
 *   presented as a problem, because we have no evidence of one.
 */
export type GateSeverity = "ok" | "warn" | "poor" | "unknown";

export type GateTone = "neutral" | "success" | "amber" | "danger";

export interface QualityGate {
  severity: GateSeverity;
  verdict: QualityVerdict | null;
  /** Two or three words, for a thumbnail badge. */
  badge: string;
  /** One line naming what is wrong. */
  headline: string;
  /** The fix, in the student's words — taken from the pipeline's own `advice`. */
  advice: string;
  /** True when the UI should stop and ask before accepting the shot. */
  needsDecision: boolean;
  /** Always true. See the policy note at the top of this file. */
  canKeep: true;
  tone: GateTone;
}

const HEADLINES: Record<QualityVerdict, string> = {
  good: "Looks good",
  soft: "Slightly soft",
  blurry: "Too blurry to read",
  dark: "Too dark to read",
  bright: "Washed out by light",
  "low-contrast": "Can't make out any writing",
};

const BADGES: Record<QualityVerdict, string> = {
  good: "Clear",
  soft: "A bit soft",
  blurry: "Blurry",
  dark: "Dark",
  bright: "Too bright",
  "low-contrast": "No detail",
};

const POOR: ReadonlySet<QualityVerdict> = new Set<QualityVerdict>(["blurry", "dark", "bright", "low-contrast"]);

/** True when a "good" frame still has a highlight eating part of the page. */
export function hasGlare(q: ImageQuality): boolean {
  return q.glareFraction > QUALITY_THRESHOLDS.glareFraction;
}

/**
 * True when the page is a small island in the frame — only trusted when the
 * page/background split was clean enough to believe the measurement.
 */
export function isFarAway(q: ImageQuality): boolean {
  return q.coverageConfidence >= MIN_SEPARABILITY && q.coverage < QUALITY_THRESHOLDS.minCoverage;
}

/** Decide what the UI shows for one assessed frame. `null` means "not measured". */
export function gateFor(q: ImageQuality | null | undefined): QualityGate {
  if (!q) {
    return {
      severity: "unknown",
      verdict: null,
      badge: "Not checked",
      headline: "We couldn't check this photo",
      // No canvas means no measurement, which is our problem and not the
      // student's, so this says nothing about the photo itself.
      advice: "This browser can't check photo quality, so give it a look yourself before uploading.",
      needsDecision: false,
      canKeep: true,
      tone: "neutral",
    };
  }
  if (POOR.has(q.verdict)) {
    return {
      severity: "poor",
      verdict: q.verdict,
      badge: BADGES[q.verdict],
      headline: HEADLINES[q.verdict],
      advice: q.advice,
      needsDecision: true,
      canKeep: true,
      tone: "danger",
    };
  }
  if (q.verdict === "soft") {
    return {
      severity: "warn",
      verdict: "soft",
      badge: BADGES.soft,
      headline: HEADLINES.soft,
      advice: q.advice,
      needsDecision: true,
      canKeep: true,
      tone: "amber",
    };
  }
  // "good", but the pipeline may still have an improvement to offer. Glare hides
  // content outright, so it earns the same stop-and-ask as a soft frame;
  // standing too far back only costs detail, so it is a note, not a question.
  if (hasGlare(q)) {
    return {
      severity: "warn",
      verdict: "good",
      badge: "Glare",
      headline: "Glare on the page",
      advice: q.advice,
      needsDecision: true,
      canKeep: true,
      tone: "amber",
    };
  }
  if (isFarAway(q)) {
    return {
      severity: "warn",
      verdict: "good",
      badge: "Far away",
      headline: "Sharp, but the page is small in the frame",
      advice: q.advice,
      needsDecision: false,
      canKeep: true,
      tone: "amber",
    };
  }
  return {
    severity: "ok",
    verdict: "good",
    badge: BADGES.good,
    headline: HEADLINES.good,
    advice: q.advice,
    needsDecision: false,
    canKeep: true,
    tone: "success",
  };
}

const RANK: Record<GateSeverity, number> = { ok: 0, unknown: 1, warn: 2, poor: 3 };

/** Rank for sorting/comparison; higher means more worth the student's attention. */
export function severityRank(s: GateSeverity): number {
  return RANK[s];
}

/** The gate most worth surfacing out of a batch, or null for an empty batch. */
export function worstGate(gates: readonly QualityGate[]): QualityGate | null {
  return gates.reduce<QualityGate | null>((worst, g) => (worst && severityRank(worst.severity) >= severityRank(g.severity) ? worst : g), null);
}

/** How many pages in a batch we would ask about. */
export function countNeedingAttention(gates: readonly QualityGate[]): number {
  return gates.filter((g) => g.severity === "poor" || g.severity === "warn").length;
}

/**
 * One-line batch summary for the upload form, or null when every page is fine.
 * Counts, not adjectives, so the student can see whether it is worth a retake.
 */
export function qualitySummary(gates: readonly QualityGate[]): string | null {
  const poor = gates.filter((g) => g.severity === "poor").length;
  const warn = gates.filter((g) => g.severity === "warn").length;
  if (poor === 0 && warn === 0) return null;
  const total = gates.length;
  if (poor > 0) {
    return `${poor} of ${total} photo${total === 1 ? "" : "s"} may be too hard to read. Retaking ${poor === 1 ? "it" : "them"} gives you better questions.`;
  }
  return `${warn} of ${total} photo${total === 1 ? "" : "s"} could be clearer, but ${warn === 1 ? "it is" : "they are"} readable.`;
}
