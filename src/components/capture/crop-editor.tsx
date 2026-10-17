"use client";

/**
 * Crop, straighten and flip one captured page.
 *
 * Two decisions worth knowing before changing anything here:
 *
 * 1. The crop rect lives in *source image pixels*, and the view (image plus
 *    crop overlay) is rotated as a single stage. So the box the student sees is
 *    always aligned to the page, and the exported bytes are exactly what the
 *    box showed — `cropAndRotate` crops in source space and then rotates the
 *    tile, which is the same composition. Pointer deltas come back through
 *    `rotatePointerDelta` to undo the view transform.
 *
 * 2. Every gesture has a keyboard equal, not an approximation: the crop box is
 *    focusable (arrows nudge, Shift+arrows resize), each corner grip is a real
 *    button that resizes from that corner with the arrows, and rotate / flip /
 *    straighten / auto-detect are ordinary buttons. A student using a keyboard
 *    can produce the same file as a student using a thumb.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, FlipHorizontal, Loader2, RotateCcw, RotateCw, ScanLine, Undo2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  autoDocumentRect,
  clampRect,
  cropAndRotate,
  loadImageBitmap,
  rectFromAspect,
  rotatedBounds,
  type Raster,
  type Rect,
} from "@/lib/capture";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import {
  CORNER_HANDLES,
  HANDLE_LABELS,
  applyHandleDrag,
  describeRect,
  fitScale,
  handleKeyDelta,
  keyCommand,
  quarterTurn,
  rectPercent,
  rotatePointerDelta,
  type CropHandle,
} from "./crop-geometry";
import { preparePage } from "./prepare";
import type { CapturedPage } from "./types";

/** Straightening range. Past ~15° a student wants a quarter turn, not a nudge. */
const FINE_LIMIT = 15;

export interface CropEditorProps {
  open: boolean;
  /** The page being edited; `null` renders nothing. */
  page: CapturedPage | null;
  onOpenChange: (open: boolean) => void;
  /** Receives the edited page. The caller owns revoking the old one. */
  onApply: (page: CapturedPage) => void;
}

export function CropEditor({ open, page, onOpenChange, onApply }: CropEditorProps) {
  const reduced = useReducedMotion();
  return (
    <Dialog.Root open={open && !!page} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && page && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduced ? fade : spring.snappy}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 flex flex-col bg-bg"
                {...(reduced
                  ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
                  : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 24 }, transition: spring.default })}
              >
                <CropSurface page={page} onClose={() => onOpenChange(false)} onApply={onApply} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */

