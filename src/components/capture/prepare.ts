/**
 * The one place a photo becomes an upload.
 *
 * Every byte that leaves the capture UI goes through here, whether it came
 * from `getUserMedia`, from `<input capture>` or from the file picker, so the
 * guarantees are stated once: EXIF rotation baked in, long edge capped at the
 * server's own limit, re-encoded under the per-file byte budget, and measured
 * for legibility. A 12 MP phone photo is 4-6 MB that the server would resize to
 * 2400 px anyway; doing it here costs the student nothing and saves the upload.
 */
import {
  CAPTURE_LIMITS,
  MIN_IMAGE_EDGE,
  assessImageQuality,
  compressToBudget,
  hasCanvasSupport,
  loadImageBitmap,
  normalizeImage,
  type ImageQuality,
} from "@/lib/capture";
import type { CapturedPage, PageSource } from "./types";

/** Collision-free row ids where available (backlog CU-17), with a fallback. */
export function pageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Filename for a processed page: keeps the student's basename, fixes the extension. */
export function pageFileName(mime: string, original?: string, index?: number): string {
  const ext = EXTENSIONS[mime] ?? "jpg";
  const stem = (original ?? "").replace(/\.[^.]+$/, "").replace(/[/\\]/g, "-").trim();
  if (stem) return `${stem.slice(0, 80)}.${ext}`;
  const n = typeof index === "number" ? String(index + 1).padStart(2, "0") : "01";
  return `page-${n}.${ext}`;
}

/**
 * Measure legibility. Separate from the normalize step and individually
 * fallible: a failed measurement must never cost the student their photo, so it
 * returns null rather than throwing, and the UI says "not checked" instead of
 * inventing a verdict.
 */
export async function assessBlob(blob: Blob): Promise<ImageQuality | null> {
  try {
    const raster = await loadImageBitmap(blob);
    try {
      return assessImageQuality(raster);
    } finally {
      raster.close();
    }
  } catch {
    return null;
  }
}

/**
 * Whether a picked file looks like an iPhone HEIC photo.
 *
 * This matters because HEIC decoding is split down the middle: Safari on Apple
 * platforms hands HEIC to the system decoder, so `createImageBitmap` works and
 * `preparePage` re-encodes the photo to WebP/JPEG before upload — the student
 * never learns the format was a problem. Chrome, Firefox and every Android
 * browser cannot decode it at all, and the server cannot either (its libvips
 * has no HEVC decoder), so the upload would be refused. Detecting it here lets
 * the UI say what to change instead of waiting for a 415.
 *
 * Name- and type-based on purpose: this runs before any decode, and a picked
 * file's bytes are not read until we try.
 */
export function isLikelyHeic(file: File): boolean {
  if (/^image\/(heic|heif)/i.test(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

export interface PrepareOptions {
  /** Original filename, when there was one. */
  name?: string;
  source?: PageSource;
  /** Position in the batch, used only to name unnamed camera shots. */
  index?: number;
  /** Skip the quality check (the camera sheet has already measured this frame). */
  quality?: ImageQuality | null;
  /** Force an output type; defaults to the smallest this browser can encode. */
  mime?: "image/webp" | "image/jpeg";
}

/**
 * Normalize, fit to the byte budget and measure one image.
 *
 * Throws only when the image cannot be decoded at all; callers that have a
 * usable original `File` should fall back to it rather than dropping the page
 * (see `prepareFileOrKeep`).
 */
export async function preparePage(input: Blob, opts: PrepareOptions = {}): Promise<CapturedPage> {
  const normalized = await normalizeImage(input, { mime: opts.mime });
  let blob = normalized.blob;
  let width = normalized.width;
  let height = normalized.height;
  let overBudget = false;

  if (blob.size > CAPTURE_LIMITS.maxFileBytes) {
    // Quality first, dimensions only as a last resort, so text stays legible.
    const fitted = await compressToBudget(blob, CAPTURE_LIMITS.maxFileBytes, { mime: opts.mime });
    blob = fitted.blob;
    // `compressToBudget` reports 0x0 when it did not need to decode anything.
    if (fitted.width > 0 && fitted.height > 0) {
      width = fitted.width;
      height = fitted.height;
    }
    overBudget = !fitted.withinBudget;
  }

  const mime = blob.type || normalized.mime;
  const quality = opts.quality !== undefined ? opts.quality : await assessBlob(blob);
  const file = new File([blob], pageFileName(mime, opts.name, opts.index), { type: mime });
  return {
    id: pageId(),
    file,
    url: URL.createObjectURL(file),
    width,
    height,
    bytes: file.size,
    quality,
    kept: false,
    source: opts.source ?? "camera",
    overBudget,
    tooSmall: Math.min(width, height) > 0 && Math.min(width, height) < MIN_IMAGE_EDGE,
  };
}

/**
 * Prepare a picked `File`, falling back to the original bytes when this browser
 * cannot rasterise (no `OffscreenCanvas`, no `<canvas>`, an undecodable codec).
 * Returns `null` only when the original is itself unusable — i.e. too big to
 * upload and impossible to shrink — because that is the one case where handing
 * the file through would just produce a 413 later.
 */
export async function prepareFileOrKeep(file: File, opts: PrepareOptions = {}): Promise<{ page: CapturedPage; processed: boolean } | null> {
  if (hasCanvasSupport()) {
    try {
      return { page: await preparePage(file, { ...opts, name: file.name }), processed: true };
    } catch {
      // Fall through: an undecodable image may still be something the server
      // (which has sharp, and more codecs) can read.
    }
  }
  if (file.size > CAPTURE_LIMITS.maxFileBytes) return null;
  return {
    page: {
      id: pageId(),
      file,
      url: URL.createObjectURL(file),
      width: 0,
      height: 0,
      bytes: file.size,
      quality: null,
      kept: false,
      source: opts.source ?? "file",
      overBudget: false,
      tooSmall: false,
    },
    processed: false,
  };
}
