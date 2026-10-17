/**
 * Crop-box geometry for `crop-editor.tsx`.
 *
 * `@/lib/capture/crop` owns the export maths (what the final canvas looks
 * like); this file owns the *interaction* maths — what one pointer drag or one
 * arrow key does to the crop rect. It is separate, and pure, because that is
 * the part with the off-by-one bugs: a resize that is allowed to invert the
 * rect, a nudge that walks the box out of the image, or a drag that moves the
 * wrong way once the view is rotated.
 *
 * All rects are in *source image pixels*, never screen pixels. The view scale
 * and the view rotation are applied by the component at render time and undone
 * here (`rotatePointerDelta`) when a pointer delta comes back in.
 */
import { clampRect, type Rect, type Size } from "@/lib/capture";

/** Corner and edge grips, plus the interior drag. */
export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

/** Corner grips only — the ones the editor renders as draggable dots. */
export const CORNER_HANDLES: readonly CropHandle[] = ["nw", "ne", "se", "sw"];

/** Edge grips, offered for keyboard users and wide-screen pointers. */
export const EDGE_HANDLES: readonly CropHandle[] = ["n", "e", "s", "w"];

/** Accessible names; a bare "nw" would be read out as nonsense. */
export const HANDLE_LABELS: Readonly<Record<CropHandle, string>> = {
  nw: "top left",
  n: "top",
  ne: "top right",
  e: "right",
  se: "bottom right",
  s: "bottom",
  sw: "bottom left",
  w: "left",
  move: "whole crop area",
};

/**
 * Smallest crop, in source pixels. 200 px is the server's own floor
 * (`MIN_IMAGE_EDGE`), so a crop that passes here cannot be rejected later for
 * being too small — as long as the source itself is bigger than that, which
 * `minFor` handles.
 */
export const MIN_CROP_PX = 200;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** The minimum crop actually achievable in an image this size. */
export function minFor(bounds: Size): { width: number; height: number } {
  return { width: Math.min(MIN_CROP_PX, bounds.width), height: Math.min(MIN_CROP_PX, bounds.height) };
}

/** Slide the whole rect, keeping its size; `clampRect` pulls it back inside. */
export function moveRectBy(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds);
}

/**
 * Apply a drag of one grip. Each edge moves independently and is clamped so
 * that (a) it stays inside the image and (b) the opposite edge is never
 * crossed — the rect can reach the minimum size but never invert, which is
 * what makes a fast corner drag safe.
 */
export function applyHandleDrag(rect: Rect, handle: CropHandle, dx: number, dy: number, bounds: Size): Rect {
  if (handle === "move") return moveRectBy(rect, dx, dy, bounds);
  const min = minFor(bounds);
  let { x, y, width, height } = rect;
  const right = x + width;
  const bottom = y + height;

  if (handle === "nw" || handle === "w" || handle === "sw") {
    const nx = clamp(x + dx, 0, right - min.width);
    width = right - nx;
    x = nx;
  }
  if (handle === "ne" || handle === "e" || handle === "se") {
    const nr = clamp(right + dx, x + min.width, bounds.width);
    width = nr - x;
  }
  if (handle === "nw" || handle === "n" || handle === "ne") {
    const ny = clamp(y + dy, 0, bottom - min.height);
    height = bottom - ny;
    y = ny;
  }
  if (handle === "sw" || handle === "s" || handle === "se") {
    const nb = clamp(bottom + dy, y + min.height, bounds.height);
    height = nb - y;
  }
  return clampRect({ x, y, width, height }, bounds);
}

/**
 * Turn a screen-space pointer delta into an image-space delta.
 *
 * The editor renders the image and the crop overlay as one stage under
 * `transform: rotate(deg) scaleX(flipH ? -1 : 1)` and a uniform `scale`. That
 * composition is `screen = R · M · (scale · image)`, so the inverse applied
 * here is `image = M · R(-deg) · screen / scale`. Without this, dragging a
 * corner on a page you have just turned 90° moves it sideways.
 */
export function rotatePointerDelta(dx: number, dy: number, deg: number, flipH: boolean, scale = 1): { dx: number; dy: number } {
  const s = scale > 0 ? scale : 1;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ix = (cos * dx + sin * dy) / s;
  const iy = (-sin * dx + cos * dy) / s;
  // Only x mirrors: `scaleX(-1)` is its own inverse, and y is untouched by it.
  return { dx: flipH ? -ix : ix, dy: iy };
}

/** Nudge distance in source pixels: ~0.5% of the long edge, at least 1 px. */
export function nudgeStep(bounds: Size, coarse = false): number {
  const base = Math.max(1, Math.round(Math.max(bounds.width, bounds.height) * 0.005));
  return coarse ? base * 5 : base;
}

export interface KeyCommand {
  kind: "move" | "resize";
  dx: number;
  dy: number;
}

/**
 * Keyboard mapping for the crop box, so the whole editor is usable without a
 * pointer: arrows nudge the box, Shift+arrows resize it from the bottom-right.
 * Returns null for keys we do not own, so the event is left alone.
 */
export function keyCommand(key: string, shift: boolean, bounds: Size): KeyCommand | null {
  const step = nudgeStep(bounds, false);
  const kind: KeyCommand["kind"] = shift ? "resize" : "move";
  switch (key) {
    case "ArrowLeft":
      return { kind, dx: -step, dy: 0 };
    case "ArrowRight":
      return { kind, dx: step, dy: 0 };
    case "ArrowUp":
      return { kind, dx: 0, dy: -step };
    case "ArrowDown":
      return { kind, dx: 0, dy: step };
    default:
      return null;
  }
}

/** Arrow-key delta for a focused grip; Shift makes it a coarse jump. */
export function handleKeyDelta(key: string, shift: boolean, bounds: Size): { dx: number; dy: number } | null {
  const step = nudgeStep(bounds, shift);
  switch (key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

/** Uniform scale that fits `content` inside `view`, never enlarging past 1. */
export function fitScale(content: Size, view: Size): number {
  if (content.width <= 0 || content.height <= 0 || view.width <= 0 || view.height <= 0) return 1;
  return Math.min(1, view.width / content.width, view.height / content.height);
}

/** Crop rect as CSS percentages of the image box, so the overlay needs no re-measure. */
export function rectPercent(rect: Rect, bounds: Size): { left: string; top: string; width: string; height: string } {
  const pct = (v: number, total: number) => `${total > 0 ? (v / total) * 100 : 0}%`;
  return {
    left: pct(rect.x, bounds.width),
    top: pct(rect.y, bounds.height),
    width: pct(rect.width, bounds.width),
    height: pct(rect.height, bounds.height),
  };
}

/**
 * Spoken description of the crop. Percentages, not pixels: a student has no
 * idea what "1840 px" means, but "72% of the width" is checkable.
 */
export function describeRect(rect: Rect, bounds: Size): string {
  const w = Math.round((rect.width / Math.max(1, bounds.width)) * 100);
  const h = Math.round((rect.height / Math.max(1, bounds.height)) * 100);
  const x = Math.round((rect.x / Math.max(1, bounds.width)) * 100);
  const y = Math.round((rect.y / Math.max(1, bounds.height)) * 100);
  return `Keeping ${w}% of the width and ${h}% of the height, starting ${x}% across and ${y}% down.`;
}

/** Fold a quarter-turn count into one of the four legal values. */
export function quarterTurn(turns: number): 0 | 90 | 180 | 270 {
  const n = ((Math.round(turns) % 4) + 4) % 4;
  return ([0, 90, 180, 270] as const)[n];
}
