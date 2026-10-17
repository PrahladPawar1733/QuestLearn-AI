/**
 * Real image-quality metrics for the capture preview.
 *
 * The OCR/AI step cannot recover a blurred or under-exposed page, so it is far
 * cheaper to measure the frame on the device and ask the student to retake it
 * than to burn a model call and hand back "I couldn't read your notes".
 * Everything here is pure maths over pixel data; `assessImageQuality` is the
 * only part that touches a canvas.
 */
import type { Raster } from "./image";
import { createSurface } from "./canvas";

/**
 * Analysis resolution. Fixed on purpose: the Laplacian variance of an image
 * scales with its sampling rate, so thresholds are only comparable between
 * photos if every photo is measured at the same size. 256 px is enough for the
 * edge energy of body text to survive while keeping the pass under ~65k pixels.
 */
export const ANALYSIS_EDGE = 256;

/**
 * Thresholds, all evaluated at ANALYSIS_EDGE on 0-255 luminance.
 *
 * blur (variance of the Laplacian): the metric scales with local contrast and
 *   edge density, so the useful band depends on the subject. Synthetic
 *   hard-edged patterns run to 1e4-1e5; a photographed page of pencil writing
 *   has roughly a tenth of that local contrast and far sparser edges, which
 *   puts a sharp capture in the high hundreds to low thousands and a visibly
 *   smeared one under ~50. 40 is set just above that floor so only genuinely
 *   unreadable frames are blocked, and 120 marks the "readable but soft" band
 *   that earns a nudge rather than a retake. This pair is the one number here
 *   that wants re-calibrating against real student captures.
 * luminance: correctly exposed white paper sits at 140-205 mean. Under 70 the
 *   shadows are crushed and pencil disappears into sensor noise; over 215 the
 *   paper is clipping and the ink is losing contrast with it.
 * contrast: RMS contrast (sd/255) of a text page is 0.15-0.30, and stays over
 *   0.10 even when badly out of focus. Under 0.08 the frame is fogged, shot
 *   through glare, or simply not pointed at a page.
 * glare: pixels at or over 247 are effectively clipped. A few percent is normal
 *   on glossy paper; over 3% of the frame means a highlight is eating content.
 */
export const QUALITY_THRESHOLDS = {
  blurryVariance: 40,
  softVariance: 120,
  darkLuminance: 70,
  brightLuminance: 215,
  minContrast: 0.08,
  glareLevel: 247,
  glareFraction: 0.03,
  /** Below this the page is a small island in the frame and detail per character suffers. */
  minCoverage: 0.45,
} as const;

export type QualityVerdict = "good" | "soft" | "blurry" | "dark" | "bright" | "low-contrast";

export interface ImageQuality {
  /** Variance of the Laplacian: higher is sharper. */
  blurScore: number;
  /** Mean Rec.709 luminance, 0-255. */
  luminance: number;
  /** RMS contrast, 0-1 (standard deviation of luminance over 255). */
  contrast: number;
  /** Fraction of pixels at or above the clipping level. */
  glareFraction: number;
  /** Rough fraction of the frame the page fills; see `estimateDocumentCoverage`. */
  coverage: number;
  /** How cleanly the frame splits into page vs background, 0-1. Low means don't trust `coverage`. */
  coverageConfidence: number;
  verdict: QualityVerdict;
  /** One short, student-facing instruction. */
  advice: string;
}

export interface GraySample {
  gray: Float32Array;
  width: number;
  height: number;
}

/**
 * Box-average RGBA down to a grayscale buffer no longer than `maxEdge`.
 * Box averaging (not point sampling) keeps the blur metric honest: nearest
 * neighbour would alias fine texture into fake high-frequency detail.
 */
