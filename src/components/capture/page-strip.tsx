"use client";

/**
 * The captured pages, in upload order, with everything a student needs to fix
 * a batch: reorder, delete, retake one page, re-crop one page, and a per-page
 * legibility badge.
 *
 * Reordering has two complete paths, not one:
 *  - a drag grip driven by pointer events (works on touch; see
 *    `use-pointer-reorder.ts` for why the old HTML5 drag did not), and
 *  - "Move left"/"Move right" buttons, which are what a keyboard and a screen
 *    reader actually use.
 * Both go through the same `onMove`, so they cannot drift apart.
 *
 * Every control is a real `<button>` with a page number in its accessible name
 * ("Delete page 2 of 4"), because in a strip of near-identical thumbnails the
 * number is the only thing that distinguishes one control from the next.
 */
import { ChevronLeft, ChevronRight, Crop, GripVertical, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { gateFor } from "./quality-gate";
import type { CapturedPage } from "./types";
import { REORDER_INDEX_ATTR, REORDER_ROOT_ATTR, usePointerReorder } from "./use-pointer-reorder";

export interface PageStripProps {
  pages: readonly CapturedPage[];
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
  /** Omit to hide the retake action (e.g. outside a live camera session). */
  onRetake?: (index: number) => void;
  /** Omit to hide the crop action. */
  onEdit?: (index: number) => void;
  selected: number | null;
  onSelect: (index: number) => void;
  className?: string;
  /** Rendered on a dark camera surface instead of the light app background. */
  onDarkSurface?: boolean;
}

export function PageStrip({ pages, onMove, onDelete, onRetake, onEdit, selected, onSelect, className, onDarkSurface }: PageStripProps) {
  const total = pages.length;
  const reorder = usePointerReorder({
    count: total,
    axis: "x",
    onMove,
    labelFor: (i) => `Page ${i + 1}`,
  });

  if (total === 0) return null;
  const active = selected !== null && selected >= 0 && selected < total ? selected : null;
  const activePage = active === null ? null : pages[active];

  return (
    <div className={cn("space-y-2", className)}>
      <div
        {...{ [REORDER_ROOT_ATTR]: true }}
        role="list"
        aria-label={`Captured pages, in upload order. ${total} page${total === 1 ? "" : "s"}.`}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {pages.map((page, i) => {
          const gate = gateFor(page.quality);
          const isActive = i === active;
          return (
            <div
              key={page.id}
              role="listitem"
              {...{ [REORDER_INDEX_ATTR]: i }}
              className={cn("shrink-0 transition-opacity", reorder.dragging === i && "opacity-70")}
            >
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={isActive}
                aria-label={`Page ${i + 1} of ${total}. ${gate.headline}. Select to edit.`}
                className={cn(
                  "pressable relative block h-24 w-[4.5rem] overflow-hidden rounded-xl outline-offset-2",
                  isActive ? "outline-[3px] outline-tint outline-solid" : "outline-1 outline-line outline-solid",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.url} alt="" className="size-full bg-surface-2 object-cover" />
                <span
                  className="absolute left-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-[var(--scrim)] px-1 font-rounded t-caption font-semibold text-white tabular"
                  aria-hidden
                >
                  {i + 1}
                </span>
                {gate.severity !== "ok" && (
                  <span
                    className={cn(
                      "absolute bottom-1 right-1 size-2.5 rounded-full ring-2 ring-white/70",
                      gate.tone === "danger" ? "bg-danger-fill" : gate.tone === "amber" ? "bg-amber-fill" : "bg-fill",
                    )}
                    aria-hidden
                  />
                )}
              </button>
              <button
                type="button"
                {...reorder.gripHandlers}
                {...{ [REORDER_INDEX_ATTR]: i }}
                style={{ touchAction: "none" }}
                disabled={total < 2}
                aria-label={`Drag to reorder page ${i + 1} of ${total}. Or use the move buttons below.`}
                className={cn(
                  "mt-1 flex h-11 w-full cursor-grab items-center justify-center rounded-lg active:cursor-grabbing disabled:opacity-30",
                  onDarkSurface ? "text-white/70 hover:bg-white/10" : "text-muted hover:bg-fill-4",
                )}
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>

      {/* One toolbar for the selected page: five full-size targets instead of
          five tiny ones per thumbnail, and the page number is spoken in each. */}
      {active !== null && activePage && (
        <div className={cn("flex flex-wrap items-center gap-1.5 rounded-xl p-1", onDarkSurface ? "bg-white/10" : "bg-surface-2")}>
          <Badge tone={gateFor(activePage.quality).tone} className="ml-1.5 mr-auto">
            Page {active + 1}: {gateFor(activePage.quality).badge}
          </Badge>
          <StripAction
            label={`Move page ${active + 1} left`}
            disabled={active === 0}
            onClick={() => onMove(active, active - 1)}
            onDarkSurface={onDarkSurface}
          >
            <ChevronLeft />
          </StripAction>
          <StripAction
            label={`Move page ${active + 1} right`}
            disabled={active === total - 1}
            onClick={() => onMove(active, active + 1)}
            onDarkSurface={onDarkSurface}
          >
            <ChevronRight />
          </StripAction>
          {onEdit && (
            <StripAction label={`Crop and rotate page ${active + 1}`} onClick={() => onEdit(active)} onDarkSurface={onDarkSurface}>
              <Crop />
            </StripAction>
          )}
          {onRetake && (
            <StripAction label={`Retake page ${active + 1}`} onClick={() => onRetake(active)} onDarkSurface={onDarkSurface}>
              <RefreshCw />
            </StripAction>
          )}
          <StripAction label={`Delete page ${active + 1}`} onClick={() => onDelete(active)} onDarkSurface={onDarkSurface} danger>
            <Trash2 />
          </StripAction>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {reorder.liveMessage}
      </p>
    </div>
  );
}

/** 44x44 icon button: the minimum comfortable touch target, light or dark. */
function StripAction({
  label,
  onClick,
  disabled,
  danger,
  onDarkSurface,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  onDarkSurface?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="plain"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "size-11 rounded-xl",
        onDarkSurface ? "text-white hover:bg-white/15 hover:text-white" : danger && "hover:text-danger",
        danger && onDarkSurface && "text-danger-fill hover:text-danger-fill",
      )}
    >
      {children}
    </Button>
  );
}
