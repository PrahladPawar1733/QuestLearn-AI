import { describe, expect, it } from "vitest";
import {
  QUALITY_THRESHOLDS,
  assessPixels,
  estimateDocumentCoverage,
  laplacianVariance,
  otsuThreshold,
  toGraySample,
} from "../quality";

const W = 512;
const H = 512;

/** Grayscale RGBA from a pixel function — all the fixtures are achromatic. */
function gray(w: number, h: number, f: (x: number, y: number) => number): Uint8ClampedArray {
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
}

const checker = (block: number, lo = 0, hi = 255) =>
  gray(W, H, (x, y) => ((Math.floor(x / block) + Math.floor(y / block)) % 2 ? hi : lo));

/** Box blur, standing in for a defocused capture. */
function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          sum += src[(sy * w + sx) * 4];
          n++;
        }
      }
      const i = (y * w + x) * 4;
      const v = sum / n;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe("toGraySample", () => {
  it("box-averages down to the analysis size and converts with Rec.709 weights", () => {
    const s = toGraySample(gray(1024, 512, () => 100), 1024, 512);
    expect(s.width).toBe(256);
    expect(s.height).toBe(128);
    expect(s.gray[0]).toBeCloseTo(100, 4);

    const green = new Uint8ClampedArray([0, 255, 0, 255]);
    expect(toGraySample(green, 1, 1).gray[0]).toBeCloseTo(0.7152 * 255, 3);
  });

  it("averages rather than point-samples, so fine detail becomes flat mid-grey", () => {
    // A 1 px checkerboard carries no real detail at analysis scale; point
    // sampling would keep a fake full-contrast edge instead of averaging it out.
    const s = toGraySample(checker(1), W, H);
    expect(laplacianVariance(s)).toBeLessThan(1);
    expect(s.gray[0]).toBeCloseTo(127.5, 0);
  });
});

describe("laplacianVariance", () => {
  it("ranks sharp far above blurred, and blurred above flat", () => {
    const sharp = laplacianVariance(toGraySample(checker(16), W, H));
    const blurred = laplacianVariance(toGraySample(boxBlur(checker(16), W, H, 6), W, H));
    const flat = laplacianVariance(toGraySample(gray(W, H, () => 128), W, H));

    expect(flat).toBe(0);
    expect(sharp).toBeGreaterThan(blurred * 50);
    expect(blurred).toBeGreaterThan(flat);
    expect(sharp).toBeGreaterThan(QUALITY_THRESHOLDS.softVariance);
  });

  it("is zero on buffers too small to hold the kernel", () => {
    expect(laplacianVariance({ gray: new Float32Array(4), width: 2, height: 2 })).toBe(0);
  });
});

describe("assessPixels verdicts", () => {
  it("passes a sharp, well-exposed page", () => {
    // Dark glyph-ish marks on bright paper.
    const page = gray(W, H, (x, y) => (Math.floor(y / 12) % 2 === 0 && x % 7 < 3 ? 30 : 230));
    const q = assessPixels(page, W, H);
    expect(q.verdict).toBe("good");
    expect(q.blurScore).toBeGreaterThan(QUALITY_THRESHOLDS.softVariance);
    expect(q.luminance).toBeGreaterThan(QUALITY_THRESHOLDS.darkLuminance);
    expect(q.advice).toMatch(/good/i);
  });

  it("classifies a dark frame as dark, not blurry", () => {
    const q = assessPixels(checker(16, 0, 50), W, H);
    expect(q.luminance).toBeLessThan(QUALITY_THRESHOLDS.darkLuminance);
    expect(q.verdict).toBe("dark");
    expect(q.advice).toMatch(/light|torch/i);

    // Even a featureless dark frame must not be reported as a focus problem.
    expect(assessPixels(gray(W, H, () => 20), W, H).verdict).toBe("dark");
  });

  it("classifies a blown-out frame as bright and reports clipped pixels", () => {
    const q = assessPixels(gray(W, H, () => 250), W, H);
    expect(q.verdict).toBe("bright");
    expect(q.glareFraction).toBe(1);
  });

  it("classifies a signal-free frame as low-contrast rather than blurry", () => {
    const q = assessPixels(gray(W, H, () => 150), W, H);
    expect(q.blurScore).toBe(0);
    expect(q.contrast).toBe(0);
    expect(q.verdict).toBe("low-contrast");
  });

  it("classifies a sharp but washed-out page as low-contrast", () => {
    const q = assessPixels(checker(8, 140, 160), W, H);
    expect(q.blurScore).toBeGreaterThan(QUALITY_THRESHOLDS.blurryVariance);
    expect(q.contrast).toBeLessThan(QUALITY_THRESHOLDS.minContrast);
    expect(q.verdict).toBe("low-contrast");
  });

  it("flags glare on an otherwise good frame", () => {
    const q = assessPixels(checker(16), W, H);
    expect(q.verdict).toBe("good");
    expect(q.glareFraction).toBeGreaterThan(QUALITY_THRESHOLDS.glareFraction);
    expect(q.advice).toMatch(/glare/i);
  });

  it("reports metrics in their documented ranges", () => {
    for (const fixture of [checker(16), boxBlur(checker(16), W, H, 4), gray(W, H, () => 90)]) {
      const q = assessPixels(fixture, W, H);
      expect(q.luminance).toBeGreaterThanOrEqual(0);
      expect(q.luminance).toBeLessThanOrEqual(255);
      expect(q.contrast).toBeGreaterThanOrEqual(0);
      expect(q.contrast).toBeLessThanOrEqual(1);
      expect(q.glareFraction).toBeGreaterThanOrEqual(0);
      expect(q.glareFraction).toBeLessThanOrEqual(1);
      expect(q.advice.length).toBeGreaterThan(10);
      expect(q.advice.length).toBeLessThan(120);
    }
  });
});

describe("otsuThreshold and coverage", () => {
  it("splits a two-tone frame at the midpoint with high separability", () => {
    const sample = toGraySample(gray(256, 256, (x) => (x < 128 ? 40 : 220)), 256, 256);
    const { threshold, separability } = otsuThreshold(sample);
    // The threshold is the top of the dark class; the masks use `gray > threshold`.
    expect(threshold).toBeGreaterThanOrEqual(40);
    expect(threshold).toBeLessThan(220);
    expect(separability).toBeGreaterThan(0.9);
  });

  it("reports no confidence on a flat frame", () => {
    const sample = toGraySample(gray(256, 256, () => 128), 256, 256);
    expect(otsuThreshold(sample).separability).toBe(0);
    expect(estimateDocumentCoverage(sample).box).toBeNull();
  });

  it("boxes a bright page on a dark desk", () => {
    const page = gray(256, 256, (x, y) => (x >= 40 && x < 200 && y >= 48 && y < 208 ? 230 : 35));
    const cov = estimateDocumentCoverage(toGraySample(page, 256, 256));
    expect(cov.box).not.toBeNull();
    expect(cov.box?.x).toBeCloseTo(40, -1);
    expect(cov.box?.width).toBeCloseTo(160, -1);
    expect(cov.coverage).toBeCloseTo((160 * 160) / (256 * 256), 1);
    expect(cov.confidence).toBeGreaterThan(0.9);
  });

  it("refuses to guess when the page fills everything", () => {
    const cov = estimateDocumentCoverage(toGraySample(gray(256, 256, () => 235), 256, 256));
    expect(cov.box).toBeNull();
  });
});