export function toGraySample(rgba: Uint8ClampedArray, width: number, height: number, maxEdge = ANALYSIS_EDGE): GraySample {
  const longest = Math.max(width, height);
  const factor = longest > maxEdge ? Math.ceil(longest / maxEdge) : 1;
  const outW = Math.max(1, Math.floor(width / factor));
  const outH = Math.max(1, Math.floor(height / factor));
  const gray = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy++) {
        const sy = y * factor + dy;
        if (sy >= height) break;
        for (let dx = 0; dx < factor; dx++) {
          const sx = x * factor + dx;
          if (sx >= width) break;
          const i = (sy * width + sx) * 4;
          sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
          n++;
        }
      }
      gray[y * outW + x] = n > 0 ? sum / n : 0;
    }
  }
  return { gray, width: outW, height: outH };
}

/** Variance of the 4-neighbour Laplacian — the standard cheap focus measure. */
export function laplacianVariance(sample: GraySample): number {
  const { gray, width, height } = sample;
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += l;
      sumSq += l * l;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/** Otsu's threshold plus its separability, used for the page/background split. */
export function otsuThreshold(sample: GraySample): { threshold: number; separability: number } {
  const hist = new Uint32Array(256);
  for (let i = 0; i < sample.gray.length; i++) {
    hist[Math.min(255, Math.max(0, Math.round(sample.gray[i])))]++;
  }
  const total = sample.gray.length;
  if (total === 0) return { threshold: 128, separability: 0 };

  let totalMean = 0;
  for (let v = 0; v < 256; v++) totalMean += v * hist[v];
  totalMean /= total;

  let totalVar = 0;
  for (let v = 0; v < 256; v++) totalVar += hist[v] * (v - totalMean) ** 2;
  totalVar /= total;

  let wB = 0;
  let sumB = 0;
  let best = 0;
  let threshold = 128;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (totalMean * total - sumB) / wF;
    const between = (wB / total) * (wF / total) * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return { threshold, separability: totalVar > 0 ? best / totalVar : 0 };
}

export interface CoverageEstimate {
  /** Fraction of the frame the page fills. Only meaningful when `confidence` is high. */
  coverage: number;
  /** Bounding box of the page region in sample coordinates, or null when unsure. */
  box: { x: number; y: number; width: number; height: number } | null;
  /** Otsu separability: how bimodal the frame is, 0-1. */
  confidence: number;
}

/** Minimum separability before we believe a page/background split exists at all. */
export const MIN_SEPARABILITY = 0.55;

/**
 * Rough page coverage: assume the paper is the brighter Otsu class and take the
 * bounding box of rows/columns that are mostly paper. Deliberately crude — it
 * reports its own confidence instead of pretending to do document detection.
 */
export function estimateDocumentCoverage(sample: GraySample): CoverageEstimate {
  const { gray, width, height } = sample;
  const { threshold, separability } = otsuThreshold(sample);
  if (width < 8 || height < 8) return { coverage: 0, box: null, confidence: 0 };

  const rows = new Float32Array(height);
  const cols = new Float32Array(width);
  let bright = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] > threshold) {
        rows[y]++;
        cols[x]++;
        bright++;
      }
    }
  }
  const brightFraction = bright / (width * height);
  if (separability < MIN_SEPARABILITY || brightFraction < 0.12 || brightFraction > 0.985) {
    return { coverage: brightFraction, box: null, confidence: separability };
  }

  // A row belongs to the page when more than half of it is paper.
  const span = (profile: Float32Array, length: number, limit: number) => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < length; i++) {
      if (profile[i] > limit * 0.5) {
        if (first < 0) first = i;
        last = i;
      }
    }
    return { first, last };
  };
  const v = span(rows, height, width);
  const h = span(cols, width, height);
  if (v.first < 0 || h.first < 0) return { coverage: brightFraction, box: null, confidence: separability };

  const box = { x: h.first, y: v.first, width: h.last - h.first + 1, height: v.last - v.first + 1 };
  return { coverage: (box.width * box.height) / (width * height), box, confidence: separability };
}

/**
 * Score a frame from raw RGBA. Pure, so it runs in a Worker or a unit test.
 */
