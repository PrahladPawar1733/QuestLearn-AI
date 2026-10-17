import { describe, expect, it } from "vitest";
import { fitWithin, halvingPlan, searchByteBudget, type BudgetProbe } from "../image";
import { CAPTURE_LIMITS } from "../limits";

/**
 * Stand-in encoder. Size falls with quality and with the square of the
 * dimension scale, which is how real JPEG/WebP output behaves closely enough to
 * exercise the search.
 */
function fakeProbe(baseBytes: number, calls: { quality: number; scale: number }[] = []): BudgetProbe {
  return async (quality, scale) => {
    calls.push({ quality, scale });
    const bytes = Math.max(64, Math.round(baseBytes * scale * scale * (0.25 + 0.75 * quality)));
    return {
      blob: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
      width: Math.round(4000 * scale),
      height: Math.round(3000 * scale),
    };
  };
}

describe("fitWithin", () => {
  it("caps the long edge without upscaling or changing the aspect", () => {
    expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800, scale: 0.6 });
    expect(fitWithin(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400, scale: 0.6 });
    expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(fitWithin(0, 0, 2400)).toEqual({ width: 0, height: 0, scale: 1 });
  });

  it("keeps a sliver image at least one pixel tall", () => {
    const r = fitWithin(6000, 2, 2400);
    expect(r.width).toBe(2400);
    expect(r.height).toBe(1);
  });
});

describe("halvingPlan", () => {
  it("never asks the canvas for more than a 2x reduction in one step", () => {
    const from = { width: 4000, height: 3000 };
    const to = { width: 300, height: 225 };
    const plan = halvingPlan(from, to);
    let prev = from;
    for (const step of plan) {
      expect(step.width).toBeGreaterThan(0);
      expect(prev.width / step.width).toBeLessThanOrEqual(2.001);
      expect(prev.height / step.height).toBeLessThanOrEqual(2.001);
      prev = step;
    }
    expect(plan.at(-1)).toEqual(to);
  });

  it("is a single draw when less than 2x is needed", () => {
    expect(halvingPlan({ width: 4000, height: 3000 }, { width: 2400, height: 1800 })).toEqual([{ width: 2400, height: 1800 }]);
  });

  it("terminates on degenerate sizes", () => {
    expect(halvingPlan({ width: 4000, height: 1 }, { width: 1, height: 1 }).at(-1)).toEqual({ width: 1, height: 1 });
    expect(halvingPlan({ width: 1, height: 1 }, { width: 1, height: 1 })).toEqual([{ width: 1, height: 1 }]);
  });
});

describe("searchByteBudget", () => {
  it("returns the input untouched when top quality already fits", async () => {
    const calls: { quality: number; scale: number }[] = [];
    const r = await searchByteBudget(fakeProbe(1_000_000, calls), 2_000_000);
    expect(r.withinBudget).toBe(true);
    expect(r.quality).toBe(0.9);
    expect(r.scale).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("respects the budget and recovers as much quality as it can", async () => {
    // 2.8 MB at top quality, 1.5 MB at the floor, budget 2 MB: quality alone fits.
    const r = await searchByteBudget(fakeProbe(3_000_000), 2_000_000);
    expect(r.withinBudget).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(2_000_000);
    expect(r.scale).toBe(1);
    // Bisection must land above the floor rather than just shipping min quality.
    expect(r.quality).toBeGreaterThan(0.35);
  });

  it("falls back to smaller dimensions only when quality cannot close the gap", async () => {
    const r = await searchByteBudget(fakeProbe(40_000_000), CAPTURE_LIMITS.maxFileBytes);
    expect(r.withinBudget).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(CAPTURE_LIMITS.maxFileBytes);
    expect(r.scale).toBeLessThan(1);
    expect(r.width).toBeLessThan(4000);
  });

  it("terminates and reports failure on an impossible budget", async () => {
    const calls: { quality: number; scale: number }[] = [];
    const r = await searchByteBudget(fakeProbe(10_000_000, calls), 10, { maxProbes: 8 });
    expect(r.withinBudget).toBe(false);
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(r.probes).toBe(calls.length);
    // The fallback is the smallest attempt seen, not the last one.
    expect(r.bytes).toBe(Math.min(...calls.map((c) => Math.max(64, Math.round(10_000_000 * c.scale * c.scale * (0.25 + 0.75 * c.quality))))));
  });

  it("never exceeds maxProbes however hopeless the budget", async () => {
    for (const maxProbes of [1, 2, 3, 5, 13, 20]) {
      const calls: { quality: number; scale: number }[] = [];
      await searchByteBudget(fakeProbe(99_000_000, calls), 1, { maxProbes });
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.length).toBeLessThanOrEqual(maxProbes);
    }
  });

  it("walks the scale ladder in descending order", async () => {
    const calls: { quality: number; scale: number }[] = [];
    await searchByteBudget(fakeProbe(99_000_000, calls), 1, { maxProbes: 12 });
    const scales = [...new Set(calls.map((c) => c.scale))];
    expect(scales).toEqual([...scales].sort((a, b) => b - a));
  });
});
