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
                "pressable group flex h-full w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left ring-inset transition-shadow",
                st === "idle" && "shadow-[0_1px_2px_rgb(30_24_90/0.05)] ring-1 ring-line-strong hover:ring-tint/40 hover:shadow-[0_6px_16px_-8px_rgb(91_69_240/0.35)]",
                st === "selected" && "bg-tint/5 ring-2 ring-tint shadow-[0_8px_20px_-10px_rgb(91_69_240/0.5)]",
                st === "correct" && "bg-success-fill/8 ring-2 ring-success-fill",
                st === "wrong" && "bg-danger-fill/8 ring-2 ring-danger-fill",
                st === "dimmed" && "opacity-50 ring-1 ring-line",
                locked && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-[10px] t-subhead font-bold transition-colors",
                  st === "idle" && "bg-tint/10 text-tint",
                  st === "selected" && "bg-tint text-on-tint",
                  st === "correct" && "bg-success-fill text-white",
                  st === "wrong" && "bg-danger-fill text-white",
                  st === "dimmed" && "bg-fill-3 text-faint",
                )}
              >
                {st === "correct" ? <Check className="size-4" strokeWidth={3} /> : st === "wrong" ? <X className="size-4" strokeWidth={3} /> : o.id}
              </span>
              <RichText text={o.text} className="t-callout text-ink" />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
