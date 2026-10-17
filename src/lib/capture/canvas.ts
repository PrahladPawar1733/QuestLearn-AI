/**
 * Canvas plumbing shared by the capture pipeline.
 *
 * Everything prefers `OffscreenCanvas` so the whole pipeline can be moved into
 * a Worker later without touching the call sites; a detached `<canvas>` is the
 * fallback for Safari versions without `convertToBlob`.
 */

/** The subset of the 2D context both canvas flavours implement identically. */
export interface Ctx2D {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  globalAlpha: number;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  resetTransform(): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

export interface Surface {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly ctx: Ctx2D;
  readonly width: number;
  readonly height: number;
}

/** True when the thread can rasterise at all (false during SSR). */
export function hasCanvasSupport(): boolean {
  return typeof OffscreenCanvas !== "undefined" || (typeof document !== "undefined" && typeof document.createElement === "function");
}

/** Allocate a drawing surface, off-main-thread capable where supported. */
export function createSurface(width: number, height: number): Surface {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
    return { canvas, ctx, width: w, height: h };
  }
  if (typeof document === "undefined") throw new Error("No canvas implementation in this environment");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return { canvas, ctx, width: w, height: h };
}

/** Encode a surface to a Blob, bridging the two incompatible canvas APIs. */
export async function surfaceToBlob(surface: Surface, mime: string, quality: number): Promise<Blob> {
  const canvas = surface.canvas;
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  const el = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    el.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Canvas encode to ${mime} failed`))),
      mime,
      quality,
    );
  });
}

let webpSupport: Promise<boolean> | null = null;

/**
 * Whether this browser can *encode* WebP. Decoding support is near-universal
 * but encoding is not, and a failed encode silently yields a PNG, so we probe
 * once with a 1x1 surface and cache the answer.
 */
export function supportsWebpEncode(): Promise<boolean> {
  webpSupport ??= (async () => {
    try {
      const blob = await surfaceToBlob(createSurface(1, 1), "image/webp", 0.8);
      return blob.type === "image/webp";
    } catch {
      return false;
    }
  })();
  return webpSupport;
}

/** Reset the cached WebP probe — tests only. */
export function resetWebpProbe(): void {
  webpSupport = null;
}
