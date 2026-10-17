"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { OptionList } from "../option-list";
import { optionState } from "../option-state";
import type { OptionId, WorldProps } from "../types";

const CHIP = "material-chrome rounded-full px-2.5 py-1 t-caption font-semibold";

/** Rocket Launch: each correct answer bolts a stage onto the rocket. */
export function RocketWorld(props: WorldProps) {
  const { question, phase, selected, onSelect, correctOptionId, outcomes, total, isFollowUp } = props;
  const systemReduced = useReducedMotion();
  const rm = props.reducedMotion || !!systemReduced;
  const locked = phase !== "answering";
  const slots = Math.max(1, total);

  const pendingStage = phase === "correct" && !isFollowUp && outcomes.length < total;
  const docked = Math.min(slots, outcomes.filter((o) => o === "correct").length);
  const stages = Math.min(slots, docked + (pendingStage ? 1 : 0));
  const ignition = phase === "correct" && !isFollowUp && outcomes.length + 1 === total;
  const slotH = Math.max(8, Math.min(20, Math.floor(120 / slots) - 2));

  const message =
    phase === "answering"
      ? selected
        ? `Module ${selected} armed. Confirm to dock.`
        : "Select a stage module."
      : phase === "submitting"
        ? "Checking trajectory…"
        : phase === "correct"
          ? ignition
            ? "All systems go. Liftoff!"
            : isFollowUp
              ? "Calibration confirmed."
              : "Stage docked. Nice work."
          : "Stage rejected. Recalibrate.";

  const lightClass = phase === "correct" ? "bg-success-fill" : phase === "wrong" ? "bg-danger-fill" : phase === "submitting" ? "bg-amber-fill" : "bg-tint";

  return (
    <div className="space-y-3">
      <div className="relative flex h-[232px] overflow-hidden rounded-[1.25rem] bg-[linear-gradient(180deg,#0b0b26_0%,#16154a_60%,#26236e_100%)] sm:h-[260px] lg:h-[280px]">
        {/* Launch pad */}
        <div className="relative w-[38%] shrink-0 sm:w-[34%]">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 160 300" preserveAspectRatio="none" aria-hidden="true">
            {[
              [20, 30], [70, 18], [130, 44], [40, 90], [110, 110], [145, 160], [16, 170],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 2 ? 0.9 : 1.3} fill="#ffffff" opacity="0.5" />
            ))}
          </svg>
          <div className={cn(CHIP, "absolute left-3 top-3 z-10 text-ink")}>
            Stages{" "}
            <span className="font-rounded tabular">
              {stages}/{total}
            </span>
          </div>

          {/* Gantry tower */}
          <div className="absolute bottom-[18px] left-[14%] h-[58%] w-1.5 rounded-t-full bg-[#3a3a5c]" aria-hidden="true">
            <div className="absolute left-0 top-[20%] h-0.5 w-6 rounded-full bg-[#3a3a5c]" />
            <div className="absolute left-0 top-[55%] h-0.5 w-6 rounded-full bg-[#3a3a5c]" />
          </div>

          {/* Rocket */}
          <motion.div
            className="absolute bottom-[22px] left-1/2 flex -translate-x-1/2 flex-col items-center"
            initial={false}
            animate={ignition && !rm ? { y: -12 } : { y: 0 }}
            transition={ignition && !rm ? { ...spring.gentle, delay: 0.25 } : undefined}
            aria-hidden="true"
          >
            <svg viewBox="0 0 28 22" className="h-[22px] w-7">
              <path d="M14 0 C21 6 25 14 26 22 H2 C3 14 7 6 14 0 Z" fill="#f2f2f7" />
              <circle cx="14" cy="13" r="3" fill="#40cbe0" />
            </svg>
            <div className="flex flex-col-reverse gap-[2px]">
              {Array.from({ length: slots }).map((_, i) => {
                const filled = i < stages;
                const isNew = pendingStage && i === stages - 1;
                return filled ? (
                  <motion.div
                    key={`stage-${i}`}
                    initial={isNew ? (rm ? { opacity: 0 } : { opacity: 0, x: 28 }) : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={isNew ? (rm ? fade : spring.default) : undefined}
                    className={cn("w-7 rounded-[4px]", i % 2 === 0 ? "bg-[#5856d6]" : "bg-[#7d7aff]")}
                    style={{ height: slotH }}
                  />
                ) : (
                  <div key={`slot-${i}`} className="w-7 rounded-[4px] border border-dashed border-white/25" style={{ height: slotH }} />
                );
              })}
            </div>
            <svg viewBox="0 0 44 16" className="h-4 w-11">
              <path d="M8 0 H36 L44 14 H34 L30 6 H14 L10 14 H0 Z" fill="#ff375f" />
              <rect x="16" y="6" width="12" height="8" rx="2" fill="#d1d1d6" />
            </svg>
            <AnimatePresence>
              {ignition && (
                <motion.div
                  key="flames"
                  className="-mt-0.5 origin-top"
                  initial={rm ? { opacity: 0 } : { opacity: 0, scaleY: 0.4 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  exit={rm ? { opacity: 0 } : { opacity: 0, scaleY: 0.4 }}
                  transition={rm ? fade : spring.snappy}
                >
                  <svg viewBox="0 0 20 26" className="h-[22px] w-4">
                    <path d="M10 26 C3 18 2 10 6 0 H14 C18 10 17 18 10 26 Z" fill="#ff9f0a" />
                    <path d="M10 20 C7 14 7 8 8.5 2 H11.5 C13 8 13 14 10 20 Z" fill="#ffd60a" />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Pad */}
          <div className="absolute inset-x-[12%] bottom-3 h-2 rounded-full bg-[#3a3a5c]" aria-hidden="true" />
        </div>

        {/* Mission console: a solid panel so the keys and status read in light and dark. */}
        {isFollowUp && <span className={cn(CHIP, "absolute right-3 top-3 z-10 text-amber")}>Follow-up</span>}
        <div className={cn("flex min-w-0 flex-1 p-3 pl-0", isFollowUp && "pt-11")}>
          <motion.div
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-2xl bg-surface p-2.5 sm:p-3"
            animate={phase === "wrong" && !rm ? { x: [0, -4, 4, -2, 2, 0] } : { x: 0 }}
            transition={phase === "wrong" && !rm ? { duration: 0.4, ease: "easeOut" } : undefined}
          >
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5" aria-hidden="true">
              <span className={cn("size-2 shrink-0 rounded-full transition-colors", lightClass)} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={message}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn("min-w-0 truncate t-caption font-medium", phase === "wrong" ? "text-danger" : phase === "correct" ? "text-success" : "text-muted")}
                >
                  {message}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-1.5 sm:grid-cols-3 sm:gap-2">
              {question.options.map((o) => {
                const st = optionState(o.id, selected, phase, correctOptionId);
                const short = o.text.length <= 18;
                const filled = st === "selected" || st === "correct" || st === "wrong";
                return (
                  <button
                    key={`${question.id}-${o.id}`}
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    disabled={locked}
                    onClick={() => onSelect(o.id as OptionId)}
                    className={cn(
                      "pressable flex h-8 min-w-0 items-center gap-1.5 rounded-[10px] px-1.5 text-left sm:h-10 sm:px-2",
                      st === "idle" && "bg-fill-3 hover:bg-fill-2",
                      st === "selected" && "bg-tint",
                      st === "correct" && "bg-success-fill",
                      st === "wrong" && "bg-danger-fill",
                      st === "dimmed" && "bg-fill-4 opacity-50",
                      locked ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full font-rounded text-[0.6875rem] font-bold",
                        filled ? "bg-white/25 text-white" : "bg-fill text-ink",
                      )}
                    >
                      {st === "correct" ? <Check className="size-3" strokeWidth={3} /> : st === "wrong" ? <X className="size-3" strokeWidth={3} /> : o.id}
                    </span>
                    {short ? (
                      <RichText text={o.text} className={cn("min-w-0 truncate t-caption", filled ? "text-white" : "text-ink")} />
                    ) : (
                      <span className={cn("truncate t-caption", filled ? "text-white/85" : "text-muted")}>Module</span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      <OptionList question={question} phase={phase} selected={selected} onSelect={onSelect} correctOptionId={correctOptionId} compact />
    </div>
  );
}
