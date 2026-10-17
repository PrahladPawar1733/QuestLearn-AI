"use client";

import { Check, X } from "lucide-react";
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { OptionList } from "../option-list";
import { optionState } from "../option-state";
import type { OptionId, WorldProps } from "../types";

const CHIP = "material-chrome rounded-full px-2.5 py-1 t-caption font-semibold";

/** Decorative micro-bubbles: [left %, bottom %, size px]. They bob via the shared CSS class only. */
const AMBIENT: [number, number, number][] = [
  [8, 12, 5],
  [18, 46, 4],
  [33, 28, 6],
  [52, 62, 4],
  [66, 18, 5],
  [80, 50, 4],
  [91, 30, 6],
];

/** Bubble Lab: answers float in a lab tank. Catch the right bubble to fill the beaker. */
export function BubblesWorld(props: WorldProps) {
  const { question, phase, selected, onSelect, correctOptionId, outcomes, total, isFollowUp } = props;
  const systemReduced = useReducedMotion();
  const rm = props.reducedMotion || !!systemReduced;
  const locked = phase !== "answering";
  const settled = phase === "correct" || phase === "wrong";
  const pending = phase === "correct" && !isFollowUp && outcomes.length < total;
  const caught = outcomes.filter((o) => o === "correct").length + (pending ? 1 : 0);
  const ratio = total > 0 ? Math.min(1, caught / total) : 0;
  const ticks = Math.min(total, 12);

  return (
    <div className="space-y-3">
      <div className="relative flex h-[232px] gap-2.5 overflow-hidden rounded-[1.25rem] bg-[#e4f4f8] p-3 dark:bg-[#0a1d24] sm:h-[260px] sm:gap-3 lg:h-[280px]">
        {/* Tank */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-white/55 dark:bg-white/[0.04]">
          {/* Water */}
          <div className="absolute inset-x-0 bottom-0 top-[13%] bg-[linear-gradient(180deg,rgb(64_203_224/0.16)_0%,rgb(10_132_255/0.22)_100%)]" aria-hidden="true">
            <svg className="absolute inset-x-0 -top-[5px] h-[10px] w-full" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 5 Q12.5 1 25 5 T50 5 T75 5 T100 5 T125 5 T150 5 T175 5 T200 5" stroke="#40cbe0" strokeOpacity="0.6" strokeWidth="1.2" fill="none" />
            </svg>
          </div>
          {/* Glass highlight */}
          <div className="pointer-events-none absolute bottom-3 left-2 top-3 w-1 rounded-full bg-white/50 dark:bg-white/[0.06]" aria-hidden="true" />

          {/* Ambient micro-bubbles (static under reduced motion) */}
          {AMBIENT.map(([left, bottom, size], i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn("pointer-events-none absolute rounded-full border border-[#40cbe0]/60", !rm && "ql-bob")}
              style={{ left: `${left}%`, bottom: `${bottom}%`, width: size, height: size, ...(rm ? {} : { animationDelay: `${-i * 0.45}s` }) }}
            />
          ))}

          <div className="absolute inset-x-2.5 top-2.5 z-20 flex items-start justify-between gap-2">
            <span className={cn(CHIP, "text-ink", isFollowUp && "hidden sm:inline-block")}>Catch the right bubble</span>
            {isFollowUp && <span className={cn(CHIP, "text-amber")}>Follow-up</span>}
          </div>

          {/* Answer bubbles in a stable grid */}
          <div className="absolute inset-x-0 bottom-[3%] top-[17%] flex flex-wrap content-center items-start justify-center gap-x-2 gap-y-2 px-3 sm:gap-x-5">
            {question.options.map((o, i) => {
              const st = optionState(o.id, selected, phase, correctOptionId);
              const short = o.text.length <= 18;

              let anim: TargetAndTransition;
              let transition: Transition | undefined;
              if (rm) {
                anim = { opacity: st === "dimmed" ? 0.5 : 1 };
                transition = fade;
              } else if (st === "selected") {
                anim = { opacity: 1, y: -4, scale: 1.06 };
              } else if (st === "correct") {
                anim = { opacity: 1, y: -18, scale: 1.06 };
                transition = spring.gentle;
              } else if (st === "wrong") {
                anim = { opacity: 1, y: 0, scale: 0.92, x: [0, -5, 4, -2, 0] };
                transition = { default: spring.default, x: { duration: 0.4, ease: "easeOut" } };
              } else if (st === "dimmed") {
                anim = { opacity: 0.5, y: 0, scale: 0.96 };
              } else {
                anim = { opacity: 1, y: 0, scale: 1 };
              }

              return (
                <div key={`${question.id}-${o.id}`} className={cn("relative flex flex-col items-center", i % 2 === 1 && "translate-y-2")}>
                  <div className={cn("relative", !rm && !settled && "ql-bob")} style={!rm && !settled ? { animationDelay: `${-i * 0.6}s` } : undefined}>
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      disabled={locked}
                      onClick={() => onSelect(o.id as OptionId)}
                      className={cn("pressable block rounded-full", locked ? "cursor-default" : "cursor-pointer")}
                    >
                      <motion.span
                        className={cn(
                          "relative flex size-14 items-center justify-center rounded-full font-rounded text-lg font-bold transition-colors sm:size-16 sm:text-xl lg:size-[72px]",
                          st === "idle" && "bg-surface/80 text-ink ring-2 ring-inset ring-[#40cbe0]/70",
                          st === "selected" && "bg-tint text-on-tint ring-4 ring-tint/25",
                          st === "correct" && "bg-success-fill text-white",
                          st === "wrong" && "bg-danger-fill text-white",
                          st === "dimmed" && "bg-surface/60 text-faint ring-1 ring-inset ring-[#40cbe0]/40",
                        )}
                        initial={rm ? { opacity: 0 } : { opacity: 0, y: 14 }}
                        animate={anim}
                        transition={transition}
                      >
                        {/* Soft specular highlight */}
                        <span className="pointer-events-none absolute left-[22%] top-[16%] h-[22%] w-[30%] -rotate-[25deg] rounded-full bg-white/45" aria-hidden="true" />
                        <span className="relative">
                          {st === "correct" ? <Check className="size-6" strokeWidth={3} /> : st === "wrong" ? <X className="size-6" strokeWidth={3} /> : o.id}
                        </span>
                      </motion.span>
                    </button>

                    {/* Burst droplets */}
                    {st === "wrong" && !rm && (
                      <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden="true">
                        {Array.from({ length: 8 }).map((_, k) => {
                          const a = (k / 8) * Math.PI * 2;
                          return (
                            <motion.span
                              key={k}
                              className="absolute -ml-1 -mt-1 size-2 rounded-full border border-[#40cbe0] bg-[#40cbe0]/25"
                              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                              animate={{ x: Math.cos(a) * 36, y: Math.sin(a) * 36, opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {short && (
                    <div
                      className={cn(
                        "material-chrome mt-1 max-w-[64px] truncate rounded-full px-2 py-0.5 text-center t-caption text-ink transition-opacity sm:max-w-[120px]",
                        (st === "dimmed" || st === "wrong") && "opacity-50",
                      )}
                      aria-hidden="true"
                    >
                      <RichText text={o.text} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Beaker gauge */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-1.5 sm:w-12" aria-hidden="true">
          <span className="t-caption font-semibold text-muted">Yield</span>
          <div className="relative w-full flex-1 overflow-hidden rounded-b-2xl rounded-t-md bg-white/70 ring-1 ring-inset ring-black/[0.06] dark:bg-white/[0.06] dark:ring-white/10">
            <motion.div
              className="absolute inset-0 origin-bottom bg-success-fill"
              initial={false}
              animate={{ scaleY: ratio }}
              transition={rm ? { duration: 0 } : { ...spring.gentle, delay: pending ? 0.2 : 0 }}
            />
            {Array.from({ length: Math.max(0, ticks - 1) }).map((_, i) => (
              <span key={i} className="absolute right-0 h-px w-2 bg-black/15 dark:bg-white/20" style={{ bottom: `${((i + 1) / ticks) * 100}%` }} />
            ))}
          </div>
          <span className="t-caption font-semibold text-ink">
            <span className="font-rounded tabular">
              {Math.min(caught, total)}/{total}
            </span>
          </span>
        </div>
      </div>

      <OptionList question={question} phase={phase} selected={selected} onSelect={onSelect} correctOptionId={correctOptionId} compact />
    </div>
  );
}
