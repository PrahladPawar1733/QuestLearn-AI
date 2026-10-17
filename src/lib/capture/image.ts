/**
 * Decode / orient / downscale / re-encode photos in the browser before upload.
 *
 * A 12 MP phone photo is 4-6 MB of JPEG that the server immediately throws
 * away (it caps the long edge at 2400 px anyway), so doing the work on the
 * device saves the student's data and keeps us inside the upload limits.
 */
import { createSurface, type Surface, surfaceToBlob, supportsWebpEncode } from "./canvas";
import { orientationTransform, orientedSize, readOrientationFromBlob } from "./exif";
import { CAPTURE_LIMITS } from "./limits";

/** A decoded image; `ImageBitmap` and the `<img>` fallback share this shape. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  /**
   * True when the decoder already applied EXIF orientation. The `<img>`
   * fallback always does (CSS `image-orientation: from-image` is the default),
   * so re-applying it would rotate the page twice.
   */
  readonly orientationApplied: boolean;
  close(): void;
}

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  mime: string;
}

export interface NormalizeOptions {
  /** Longest edge of the result. Defaults to the server's cap so nothing is resized twice. */
  maxEdge?: number;
  /** Encoder quality 0-1. 0.88 matches the server's `jpeg({ quality: 88 })`. */
  quality?: number;
  /** Force an output type instead of preferring WebP. */
  mime?: "image/webp" | "image/jpeg";
  /** Pre-read EXIF orientation; omit to sniff it from the blob. */
  orientation?: number;
}

const DEFAULT_QUALITY = 0.88;

/**
 * Decode a Blob to a drawable raster, preferring `createImageBitmap` and
 * falling back to an object-URL `<img>` for browsers that lack it.
 */
export async function loadImageBitmap(blob: Blob): Promise<Raster> {
  if (typeof createImageBitmap === "function") {
    try {
      // "none" because we apply EXIF ourselves; browsers disagree on the default.
      const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        orientationApplied: false,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through: some Safari builds reject the options bag rather than ignore it.
    }
  }
  return loadViaImgElement(blob);
}

async function loadViaImgElement(blob: Blob): Promise<Raster> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("No image decoder available in this environment");
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = document.createElement("img");
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = url;
    });
    await img.decode?.().catch(() => undefined);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      orientationApplied: true,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Scale factor and integer target size for fitting a long edge, never upscaling. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height, scale: 1 };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/**
 * Successive canvas sizes for a stepped downscale. Drawing 4000 px straight to
 * 600 px point-samples and shreds thin handwriting strokes, so we halve while
 * more than 2x remains and let the final draw cover the rest.
 */
export function halvingPlan(from: { width: number; height: number }, to: { width: number; height: number }): { width: number; height: number }[] {
  const steps: { width: number; height: number }[] = [];
  let w = from.width;
  let h = from.height;
  // Guard the loop on both axes so a 1 px edge cannot spin forever.
  while (w >= to.width * 2 && h >= to.height * 2 && w > 2 && h > 2) {
    w = Math.max(to.width, Math.floor(w / 2));
    h = Math.max(to.height, Math.floor(h / 2));
    if (w === to.width && h === to.height) break;
    steps.push({ width: w, height: h });
  }
  steps.push({ width: to.width, height: to.height });
  return steps;
}

/** Pick the smallest output type this browser can actually produce. */
export async function preferredMime(forced?: NormalizeOptions["mime"]): Promise<"image/webp" | "image/jpeg"> {
  if (forced) return forced;
  // WebP is ~25-30% smaller than JPEG at equal quality on photographed text.
  return (await supportsWebpEncode()) ? "image/webp" : "image/jpeg";
}

/**
 * Orient, downscale and re-encode a captured photo so it is upload-ready.
 *
 * NOTE: the default output is WebP, which the server's `sniffType` does not yet
 * accept (it only knows PDF/JPEG/PNG). Pass `mime: "image/jpeg"` until the RIFF
 * magic bytes are added there.
 */
export async function normalizeImage(blob: Blob, opts: NormalizeOptions = {}): Promise<EncodedImage> {
  const maxEdge = opts.maxEdge ?? CAPTURE_LIMITS.maxImageEdge;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const mime = await preferredMime(opts.mime);
  const raster = await loadImageBitmap(blob);
  try {
    const orientation = raster.orientationApplied
      ? 1
      : (opts.orientation ?? (await readOrientationFromBlob(blob)));
    const oriented = drawOriented(raster, orientation);
    const target = fitWithin(oriented.width, oriented.height, maxEdge);
    const final = steppedDownscale(oriented, target);
    const out = await surfaceToBlob(final, mime, quality);
    return { blob: out, width: final.width, height: final.height, bytes: out.size, mime: out.type || mime };
  } finally {
    raster.close();
  }
}

/** Draw a raster into a new surface with its EXIF rotation baked in. */
export function drawOriented(raster: Raster, orientation: number): Surface {
  const t = orientationTransform(orientation);
  const size = orientedSize(raster.width, raster.height, orientation);
  const surface = createSurface(size.width, size.height);
  const [a, b, c, d, e, f] = t.matrix(raster.width, raster.height);
  surface.ctx.setTransform(a, b, c, d, e, f);
  surface.ctx.imageSmoothingEnabled = true;
  surface.ctx.imageSmoothingQuality = "high";
  surface.ctx.drawImage(raster.source, 0, 0, raster.width, raster.height);
  surface.ctx.resetTransform();
  return surface;
}

