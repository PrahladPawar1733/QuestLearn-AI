"use client";

/**
 * Drag-to-reorder that works on a phone.
 *
 * The old file list used HTML5 drag-and-drop (`draggable`, `onDragStart`,
 * `onDrop`). Those events do not exist on touch, so on the device most students
 * use, the only way to reorder pages was two small arrow buttons — backlog
 * CU-08. Pointer events are the one input model that covers mouse, touch and
 * pen, and `setPointerCapture` keeps the gesture attached to the grip even when
 * the finger leaves it, which is what makes a fast drag survive.
 *
 * The list reorders live as the pointer crosses each neighbour's centre (the
 * iOS behaviour), so the parent's state is always the truth and there is no
 * separate "drop" commit to get wrong. Item keys must be stable ids: React then
 * moves the existing DOM nodes instead of recreating them, which is what lets
 * the captured pointer keep tracking across a reorder.
 *
 * The hook deliberately exposes no refs and no per-item callback factories —
 * one stable set of handlers, with the container and the item index read off
 * the DOM (`data-reorder-root`, `data-reorder-index`) at the moment the drag
 * starts. That keeps every ref access inside an event handler, which is both
 * the React Compiler's rule and the honest description of when it happens.
 */
import { useCallback, useRef, useState } from "react";
import { centersOf, dropIndexFor, moveAnnouncement } from "./page-order";

/** Put this on the element that contains the items. */
export const REORDER_ROOT_ATTR = "data-reorder-root";
/** Put this, with the item's index, on each item wrapper *and* on its grip. */
export const REORDER_INDEX_ATTR = "data-reorder-index";

export interface PointerReorderOptions {
  /** Current number of items; a drag is pointless below 2. */
  count: number;
  /** Drag axis: "y" for a stacked list, "x" for a thumbnail strip. */
  axis?: "x" | "y";
  /** Commit a move. The parent owns the array. */
  onMove: (from: number, to: number) => void;
  /** Name used in the screen-reader announcement, e.g. "Page 2". */
  labelFor?: (index: number) => string;
}

export interface GripHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
}

export interface PointerReorder {
  /** Index currently being dragged, or null. */
  dragging: number | null;
  /** Spread onto each grip button (a real button, so it is focusable and labelled). */
  gripHandlers: GripHandlers;
  /** Render inside an `aria-live="polite"` region; empty when idle. */
  liveMessage: string;
}

function indexOf(el: HTMLElement): number | null {
  const raw = el.getAttribute(REORDER_INDEX_ATTR);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Live centres of every item along the drag axis, in current DOM order. */
function centersFrom(grip: HTMLElement, axis: "x" | "y"): number[] {
  const root = grip.closest(`[${REORDER_ROOT_ATTR}]`);
  if (!root) return [];
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[${REORDER_INDEX_ATTR}]`));
  // Grips carry the same attribute, so keep one node per index (the first,
  // which is the item wrapper) to avoid counting each row twice.
  const seen = new Set<string>();
  const rects: { top: number; left: number; width: number; height: number }[] = [];
  for (const node of nodes) {
    const key = node.getAttribute(REORDER_INDEX_ATTR) ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    const r = node.getBoundingClientRect();
    rects.push({ top: r.top, left: r.left, width: r.width, height: r.height });
  }
  return centersOf(rects, axis);
}

export function usePointerReorder({ count, axis = "y", onMove, labelFor }: PointerReorderOptions): PointerReorder {
  const [dragging, setDragging] = useState<number | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const drag = useRef<{ pointerId: number; index: number; moved: boolean; start: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || count < 2) return;
      const index = indexOf(e.currentTarget);
      if (index === null) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      drag.current = { pointerId: e.pointerId, index, moved: false, start: pos };
      setDragging(index);
      // Capture up front: a fast drag leaves the grip within a frame or two.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [axis, count],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      // Small hysteresis so a tap on the grip is not read as a 1 px drag.
      if (!d.moved && Math.abs(pos - d.start) < 6) return;
      d.moved = true;
      const target = dropIndexFor(centersFrom(e.currentTarget, axis), pos, d.index);
      if (target === d.index) return;
      const from = d.index;
      d.index = target;
      setDragging(target);
      onMove(from, target);
    },
    [axis, onMove],
  );

  const end = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      drag.current = null;
      setDragging(null);
      const el = e.currentTarget;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (d.moved) setLiveMessage(moveAnnouncement(labelFor?.(d.index) ?? `Page ${d.index + 1}`, d.index, count));
    },
    [count, labelFor],
  );

  return {
    dragging,
    gripHandlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
    liveMessage,
  };
}