function CropSurface({ page, onClose, onApply }: { page: CapturedPage; onClose: () => void; onApply: (p: CapturedPage) => void }) {
  const rasterRef = useRef<Raster | null>(null);
  const [source, setSource] = useState<{ width: number; height: number } | null>(null);
  const [autoRect, setAutoRect] = useState<Rect | null>(null);
  const [autoTried, setAutoTried] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [turns, setTurns] = useState(0);
  const [fine, setFine] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  /* ---- decode once; the raster is needed for auto-detect and for export ---- */
  useEffect(() => {
    let cancelled = false;
    loadImageBitmap(page.file)
      .then((raster) => {
        if (cancelled) {
          raster.close();
          return;
        }
        rasterRef.current = raster;
        setSource({ width: raster.width, height: raster.height });
        // Start with a small inset rather than the whole frame: a photo of a
        // page almost always has desk around it, and an inset box tells the
        // student the handles are draggable.
        setRect(rectFromAspect({ width: raster.width, height: raster.height }, raster.width / raster.height, 0.02));
        try {
          setAutoRect(autoDocumentRect(raster));
        } catch {
          setAutoRect(null);
        } finally {
          setAutoTried(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError("This photo can't be opened for editing. You can still upload it as it is.");
      });
    return () => {
      cancelled = true;
      rasterRef.current?.close();
      rasterRef.current = null;
    };
  }, [page.file]);

  /* ---- measure the viewport so the stage can be scaled to fit ---- */
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setView({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const quarter = quarterTurn(turns);
  const angle = quarter + fine;
  const scale = useMemo(() => {
    if (!source || !view.width || !view.height) return 0;
    // Fit the *rotated* footprint, so a straightened page never gets clipped.
    return fitScale(rotatedBounds(source.width, source.height, angle), view);
  }, [angle, source, view]);

  /**
   * All rect changes go through one updater, and it reads the *previous* rect
   * rather than the render's closure: two pointer moves can land in a single
   * React batch, and computing both from the same stale rect would silently
   * drop one of the deltas mid-drag.
   */
  const updateRect = useCallback(
    (fn: (prev: Rect) => Rect) => {
      if (!source) return;
      setRect((prev) => (prev ? clampRect(fn(prev), source) : prev));
    },
    [source],
  );

  /* ---- pointer drags: one handler for the interior and every grip ---- */
  const drag = useRef<{ pointerId: number; handle: CropHandle; x: number; y: number } | null>(null);

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId || !source) return;
      // Incremental deltas (not "pointer minus start") so clamping at an edge
      // cannot build up a phantom offset the student has to drag back out.
      const screenDx = e.clientX - d.x;
      const screenDy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      const { dx, dy } = rotatePointerDelta(screenDx, screenDy, angle, flipH, scale || 1);
      updateRect((prev) => applyHandleDrag(prev, d.handle, dx, dy, source));
    },
    [angle, flipH, scale, source, updateRect],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  /**
   * One stable set of handlers for the interior and all four grips; which one
   * was grabbed is read from `data-handle` on the element the event fired on.
   * (Per-element handler factories would mean creating closures over a ref
   * during render, which React's compiler rules — rightly — reject.)
   *
   * Grips sit *inside* the crop box, so a corner drag would otherwise also
   * start an interior "move" drag as the event bubbled, and the second one
   * would win; hence the `stopPropagation` for everything but "move".
   */
  const handleOf = (el: HTMLElement): CropHandle => (el.getAttribute("data-handle") as CropHandle | null) ?? "move";

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const handle = handleOf(e.currentTarget);
    if (handle !== "move") e.stopPropagation();
    drag.current = { pointerId: e.pointerId, handle, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (handleOf(e.currentTarget) !== "move") e.stopPropagation();
      onHandlePointerMove(e);
    },
    [onHandlePointerMove],
  );

  const onDragPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (handleOf(e.currentTarget) !== "move") e.stopPropagation();
      endDrag(e);
    },
    [endDrag],
  );

  const dragProps = {
    onPointerDown: onDragPointerDown,
    onPointerMove: onDragPointerMove,
    onPointerUp: onDragPointerEnd,
    onPointerCancel: onDragPointerEnd,
    style: { touchAction: "none" as const },
  };

  /* ---- keyboard ---- */
  const onBoxKeyDown = (e: React.KeyboardEvent) => {
    if (!source) return;
    const cmd = keyCommand(e.key, e.shiftKey, source);
    if (!cmd) return;
    e.preventDefault();
    updateRect((prev) => applyHandleDrag(prev, cmd.kind === "move" ? "move" : "se", cmd.dx, cmd.dy, source));
  };

  const onGripKeyDown = (handle: CropHandle) => (e: React.KeyboardEvent) => {
    if (!source) return;
    const delta = handleKeyDelta(e.key, e.shiftKey, source);
    if (!delta) return;
    e.preventDefault();
    // Otherwise the box's own handler runs too and the box both resizes and moves.
    e.stopPropagation();
    updateRect((prev) => applyHandleDrag(prev, handle, delta.dx, delta.dy, source));
  };

  const reset = () => {
    setTurns(0);
    setFine(0);
    setFlipH(false);
    if (source) setRect(rectFromAspect(source, source.width / source.height, 0.02));
  };

  const useAutoRect = () => {
    if (autoRect) updateRect(() => autoRect);
  };

  const apply = async () => {
    const raster = rasterRef.current;
    if (!raster || !rect) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await cropAndRotate(raster, { rect, rotateDeg: quarter, fineDeg: fine, flipH });
      // Re-measure, and reset the "kept anyway" flag with it: cropping changes
      // framing, average exposure and coverage, so neither the old verdict nor
      // the student's decision about it describes these pixels any more.
      onApply(await preparePage(blob, { name: page.file.name, source: page.source }));
      onClose();
    } catch {
      setError("We couldn't save those edits. Try again, or upload the photo unedited.");
    } finally {
      setBusy(false);
    }
  };

  const ready = !!source && !!rect && scale > 0;
  const boxStyle = rect && source ? rectPercent(rect, source) : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <Button variant="plain" onClick={onClose} className="h-11 px-3">
          <X /> Cancel
        </Button>
        <Dialog.Title className="flex-1 text-center t-headline text-ink">Crop &amp; rotate</Dialog.Title>
        <Button onClick={apply} disabled={!ready || busy} className="h-11">
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Done
        </Button>
      </header>

      <Dialog.Description className="sr-only">
        Adjust which part of the photo is uploaded. The crop area can be moved with the arrow keys and resized with Shift and the arrow keys. Each corner is a button that resizes from that
        corner.
      </Dialog.Description>

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-surface-3">
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 t-subhead text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening photo…
          </p>
        )}
        {ready && source && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className="relative"
              style={{
                width: source.width * scale,
                height: source.height * scale,
                // Order matters: `rotatePointerDelta` inverts exactly this
                // composition (rotate, then mirror).
                transform: `rotate(${angle}deg) scaleX(${flipH ? -1 : 1})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.url} alt="" draggable={false} className="pointer-events-none block size-full select-none object-contain" />

              <div
                role="group"
                aria-roledescription="Crop area"
                aria-label="Crop area. Use the arrow keys to move it, Shift and the arrow keys to resize it."
                tabIndex={0}
                onKeyDown={onBoxKeyDown}
                data-handle="move"
                {...dragProps}
                className="absolute cursor-move outline-offset-0 focus-visible:outline-[3px] focus-visible:outline-tint focus-visible:outline-solid"
                style={{ ...boxStyle, boxShadow: "0 0 0 9999px var(--scrim)" }}
              >
                <span className="pointer-events-none absolute inset-0 outline-2 -outline-offset-2 outline-white/90 outline-solid" aria-hidden />
                {/* Thirds, the standard framing aid; decorative only. */}
                <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/30" aria-hidden />
                <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/30" aria-hidden />
                <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/30" aria-hidden />
                <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/30" aria-hidden />

                {CORNER_HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    data-handle={handle}
                    {...dragProps}
                    onKeyDown={onGripKeyDown(handle)}
                    aria-label={`Resize crop from the ${HANDLE_LABELS[handle]} corner. Use the arrow keys.`}
                    className={cn(
                      // 44x44 target, small visible dot: the hit area a thumb
                      // needs without a dot that hides the page.
                      "absolute flex size-11 items-center justify-center rounded-full",
                      handle === "nw" && "-left-5.5 -top-5.5",
                      handle === "ne" && "-right-5.5 -top-5.5",
                      handle === "se" && "-bottom-5.5 -right-5.5",
                      handle === "sw" && "-bottom-5.5 -left-5.5",
                    )}
                  >
                    <span className="size-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.4)]" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {rect && source ? describeRect(rect, source) : ""}
      </p>

      {error && (
        <p role="alert" className="flex items-start gap-2 bg-danger-fill/10 px-4 py-2.5 t-footnote text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> {error}
        </p>
      )}

      <div className="space-y-2 border-t border-line px-3 py-3">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <ToolButton label="Rotate left 90 degrees" onClick={() => setTurns((t) => t - 1)}>
            <RotateCcw />
          </ToolButton>
          <ToolButton label="Rotate right 90 degrees" onClick={() => setTurns((t) => t + 1)}>
            <RotateCw />
          </ToolButton>
          <ToolButton label="Flip horizontally" onClick={() => setFlipH((f) => !f)} pressed={flipH}>
            <FlipHorizontal />
          </ToolButton>
          <ToolButton
            label="Auto-detect the page edges"
            onClick={useAutoRect}
            disabled={!autoRect}
            // Honest about why it is off: the detector returns nothing unless
            // it is actually confident, and we do not fake a crop.
            hint={autoTried && !autoRect ? "No clear page edge found in this photo" : undefined}
          >
            <ScanLine />
          </ToolButton>
          <ToolButton label="Reset crop and rotation" onClick={reset}>
            <Undo2 />
          </ToolButton>
        </div>

        <div className="flex items-center gap-3 px-1">
          <label htmlFor="crop-straighten" className="shrink-0 t-footnote text-muted">
            Straighten
          </label>
          <input
            id="crop-straighten"
            type="range"
            min={-FINE_LIMIT}
            max={FINE_LIMIT}
            step={0.5}
            value={fine}
            onChange={(e) => setFine(Number(e.target.value))}
            aria-valuetext={`${fine > 0 ? "+" : ""}${fine} degrees`}
            className="h-11 w-full cursor-pointer accent-[var(--tint)]"
          />
          <span className="w-12 shrink-0 text-right font-rounded t-footnote text-ink tabular" aria-hidden>
            {fine > 0 ? "+" : ""}
            {fine}°
          </span>
        </div>
        <p className="px-1 t-caption text-faint">
          {fine !== 0
            ? "Straightening fills the empty corners with white, like paper."
            : "Drag the corners, or use the arrow keys. Shift and the arrow keys resize."}
        </p>
      </div>
    </div>
  );
}

/** 44x44 tool button with an optional reason it is disabled. */
function ToolButton({
  label,
  onClick,
  disabled,
  pressed,
  hint,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={pressed ? "tinted" : "plain"}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={hint ? `${label}. ${hint}.` : label}
      title={hint ? `${label} — ${hint}` : label}
      className="size-11 rounded-xl"
    >
      {children}
    </Button>
  );
}
