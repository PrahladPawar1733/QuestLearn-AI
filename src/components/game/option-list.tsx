"use client";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { optionState } from "./option-state";
import { optionAria } from "./option-state";
import type { OptionId, WorldProps } from "./types";

/**
 * Accessible option list (radiogroup). Feedback is instant on press;
 * outcome colors carry an icon as well, never color alone.
 */
export function OptionList({
  question,
  phase,
  selected,
  onSelect,
  correctOptionId,
  compact = false,
  className,
}: Pick<WorldProps, "question" | "phase" | "selected" | "onSelect" | "correctOptionId"> & { compact?: boolean; className?: string }) {
  const locked = phase !== "answering";
  return (
    <div role="radiogroup" aria-label="Answer options" className={cn("grid gap-2.5", compact ? "sm:grid-cols-2" : "", className)}>
      {question.options.map((o) => {
        const st = optionState(o.id, selected, phase, correctOptionId);
        return (
          // The wrapper carries the wrong-answer shake (Motion transform); the button keeps
          // the CSS press scale, so the two transforms never fight.
          <motion.div
            key={o.id}
            animate={st === "wrong" ? { x: [0, -7, 6, -4, 3, 0] } : { x: 0 }}
            transition={st === "wrong" ? { duration: 0.42, ease: "easeOut" } : undefined}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected === o.id}
              aria-label={optionAria(o.id, st)}
              disabled={locked}
              onPointerDown={() => !locked && selected !== o.id && haptic("selection")}
              onClick={() => onSelect(o.id as OptionId)}
              className={cn(
                "pressable group flex h-full w-full items-start gap-3 rounded-2xl p-3.5 text-left ring-inset",
                st === "idle" && "bg-surface-2 hover:bg-fill-3",
                st === "selected" && "bg-tint/12 ring-2 ring-tint",
                st === "correct" && "bg-success-fill/14 ring-2 ring-success-fill",
                st === "wrong" && "bg-danger-fill/12 ring-2 ring-danger-fill",
                st === "dimmed" && "bg-surface-2 opacity-50",
                locked && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full t-footnote font-bold transition-colors",
                  st === "idle" && "bg-fill-3 text-muted",
                  st === "selected" && "bg-tint text-on-tint",
                  st === "correct" && "bg-success-fill text-white",
                  st === "wrong" && "bg-danger-fill text-white",
                  st === "dimmed" && "bg-fill-4 text-faint",
                )}
              >
                {st === "correct" ? <Check className="size-4" strokeWidth={3} /> : st === "wrong" ? <X className="size-4" strokeWidth={3} /> : o.id}
              </span>
              <RichText text={o.text} className="pt-0.5 t-callout text-ink" />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
