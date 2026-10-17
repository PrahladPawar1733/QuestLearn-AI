import { describe, expect, it } from "vitest";
import {
  clampRect,
  documentRectFromPixels,
  normalizeDeg,
  rectFromAspect,
  rotatedBounds,
  splitRotation,
} from "../crop";

const BOUNDS = { width: 1200, height: 900 };

describe("clampRect", () => {
  it("leaves a rect that already fits alone", () => {
    expect(clampRect({ x: 10, y: 20, width: 100, height: 50 }, BOUNDS)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("shifts a rect back inside before shrinking it", () => {
    // Dragged off the right/bottom edge: size is preserved, position is pulled in.
    expect(clampRect({ x: 1150, y: 880, width: 100, height: 50 }, BOUNDS)).toEqual({ x: 1100, y: 850, width: 100, height: 50 });
    expect(clampRect({ x: -40, y: -40, width: 100, height: 50 }, BOUNDS)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("shrinks only when the rect cannot fit at all", () => {
    expect(clampRect({ x: -100, y: -100, width: 5000, height: 5000 }, BOUNDS)).toEqual({ x: 0, y: 0, width: 1200, height: 900 });
  });

  it("never returns a zero or fractional rect", () => {
    const r = clampRect({ x: 10.4, y: 10.6, width: 0, height: -5 }, BOUNDS);
    expect(r).toEqual({ x: 10, y: 11, width: 1, height: 1 });
    expect(Number.isInteger(r.x)).toBe(true);
  });
});

describe("rectFromAspect", () => {
  it("fills the limiting axis and centres on the other", () => {
    // 1:1 in a 4:3 frame is limited by height.
    expect(rectFromAspect(BOUNDS, 1)).toEqual({ x: 150, y: 0, width: 900, height: 900 });
    // 2:1 is limited by width.
    expect(rectFromAspect(BOUNDS, 2)).toEqual({ x: 0, y: 150, width: 1200, height: 600 });
    // Matching the frame's own aspect covers it exactly.
    expect(rectFromAspect(BOUNDS, 4 / 3)).toEqual({ x: 0, y: 0, width: 1200, height: 900 });
  });

  it("honours an inset and keeps the aspect", () => {
    const r = rectFromAspect(BOUNDS, 1, 0.1);
    expect(r.width).toBe(720); // 900 * 0.8
    expect(r.height).toBe(720);
    expect(r.x).toBe((1200 - 720) / 2);
    const tall = rectFromAspect(BOUNDS, 0.7, 0.05);
    expect(tall.width / tall.height).toBeCloseTo(0.7, 2);
  });

  it("clamps an absurd inset instead of producing an empty rect", () => {
    const r = rectFromAspect(BOUNDS, 1, 5);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});

describe("rotatedBounds", () => {
  it("is identity on quarter turns and swaps on 90/270", () => {
    expect(rotatedBounds(400, 300, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedBounds(400, 300, 180)).toEqual({ width: 400, height: 300 });
    expect(rotatedBounds(400, 300, 90)).toEqual({ width: 300, height: 400 });
    expect(rotatedBounds(400, 300, 270)).toEqual({ width: 300, height: 400 });
  });

  it("grows to the bounding box on a fine rotation", () => {
    // 45 degrees: both edges become (w + h) / sqrt(2).
    const r = rotatedBounds(400, 300, 45);
    expect(r.width).toBe(Math.round(700 / Math.SQRT2));
    expect(r.height).toBe(Math.round(700 / Math.SQRT2));

    const small = rotatedBounds(400, 300, 5);
    expect(small.width).toBeGreaterThan(400);
    expect(small.height).toBeGreaterThan(300);
    // A 5 degree straighten must not blow the canvas up.
    expect(small.width).toBeLessThan(440);
  });

  it("treats negative, over-360 and non-finite angles consistently", () => {
    expect(rotatedBounds(400, 300, -90)).toEqual({ width: 300, height: 400 });
    expect(rotatedBounds(400, 300, 450)).toEqual({ width: 300, height: 400 });
    expect(rotatedBounds(400, 300, Number.NaN)).toEqual({ width: 400, height: 300 });
    expect(normalizeDeg(-10)).toBe(350);
  });
});

describe("splitRotation", () => {
  it("peels a free angle into a quarter turn plus a fine remainder", () => {
    expect(splitRotation(0)).toEqual({ rotateDeg: 0, fineDeg: 0 });
    expect(splitRotation(92)).toEqual({ rotateDeg: 90, fineDeg: 2 });
    expect(splitRotation(-3)).toMatchObject({ rotateDeg: 0 });
    expect(splitRotation(-3).fineDeg).toBeCloseTo(-3, 6);
    expect(splitRotation(358)).toEqual({ rotateDeg: 0, fineDeg: -2 });
    for (const deg of [0, 7, 44, 46, 91, 179, 181, 269, 271, 359]) {
      const s = splitRotation(deg);
      expect(Math.abs(s.fineDeg)).toBeLessThanOrEqual(45);
      expect([0, 90, 180, 270]).toContain(s.rotateDeg);
    }
  });
});

describe("documentRectFromPixels", () => {
  const pixels = (w: number, h: number, f: (x: number, y: number) => number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = f(x, y);
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    return d;
  };

  it("finds a page on a dark desk and scales back to full resolution", () => {
    const sample = pixels(200, 200, (x, y) => (x >= 40 && x < 160 && y >= 30 && y < 170 ? 235 : 30));
    const rect = documentRectFromPixels(sample, 200, 200, { width: 2000, height: 2000 });
    expect(rect).not.toBeNull();
    expect(rect?.x).toBeCloseTo(400, -2);
    expect(rect?.width).toBeCloseTo(1200, -2);
    expect(rect?.y).toBeCloseTo(300, -2);
  });

  it("returns null rather than guessing", () => {
    const full = { width: 2000, height: 2000 };
    // Flat frame: no page/background split at all.
    expect(documentRectFromPixels(pixels(200, 200, () => 180), 200, 200, full)).toBeNull();
    // Gradient: bimodal enough to threshold, but there is no page edge.
    expect(documentRectFromPixels(pixels(200, 200, (x) => x), 200, 200, full)).toBeNull();
    // Page already fills the frame, so cropping could only cut content.
    expect(documentRectFromPixels(pixels(200, 200, (x, y) => (x > 2 && y > 2 ? 240 : 20)), 200, 200, full)).toBeNull();
    // A small bright object is far more likely a highlight than a page.
    expect(documentRectFromPixels(pixels(200, 200, (x, y) => (x > 90 && x < 110 && y > 90 && y < 110 ? 250 : 30)), 200, 200, full)).toBeNull();
  });

  it("keeps the result inside the image", () => {
    const sample = pixels(200, 200, (x, y) => (x >= 5 && x < 195 && y >= 5 && y < 195 ? 235 : 30));
    const rect = documentRectFromPixels(sample, 200, 200, { width: 800, height: 600 });
    if (rect) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(800);
      expect(rect.y + rect.height).toBeLessThanOrEqual(600);
    }
  });
});
