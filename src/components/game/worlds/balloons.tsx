"use client";

import { Check, Star, X } from "lucide-react";
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { OptionList } from "../option-list";
import { optionState, type OptionVisualState } from "../option-state";
import type { OptionId, WorldProps } from "../types";

const CHIP = "material-chrome rounded-full px-2.5 py-1 t-caption font-semibold";

/** Vibrant system hues for idle balloons (by option index), each with a legible letter color. */
const HUES: { fill: string; ink: string }[] = [
  { fill: "#ff375f", ink: "#ffffff" }, // pink
  { fill: "#ff9f0a", ink: "#ffffff" }, // orange
  { fill: "#bf5af2", ink: "#ffffff" }, // purple
  { fill: "#30b0c7", ink: "#ffffff" }, // teal
  { fill: "#ffd60a", ink: "#3a3000" }, // yellow
];

function balloonColors(state: OptionVisualState, index: number) {
  if (state === "correct") return { fill: "#30d158", ink: "#ffffff" };
  if (state === "wrong") return { fill: "#ff453a", ink: "#ffffff" };
  if (state === "selected") return { fill: "#5856d6", ink: "#ffffff" };
  return HUES[index % HUES.length];
}

const SHARD_COLORS = ["#ff453a", "#ff9f0a", "#ffd60a", "#ff375f"];

/** Small balloon glyph used in the earned row; inherits `currentColor`. */
function MiniBalloon({ dashed = false }: { dashed?: boolean }) {
  return (
    <svg viewBox="0 0 12 18" className="h-[18px] w-3" aria-hidden="true">
      <ellipse cx="6" cy="6" rx="5" ry="5.6" fill={dashed ? "none" : "currentColor"} stroke={dashed ? "currentColor" : "none"} strokeDasharray={dashed ? "2 2" : undefined} strokeWidth={dashed ? 1 : 0} />
      <path d="M6 11.6 L5 13 H7 Z" fill={dashed ? "none" : "currentColor"} />
      <path d="M6 13 Q7 15.5 6 18" stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.6" />
    </svg>
  );
}