export function assessPixels(rgba: Uint8ClampedArray, width: number, height: number): ImageQuality {
  const sample = toGraySample(rgba, width, height);
  const blurScore = laplacianVariance(sample);

  let sum = 0;
  let sumSq = 0;
  let clipped = 0;
  const n = sample.gray.length || 1;
  for (let i = 0; i < sample.gray.length; i++) {
    const g = sample.gray[i];
    sum += g;
    sumSq += g * g;
    if (g >= QUALITY_THRESHOLDS.glareLevel) clipped++;
  }
  const luminance = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - luminance * luminance)) / 255;
  const glareFraction = clipped / n;
  const cov = estimateDocumentCoverage(sample);

  const verdict = decideVerdict({ blurScore, luminance, contrast });
  return {
    blurScore,
    luminance,
    contrast,
    glareFraction,
    coverage: cov.coverage,
    coverageConfidence: cov.confidence,
    verdict,
    advice: adviceFor(verdict, { glareFraction, coverage: cov.coverage, coverageConfidence: cov.confidence }),
  };
}

/**
 * Order matters, and it is not the order of severity.
 *
 * Exposure comes first: in a crushed or clipped frame there is no signal for
 * the Laplacian to measure, so a dark photo would otherwise always be reported
 * as "blurry" and send the student chasing focus. Contrast comes next for the
 * same reason — a frame with no tonal variation (a wall, a lens cap, heavy fog)
 * scores a blur variance of ~0 while being perfectly in focus, whereas a truly
 * out-of-focus page still keeps RMS contrast above the threshold. Only once
 * there is measurable signal does the focus verdict mean anything.
 */
function decideVerdict(m: { blurScore: number; luminance: number; contrast: number }): QualityVerdict {
  if (m.luminance < QUALITY_THRESHOLDS.darkLuminance) return "dark";
  if (m.luminance > QUALITY_THRESHOLDS.brightLuminance) return "bright";
  if (m.contrast < QUALITY_THRESHOLDS.minContrast) return "low-contrast";
  if (m.blurScore < QUALITY_THRESHOLDS.blurryVariance) return "blurry";
  if (m.blurScore < QUALITY_THRESHOLDS.softVariance) return "soft";
  return "good";
}

function adviceFor(
  verdict: QualityVerdict,
  extra: { glareFraction: number; coverage: number; coverageConfidence: number },
): string {
  switch (verdict) {
    case "blurry":
      return "Too blurry to read. Hold steadier and tap to focus.";
    case "soft":
      return "Almost there — hold still for a second and tap to focus.";
    case "dark":
      return "Too dark. Move into better light or turn the torch on.";
    case "bright":
      return "Too bright. Move the page out of direct light.";
    case "low-contrast":
      return "Not much to read here. Fill the frame with the page and use even light.";
    case "good":
      if (extra.glareFraction > QUALITY_THRESHOLDS.glareFraction) {
        return "Shiny spot on the page — tilt it slightly to kill the glare.";
      }
      if (extra.coverageConfidence >= MIN_SEPARABILITY && extra.coverage < QUALITY_THRESHOLDS.minCoverage) {
        return "Looks sharp — move a little closer so the page fills the frame.";
      }
      return "Looks good. Go ahead and capture.";
  }
}

/** Draw a decoded image at analysis size and score it. Thin canvas wrapper over `assessPixels`. */
export function assessImageQuality(raster: Pick<Raster, "width" | "height" | "source">): ImageQuality {
  const longest = Math.max(raster.width, raster.height) || 1;
  const scale = Math.min(1, ANALYSIS_EDGE / longest);
  const w = Math.max(1, Math.round(raster.width * scale));
  const h = Math.max(1, Math.round(raster.height * scale));
  const surface = createSurface(w, h);
  surface.ctx.imageSmoothingEnabled = true;
  surface.ctx.imageSmoothingQuality = "high";
  surface.ctx.drawImage(raster.source, 0, 0, w, h);
  const data = surface.ctx.getImageData(0, 0, w, h);
  return assessPixels(data.data, w, h);
}
