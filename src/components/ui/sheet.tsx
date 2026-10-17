"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type Detent = "peek" | "medium" | "large";
const ORDER: Detent[] = ["peek", "medium", "large"];

/* Apple's momentum projection (Designing Fluid Interfaces, WWDC18). */
function project(velocityPxPerSec: number, decelerationRate = 0.998) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/* Progressive resistance past a boundary: real things slow before they stop. */
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

interface Props {
  /** Fixed header (title + actions). Also the drag region. */
  header: React.ReactNode;
  children: React.ReactNode;
  initialDetent?: Detent;
  /** Accessible name for the sheet. */
  label: string;
  onDetentChange?: (d: Detent) => void;
  className?: string;
}

/**
 * A non-modal bottom sheet with three detents (peek / medium / large).
 *
 * - Tracks the pointer 1:1 from where it was grabbed (pointer capture).
 * - On release, projects momentum to pick the detent the flick was heading to,
 *   then hands the release velocity to a spring (no seam between drag and animation).
 * - Interruptible: grabbing mid-flight stops the spring at its live position.
 * - Rubber-bands past the top and bottom detents instead of hard-stopping.
 * - Enters and exits along the same path (from / to the bottom edge).
 * - Keyboard: the grabber is a button; Arrow Up/Down or Enter change the detent.
 */
export function BottomSheet({ header, children, initialDetent = "medium", label, onDetentChange, className }: Props) {
  const reduced = useReducedMotion();
  const [vh, setVh] = useState(0);
  const [headerH, setHeaderH] = useState(120);
  const [detent, setDetent] = useState<Detent>(initialDetent);
  const [hidden, setHidden] = useState(0); // px of the sheet currently below the screen edge
  const headerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(10_000); // start offscreen until measured
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<{ id: number; startPointer: number; startY: number; moved: boolean; history: { t: number; p: number }[] } | null>(null);

  const H = Math.round(vh * 0.92); // sheet height at the large detent
  const visible = useCallback((d: Detent) => (d === "peek" ? headerH : d === "medium" ? Math.round(vh * 0.55) : H), [H, headerH, vh]);
  const yFor = useCallback((d: Detent) => Math.max(0, H - visible(d)), [H, visible]);

  // Measure viewport and header (respects text-size changes).
  useLayoutEffect(() => {
    const measure = () => {
      setVh(window.innerHeight);
      if (headerRef.current) setHeaderH(Math.ceil(headerRef.current.getBoundingClientRect().height) + 4);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const settleTo = useCallback(
    (d: Detent, velocity = 0, momentum = false) => {
      anim.current?.stop();
      const target = yFor(d);
      setDetent(d);
      onDetentChange?.(d);
      anim.current = animate(y, target, reduced ? { duration: 0.2, ease: "easeOut" } : { ...(momentum ? spring.momentum : spring.default), velocity });
      anim.current.finished.then(() => setHidden(Math.max(0, y.get()))).catch(() => undefined);
    },
    [onDetentChange, reduced, y, yFor],
  );

  // Enter from the bottom edge once measured; re-settle on resize.
  const entered = useRef(false);
  useEffect(() => {
    if (!vh) return;
    if (!entered.current) {
      entered.current = true;
      y.set(reduced ? yFor(detent) : H);
      settleTo(detent);
    } else if (!drag.current) {
      // Header or viewport size changed: glide to the same detent's new position.
      settleTo(detent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vh, headerH]);

  const scrim = useTransform(y, [yFor("large"), yFor("medium")], [1, 0], { clamp: true });

  /* ---------------- gesture ---------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    // Presses that start on header controls belong to those controls.
    if (t.closest("a, input, select, textarea, button:not([data-grabber])")) return;
    // Interrupt: stop any running spring at its live (presentation) value.
    anim.current?.stop();
    // Capture now so a fast drag keeps tracking after the pointer leaves the header.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startPointer: e.clientY, startY: y.get(), moved: false, history: [{ t: e.timeStamp, p: e.clientY }] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = e.clientY - d.startPointer;
    if (!d.moved && Math.abs(delta) < 6) return; // hysteresis before committing to a drag
    d.moved = true;
    const raw = d.startY + delta; // respects the grab offset: no jump to the pointer
    const min = yFor("large");
    const max = yFor("peek");
    const next = raw < min ? min - rubberband(min - raw, H) : raw > max ? max + rubberband(raw - max, H) : raw;
    y.set(next);
    d.history.push({ t: e.timeStamp, p: e.clientY });
    if (d.history.length > 6) d.history.shift();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      // Tap on the grabber: step between medium and large (peek → medium).
      settleTo(detent === "large" ? "medium" : detent === "medium" ? "large" : "medium");
      return;
    }
    const h = d.history;
    const first = h[0];
    const last = h[h.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const velocity = ((last.p - first.p) / dt) * 1000; // px/s, +down
    const projected = y.get() + project(velocity);
    let best: Detent = "medium";
    let bestDist = Infinity;
    for (const det of ORDER) {
      const dist = Math.abs(yFor(det) - projected);
      if (dist < bestDist) {
        bestDist = dist;
        best = det;
      }
    }
    settleTo(best, velocity, Math.abs(velocity) > 400);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ORDER.indexOf(detent);
    if (e.key === "ArrowUp") {
      e.preventDefault();
      settleTo(ORDER[Math.min(2, i + 1)]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      settleTo(ORDER[Math.max(0, i - 1)]);
    }
  };

  return (
    <>
      {/* Dims only toward the large detent; medium stays non-blocking so the game stays in view. */}
      <motion.div
        aria-hidden
        className={cn("fixed inset-0 z-40 bg-[var(--scrim)]", detent === "large" ? "pointer-events-auto" : "pointer-events-none")}
        style={{ opacity: scrim }}
        exit={{ opacity: 0 }}
        onClick={() => settleTo("medium")}
      />
      <motion.section
        role="region"
        aria-label={label}
        className={cn("material-thick fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[1.75rem]", className)}
        style={{ y, height: H || "92dvh", willChange: "transform" }}
        // Leave along the same path it entered: back down past the bottom edge.
        exit={reduced ? { opacity: 0 } : { y: H || 1000 }}
        transition={reduced ? { duration: 0.2 } : spring.default}
      >
        <div
          ref={headerRef}
          className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pb-1 pt-2">
            <button
              type="button"
              data-grabber
              onKeyDown={onKeyDown}
              onClick={(e) => e.detail === 0 && settleTo(detent === "large" ? "medium" : "large")}
              aria-label={`Resize ${label}. Currently ${detent}. Use arrow keys.`}
              className="flex h-5 w-16 items-center justify-center"
            >
              <span className="h-[5px] w-9 rounded-full bg-fill" />
            </button>
          </div>
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: `calc(${hidden}px + env(safe-area-inset-bottom) + 1rem)` }}>
          {children}
        </div>
      </motion.section>
    </>
  );
}

/** Height the page should reserve at the bottom so content isn't hidden under a peeking sheet. */
export const SHEET_PEEK_RESERVE = "9rem";