/** Balloon Pop: every answer rides a balloon. The right one floats up; a wrong pick pops. */
export function BalloonsWorld(props: WorldProps) {
  const { question, phase, selected, onSelect, correctOptionId, outcomes, total, isFollowUp } = props;
  const systemReduced = useReducedMotion();
  const rm = props.reducedMotion || !!systemReduced;
  const locked = phase !== "answering";
  const settled = phase === "correct" || phase === "wrong";
  const pendingEarned = phase === "correct" && !isFollowUp && outcomes.length < total;
  const earned = outcomes.filter((o) => o === "correct").length + (pendingEarned ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="relative h-[228px] overflow-hidden rounded-[1.25rem] bg-[linear-gradient(180deg,#8ec5ff_0%,#bfdcff_55%,#e3efff_100%)] dark:bg-[linear-gradient(180deg,#0b0d2e_0%,#191b52_60%,#2a2c78_100%)] sm:h-[256px] lg:h-[280px]">
        {/* Sky decoration */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
          <g className="opacity-0 dark:opacity-100">
            {[
              [30, 40], [90, 22], [150, 58], [230, 30], [300, 52], [370, 24], [60, 110], [340, 120],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.2 : 0.8} fill="#ffffff" opacity={0.5} />
            ))}
          </g>
          <g className="fill-white/70 dark:fill-white/[0.06]">
            <ellipse cx="70" cy="170" rx="70" ry="16" />
            <ellipse cx="110" cy="160" rx="40" ry="14" />
            <ellipse cx="320" cy="90" rx="60" ry="12" />
            <ellipse cx="350" cy="82" rx="34" ry="11" />
          </g>
          <path d="M0 270 Q100 252 200 266 T400 262 V300 H0 Z" className="fill-white/60 dark:fill-black/30" />
        </svg>

        {/* HUD */}
        <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <span className={cn(CHIP, "text-ink")}>Pop the right balloon</span>
          {isFollowUp && <span className={cn(CHIP, "text-amber")}>Follow-up</span>}
        </div>

        {/* Balloons */}
        <div className="absolute inset-x-0 bottom-[50px] top-[16%] flex items-start justify-around px-2 sm:px-6">
          {question.options.map((o, i) => {
            const st = optionState(o.id, selected, phase, correctOptionId);
            const { fill, ink } = balloonColors(st, i);
            const short = o.text.length <= 18;

            let anim: TargetAndTransition;
            let transition: Transition | undefined;
            if (rm) {
              anim = { opacity: st === "dimmed" ? 0.5 : 1 };
              transition = fade;
            } else if (st === "selected") {
              anim = { opacity: 1, y: -10, scale: 1.04 };
            } else if (st === "correct") {
              anim = { opacity: 1, y: -26, scale: 1.04 };
              transition = spring.gentle;
            } else if (st === "wrong") {
              // Short shake, then the balloon deflates while the shards fly.
              anim = { opacity: 1, y: 0, scale: 0.86, x: [0, -6, 5, -3, 0] };
              transition = { default: spring.default, x: { duration: 0.4, ease: "easeOut" } };
            } else if (st === "dimmed") {
              anim = { opacity: 0.5, y: 0, scale: 0.96 };
            } else {
              anim = { opacity: 1, y: 0, scale: 1 };
            }

            return (
              <div key={`${question.id}-${o.id}`} className={cn("relative flex min-w-0 flex-1 basis-0 flex-col items-center", i % 2 === 1 && "mt-6")}>
                {/* Gentle bob via CSS keyframes only; stops once settled or under reduced motion. */}
                <div className={cn("relative flex flex-col items-center", !rm && !settled && "ql-bob")} style={!rm && !settled ? { animationDelay: `${-i * 0.7}s` } : undefined}>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    disabled={locked}
                    onClick={() => onSelect(o.id as OptionId)}
                    className={cn("pressable relative block w-12 sm:w-14 lg:w-16", locked ? "cursor-default" : "cursor-pointer")}
                  >
                    <motion.span className="relative block" initial={rm ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={anim} transition={transition}>
                      <svg viewBox="0 0 60 84" className="block h-auto w-full overflow-visible" aria-hidden="true">
                        <path d="M30 62 Q33 72 29 84" stroke="#8e8e93" strokeWidth="1" fill="none" opacity="0.7" />
                        <ellipse
                          cx="30"
                          cy="30"
                          rx="24"
                          ry="28"
                          fill={fill}
                          stroke={st === "selected" ? "#ffffff" : "none"}
                          strokeWidth={st === "selected" ? 2.5 : 0}
                          style={{ transition: "fill 200ms ease" }}
                        />
                        <ellipse cx="21" cy="18" rx="5" ry="8" fill="#ffffff" opacity="0.28" transform="rotate(-20 21 18)" />
                        <path d="M30 58 L26 63 H34 Z" fill={fill} style={{ transition: "fill 200ms ease" }} />
                      </svg>
                      <span className="absolute inset-x-0 top-[24%] flex justify-center font-rounded text-lg font-bold sm:text-xl" style={{ color: ink }}>
                        {st === "correct" ? <Check className="size-5" strokeWidth={3} /> : st === "wrong" ? <X className="size-5" strokeWidth={3} /> : o.id}
                      </span>
                    </motion.span>
                  </button>

                  {/* Star burst for the correct balloon */}
                  {st === "correct" && !rm && (
                    <div className="pointer-events-none absolute left-1/2 top-0" aria-hidden="true">
                      {Array.from({ length: 6 }).map((_, k) => {
                        const a = (k / 6) * Math.PI * 2;
                        return (
                          <motion.span
                            key={k}
                            className="absolute -ml-1.5 -mt-1.5"
                            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                            animate={{ x: Math.cos(a) * 32, y: Math.sin(a) * 32 - 20, opacity: [0, 1, 0], scale: 1 }}
                            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                          >
                            <Star className="size-3 fill-yellow text-yellow" />
                          </motion.span>
                        );
                      })}
                    </div>
                  )}

                  {/* Shards for a popped balloon */}
                  {st === "wrong" && !rm && (
                    <div className="pointer-events-none absolute left-1/2 top-[26px]" aria-hidden="true">
                      {Array.from({ length: 8 }).map((_, k) => {
                        const a = (k / 8) * Math.PI * 2 + 0.3;
                        return (
                          <motion.span
                            key={k}
                            className="absolute h-1 w-2.5 rounded-full"
                            style={{ backgroundColor: SHARD_COLORS[k % SHARD_COLORS.length] }}
                            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                            animate={{ x: Math.cos(a) * 30, y: Math.sin(a) * 26 + 10, opacity: 0, rotate: 140 + k * 20 }}
                            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {short && (
                  <div
                    className={cn(
                      "material-chrome mt-1 max-w-full truncate rounded-full px-2 py-0.5 text-center t-caption text-ink transition-opacity sm:max-w-[120px]",
                      st === "dimmed" && "opacity-50",
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

        {/* Earned balloons */}
        <div className="absolute inset-x-3 bottom-2.5 z-10 flex justify-start" aria-hidden="true">
          <div className="material-chrome flex min-w-0 max-w-full items-center gap-2.5 rounded-full py-1 pl-2.5 pr-2">
            <span className="shrink-0 t-caption font-semibold text-ink">
              <span className="font-rounded tabular">
                {earned}/{total}
              </span>{" "}
              earned
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {Array.from({ length: total }).map((_, i) => {
                const outcome = outcomes[i];
                const isPending = pendingEarned && i === outcomes.length;
                if (outcome === "correct" || isPending) {
                  return (
                    <motion.span
                      key={i}
                      className="shrink-0 text-success-fill"
                      initial={isPending ? (rm ? { opacity: 0 } : { opacity: 0, y: 6 }) : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={isPending ? (rm ? fade : { ...spring.default, delay: 0.2 }) : undefined}
                    >
                      <MiniBalloon />
                    </motion.span>
                  );
                }
                if (outcome === "wrong") {
                  return (
                    <span key={i} className="shrink-0 text-faint">
                      <MiniBalloon />
                    </span>
                  );
                }
                return (
                  <span key={i} className="shrink-0 text-faint">
                    <MiniBalloon dashed />
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <OptionList question={question} phase={phase} selected={selected} onSelect={onSelect} correctOptionId={correctOptionId} compact />
    </div>
  );
}
