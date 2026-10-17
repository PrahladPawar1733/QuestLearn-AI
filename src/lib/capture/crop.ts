/**
 * Crop / rotate maths and export for the capture review screen.
 *
 * Students photograph a page at an angle on a desk, so the review step needs a
 * crop box and a straightening control. The geometry lives here, away from the
 * UI, because getting the canvas size wrong on an arbitrary rotation silently
 * clips the corners of the page.
 */
import { createSurface, surfaceToBlob } from "./canvas";
import type { Raster } from "./image";
import { preferredMime, type NormalizeOptions } from "./image";
import { estimateDocumentCoverage, toGraySample, MIN_SEPARABILITY } from "./quality";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Quarter turns; anything finer goes through `fineDeg` so the common case stays lossless. */
export type QuarterTurn = 0 | 90 | 180 | 270;

export interface CropOptions {
  /** Source region to keep. Defaults to the whole image. */
  rect?: Rect;
  rotateDeg?: QuarterTurn;
  /** Extra straightening in degrees, clamped to +/-45; combined with `rotateDeg`. */
  fineDeg?: number;
  flipH?: boolean;
  mime?: NormalizeOptions["mime"];
  quality?: number;
}

/** Keep a crop rect inside the image: shift it back if possible, shrink only if it cannot fit. */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const width = Math.max(1, Math.min(Math.round(rect.width), bounds.width));
  const height = Math.max(1, Math.min(Math.round(rect.height), bounds.height));
  const x = Math.min(Math.max(0, Math.round(rect.x)), bounds.width - width);
  const y = Math.min(Math.max(0, Math.round(rect.y)), bounds.height - height);
  return { x, y, width, height };
}

/**
 * Largest rect of the given aspect ratio (width/height) centred in `bounds`,
 * optionally inset by a fraction — the starting crop box for the UI.
 */
export function rectFromAspect(bounds: Size, aspect: number, inset = 0): Rect {
  const i = Math.min(Math.max(inset, 0), 0.49);
  const availW = bounds.width * (1 - i * 2);
  const availH = bounds.height * (1 - i * 2);
  const fitByWidth = availW / aspect <= availH;
  const width = fitByWidth ? availW : availH * aspect;
  const height = fitByWidth ? availW / aspect : availH;
  return clampRect(
    { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height },
    bounds,
  );
}

/** Bounding box of a w x h rect rotated by `deg` — the canvas size a rotation needs. */
export function rotatedBounds(width: number, height: number, deg: number): Size {
  const rad = (normalizeDeg(deg) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: Math.max(1, Math.round(width * cos + height * sin)),
    height: Math.max(1, Math.round(width * sin + height * cos)),
  };
}

/** Fold any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/** Split a free angle into the nearest quarter turn plus a +/-45 degree remainder. */
export function splitRotation(deg: number): { rotateDeg: QuarterTurn; fineDeg: number } {
  const n = normalizeDeg(deg);
  const quarter = (Math.round(n / 90) * 90) % 360;
  return { rotateDeg: quarter as QuarterTurn, fineDeg: n - Math.round(n / 90) * 90 };
}

/**
 * Crop, mirror and rotate a decoded image into an upload-ready Blob.
 * The output canvas is sized to the rotated bounding box so a straightened
 * page keeps its corners instead of being clipped.
 */
export async function cropAndRotate(raster: Pick<Raster, "width" | "height" | "source">, opts: CropOptions = {}): Promise<Blob> {
  const rect = clampRect(opts.rect ?? { x: 0, y: 0, width: raster.width, height: raster.height }, raster);
  const fine = Math.min(Math.max(opts.fineDeg ?? 0, -45), 45);
  const angle = normalizeDeg((opts.rotateDeg ?? 0) + fine);
  // Two passes: crop first (the canvas edge does the clipping), then rotate the
  // cropped tile. Rotating in one pass would pull neighbouring pixels from
  // outside the crop box into the corners of the bounding canvas.
  const cropped = createSurface(rect.width, rect.height);
  cropped.ctx.imageSmoothingEnabled = true;
  cropped.ctx.imageSmoothingQuality = "high";
  cropped.ctx.drawImage(raster.source, -rect.x, -rect.y, raster.width, raster.height);
  if (angle === 0 && !opts.flipH) {
    const mime0 = await preferredMime(opts.mime);
    return surfaceToBlob(cropped, mime0, opts.quality ?? 0.9);
  }

  const out = rotatedBounds(rect.width, rect.height, angle);
  const surface = createSurface(out.width, out.height);
  const ctx = surface.ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Rotation leaves empty triangles at the corners; white reads as paper.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  // Matrix written out rather than a translate/rotate/scale chain, so the whole
  // placement is one setTransform: origin at the output centre, rotated, then
  // mirrored on x, with the tile drawn centred on that origin.
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const mx = opts.flipH ? -1 : 1;
  ctx.setTransform(cos * mx, sin * mx, -sin, cos, out.width / 2, out.height / 2);
  ctx.drawImage(cropped.canvas, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
  ctx.resetTransform();

  const mime = await preferredMime(opts.mime);
  return surfaceToBlob(surface, mime, opts.quality ?? 0.9);
}

/**
 * Honest page-boundary guess from the brightness split, returned in full-image
 * coordinates. Returns null whenever the frame is not clearly a light page on a
 * darker background, or the box is implausible — a wrong auto-crop that eats
 * half a student's homework is much worse than no auto-crop.
 */
export function autoDocumentRect(raster: Pick<Raster, "width" | "height" | "source">): Rect | null {
  const longest = Math.max(raster.width, raster.height) || 1;
  const scale = Math.min(1, 256 / longest);
  const w = Math.max(1, Math.round(raster.width * scale));
  const h = Math.max(1, Math.round(raster.height * scale));
  const surface = createSurface(w, h);
  surface.ctx.imageSmoothingEnabled = true;
  surface.ctx.imageSmoothingQuality = "high";
  surface.ctx.drawImage(raster.source, 0, 0, w, h);
  const data = surface.ctx.getImageData(0, 0, w, h);
  return documentRectFromPixels(data.data, w, h, raster);
}

/** Pure core of `autoDocumentRect`, separated so the confidence rules are testable. */
export function documentRectFromPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  full: Size,
): Rect | null {
  const sample = toGraySample(rgba, width, height);
  const { box, confidence, coverage } = estimateDocumentCoverage(sample);
  if (!box || confidence < MIN_SEPARABILITY) return null;
  // Below 20% the "page" is more likely a bright object; above 97% there is no
  // visible border, so cropping would only shave content off the edges.
  if (coverage < 0.2 || coverage > 0.97) return null;
  const sx = full.width / sample.width;
  const sy = full.height / sample.height;
  return clampRect(
    { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy },
    full,
  );
}
