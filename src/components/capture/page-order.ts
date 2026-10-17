/**
 * Page-order maths for the capture flow.
 *
 * Kept free of React and the DOM so the reordering rules can be unit-tested:
 * the previous implementation in `create-flow.tsx` used HTML5 drag events,
 * which never fire on touch (backlog CU-08), and the bug was invisible because
 * nothing about the ordering was testable.
 */

/** Clamp an index into `[0, length - 1]`; an empty list clamps to 0. */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(0, length - 1));
}

/**
 * Move one item to a new index, shifting the rest — the behaviour a drag
 * expects. Returns the original array reference when nothing would change, so
 * callers can skip a re-render.
 */
export function movePage<T>(list: readonly T[], from: number, to: number): readonly T[] {
  if (list.length < 2) return list;
  const a = clampIndex(from, list.length);
  const b = clampIndex(to, list.length);
  if (a === b) return list;
  const out = [...list];
  const [item] = out.splice(a, 1);
  out.splice(b, 0, item);
  return out;
}

/**
 * Step an item one place in either direction — the keyboard and button path.
 * A move off either end is a no-op rather than a wrap, so holding the button
 * cannot silently cycle a page back to where it started.
 */
export function movePageBy<T>(list: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  return movePage(list, index, target);
}

/** Remove one item by identity, leaving the order of the rest intact. */
export function removeAt<T>(list: readonly T[], index: number): readonly T[] {
  if (index < 0 || index >= list.length) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

/** Replace one item in place — used by "retake this page". */
export function replaceAt<T>(list: readonly T[], index: number, item: T): readonly T[] {
  if (index < 0 || index >= list.length) return list;
  const out = [...list];
  out[index] = item;
  return out;
}

/**
 * Which slot a pointer at `position` is over, given each item's centre along
 * the drag axis. Centres are in the list's current (live) order, so this is
 * called after every reorder during a drag.
 *
 * The dragged item is excluded from the comparison: including it would make
 * the item fight its own slot and jitter between two indices on sub-pixel
 * moves. Instead we count how many *other* centres the pointer has passed.
 */
export function dropIndexFor(centers: readonly number[], position: number, dragging: number): number {
  if (centers.length === 0) return 0;
  const from = clampIndex(dragging, centers.length);
  let passed = 0;
  for (let i = 0; i < centers.length; i++) {
    if (i === from) continue;
    if (position > centers[i]) passed++;
  }
  return clampIndex(passed, centers.length);
}

/** Centre of each element along one axis, for `dropIndexFor`. */
export function centersOf(rects: readonly { top: number; left: number; width: number; height: number }[], axis: "x" | "y"): number[] {
  return rects.map((r) => (axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2));
}

/**
 * Screen-reader announcement for a completed move. Reordering is otherwise
 * silent, which leaves a keyboard user with no confirmation that anything
 * happened.
 */
export function moveAnnouncement(label: string, index: number, total: number): string {
  return `${label} is now page ${index + 1} of ${total}.`;
}