function steppedDownscale(from: Surface, to: { width: number; height: number }): Surface {
  if (from.width === to.width && from.height === to.height) return from;
  let current = from;
  for (const step of halvingPlan(from, to)) {
    const next = createSurface(step.width, step.height);
    next.ctx.imageSmoothingEnabled = true;
    next.ctx.imageSmoothingQuality = "high";
    next.ctx.drawImage(current.canvas, 0, 0, step.width, step.height);
    current = next;
  }
  return current;
}

export interface BudgetProbe {
  (quality: number, scale: number): Promise<{ blob: Blob; width: number; height: number }>;
}

export interface BudgetResult extends EncodedImage {
  /** Encoder quality that produced this result. */
  quality: number;
  /** Dimension scale applied relative to the input, 1 when untouched. */
  scale: number;
  probes: number;
  withinBudget: boolean;
}

export interface BudgetOptions {
  minQuality?: number;
  maxQuality?: number;
  /** Hard ceiling on encode attempts; the search is bounded even in the worst case. */
  maxProbes?: number;
  /** Dimension multipliers tried in order once quality alone cannot fit. */
  scaleLadder?: readonly number[];
  /** Bisection steps used to recover quality after a successful low-quality probe. */
  refineSteps?: number;
}

const DEFAULT_SCALE_LADDER = [1, 0.75, 0.56, 0.42, 0.32, 0.24] as const;

/**
 * Byte-budget search over an injected encoder. Split out from
 * `compressToBudget` so the termination guarantees are testable without a DOM.
 *
 * Shape: for each dimension step, probe the best quality, then the worst; if
 * even the worst does not fit, dropping quality further is hopeless, so move to
 * the next (smaller) dimension step. Probe count is bounded by `maxProbes`.
 */
export async function searchByteBudget(probe: BudgetProbe, maxBytes: number, opts: BudgetOptions = {}): Promise<BudgetResult> {
  const minQuality = opts.minQuality ?? 0.35;
  const maxQuality = opts.maxQuality ?? 0.9;
  const maxProbes = Math.max(1, opts.maxProbes ?? 20);
  const refineSteps = Math.max(0, opts.refineSteps ?? 4);
  const ladder = opts.scaleLadder ?? DEFAULT_SCALE_LADDER;

  let probes = 0;
  let smallest: BudgetResult | null = null;

  const attempt = async (quality: number, scale: number): Promise<BudgetResult> => {
    probes++;
    const r = await probe(quality, scale);
    const result: BudgetResult = {
      blob: r.blob,
      width: r.width,
      height: r.height,
      bytes: r.blob.size,
      mime: r.blob.type,
      quality,
      scale,
      probes,
      withinBudget: r.blob.size <= maxBytes,
    };
    if (!smallest || result.bytes < smallest.bytes) smallest = result;
    return result;
  };

  for (const scale of ladder) {
    if (probes >= maxProbes) break;
    const best = await attempt(maxQuality, scale);
    if (best.withinBudget) return { ...best, probes };

    if (probes >= maxProbes) break;
    const worst = await attempt(minQuality, scale);
    if (!worst.withinBudget) continue; // quality cannot close the gap at this size

    // Bisect for the highest quality that still fits: fixed step count, so bounded.
    let lo = minQuality;
    let hi = maxQuality;
    let keep = worst;
    for (let i = 0; i < refineSteps && probes < maxProbes; i++) {
      const mid = (lo + hi) / 2;
      const r = await attempt(mid, scale);
      if (r.withinBudget) {
        keep = r;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return { ...keep, probes };
  }

  // Nothing fit: hand back the smallest attempt (flagged) and let the caller
  // decide between uploading it and asking for a different photo.
  if (!smallest) throw new Error("searchByteBudget made no probes");
  // Cast because `smallest` is only ever assigned inside `attempt`, which
  // TypeScript's control-flow analysis cannot see through.
  return { ...(smallest as BudgetResult), probes };
}

/**
 * Shrink an encoded photo under a byte budget, trading quality first and
 * dimensions only as a last resort, so text stays legible as long as possible.
 */
export async function compressToBudget(
  blob: Blob,
  maxBytes: number = CAPTURE_LIMITS.maxFileBytes,
  opts: BudgetOptions & { mime?: NormalizeOptions["mime"] } = {},
): Promise<BudgetResult> {
  if (blob.size <= maxBytes) {
    // Already fits, so the blob is never decoded; 0x0 means "dimensions not measured".
    return { blob, width: 0, height: 0, bytes: blob.size, mime: blob.type, quality: 1, scale: 1, probes: 0, withinBudget: true };
  }
  const mime = await preferredMime(opts.mime);
  const raster = await loadImageBitmap(blob);
  try {
    const orientation = raster.orientationApplied ? 1 : await readOrientationFromBlob(blob);
    const oriented = drawOriented(raster, orientation);
    const probe: BudgetProbe = async (quality, scale) => {
      const target = {
        width: Math.max(1, Math.round(oriented.width * scale)),
        height: Math.max(1, Math.round(oriented.height * scale)),
      };
      const surface = steppedDownscale(oriented, target);
      const out = await surfaceToBlob(surface, mime, quality);
      return { blob: out, width: surface.width, height: surface.height };
    };
    return await searchByteBudget(probe, maxBytes, opts);
  } finally {
    raster.close();
  }
}
