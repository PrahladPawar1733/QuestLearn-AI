"use client";

import { Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { fade, materialize, spring } from "@/lib/motion";
import { OptionList } from "../option-list";
import { optionState } from "../option-state";
import type { OptionId, WorldProps } from "../types";

const CHIP = "material-chrome rounded-full px-2.5 py-1 t-caption font-semibold";

const MUZZLE = { x: 122, y: 69 };
const TARGET = { x: 322, y: 138 };
const SPARK_COLORS = ["#ffd60a", "#40cbe0", "#30d158", "#ff9f0a"];

/** A cute, round slime with a smile. `cx` is the centre, base sits on y=160. Bobs via the shared CSS class only. */
function Slime({ cx, w, h, color, delay, bob }: { cx: number; w: number; h: number; color: string; delay: number; bob: boolean }) {
  const top = 160 - h;
  const eyeY = top + h * 0.45;
  const eyeDx = w * 0.18;
  const eyeR = Math.max(2, w * 0.07);
  return (
    <g className={bob ? "ql-bob" : undefined} style={bob ? { animationDelay: `${-delay}s`, transformBox: "fill-box" } : undefined}>
      <path
        d={`M${cx - w / 2} 160 C${cx - w / 2} ${top + h * 0.15} ${cx - w * 0.3} ${top} ${cx} ${top} C${cx + w * 0.3} ${top} ${cx + w / 2} ${top + h * 0.15} ${cx + w / 2} 160 Z`}
        fill={color}
      />
      <ellipse cx={cx - w * 0.18} cy={top + h * 0.22} rx={w * 0.1} ry={h * 0.08} fill="#ffffff" opacity="0.35" />
      <circle cx={cx - eyeDx} cy={eyeY} r={eyeR} fill="#1c1c1e" />
      <circle cx={cx + eyeDx} cy={eyeY} r={eyeR} fill="#1c1c1e" />
      <circle cx={cx - eyeDx + eyeR * 0.35} cy={eyeY - eyeR * 0.35} r={eyeR * 0.35} fill="#ffffff" />
      <circle cx={cx + eyeDx + eyeR * 0.35} cy={eyeY - eyeR * 0.35} r={eyeR * 0.35} fill="#ffffff" />
      <path d={`M${cx - w * 0.1} ${eyeY + h * 0.18} Q${cx} ${eyeY + h * 0.28} ${cx + w * 0.1} ${eyeY + h * 0.18}`} stroke="#1c1c1e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Castle Defense: correct answers fire the cannon; mistakes raise a friendly shield. */
export function CastleWorld(props: WorldProps) {
  const { question, phase, selected, onSelect, correctOptionId, outcomes, total, isFollowUp } = props;
  const systemReduced = useReducedMotion();
  const rm = props.reducedMotion || !!systemReduced;
  const locked = phase !== "answering";
  const settled = phase === "correct" || phase === "wrong";
  const fired = phase === "correct";
  const shielded = phase === "wrong";
  const wave = Math.max(1, Math.min(outcomes.length + 1, total));
  const loaded = selected !== null && !settled;

  let waveAnim: TargetAndTransition;
  let waveTransition: Transition | undefined;
  if (fired) {
    waveAnim = rm ? { opacity: 0 } : { x: 0, y: 0, scale: 0.4, opacity: 0 };
    waveTransition = rm ? fade : { ...spring.default, delay: 0.3 };
  } else if (shielded && !rm) {
    // Short knock-back against the shield.
    waveAnim = { x: [0, 10, 0], y: 0, scale: 1, opacity: 1 };
    waveTransition = { duration: 0.4, ease: "easeOut" };
  } else {
    waveAnim = rm ? { opacity: 1 } : { x: 0, y: 0, scale: 1, opacity: 1 };
    waveTransition = rm ? fade : undefined;
  }

  return (
    <div className="space-y-3">
      <div className="relative flex h-[232px] flex-col overflow-hidden rounded-[1.25rem] bg-[linear-gradient(180deg,#9fd0ff_0%,#d7ebff_100%)] dark:bg-[linear-gradient(180deg,#0b0d2e_0%,#1b1d55_100%)] sm:h-[260px] lg:h-[280px]">
        <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <span className={cn(CHIP, "text-ink")}>
            Wave{" "}
            <span className="font-rounded tabular">
              {wave}/{total}
            </span>
          </span>
          {isFollowUp && <span className={cn(CHIP, "text-amber")}>Follow-up</span>}
        </div>

        {/* Outcome label, on a material chip so it stays legible over the scene */}
        <AnimatePresence>
          {settled && (
            <motion.div
              key={phase}
              className="pointer-events-none absolute inset-x-0 top-12 z-20 flex justify-center"
              initial={rm ? { opacity: 0 } : materialize.initial}
              animate={rm ? { opacity: 1 } : materialize.animate}
              exit={rm ? { opacity: 0, transition: fade } : { ...materialize.exit, transition: spring.snappy }}
              transition={rm ? fade : { ...spring.default, delay: fired ? 0.4 : 0.1 }}
              aria-hidden="true"
            >
              <span className={cn(CHIP, "flex items-center gap-1.5", fired ? "text-success" : "text-teal")}>
                {fired ? <Sparkles className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                {fired ? "Wave cleared" : "Shield up"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Battlefield */}
        <div className="relative min-h-0 flex-1">
          <svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMax meet" className="h-full w-full" aria-hidden="true">
            {/* Stars (night only) */}
            <g className="opacity-0 dark:opacity-100">
              {[
                [160, 22], [210, 40], [255, 16], [300, 34], [350, 20], [385, 48], [190, 70],
              ].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={i % 2 ? 0.8 : 1.1} fill="#ffffff" opacity="0.5" />
              ))}
            </g>

            {/* Ground */}
            <path d="M0 160 H400 V180 H0 Z" className="fill-[#9ed8a9] dark:fill-[#18233f]" />

            {/* Castle */}
            <g>
              <rect x="10" y="88" width="100" height="72" className="fill-[#d1d1d6] dark:fill-[#3a3d6e]" />
              {Array.from({ length: 6 }).map((_, i) => (
                <rect key={i} x={60 + i * 9} y="80" width="6" height="9" className="fill-[#d1d1d6] dark:fill-[#3a3d6e]" />
              ))}
              <rect x="18" y="52" width="40" height="108" className="fill-[#e5e5ea] dark:fill-[#4a4e88]" />
              {Array.from({ length: 4 }).map((_, i) => (
                <rect key={i} x={18 + i * 11} y="44" width="7" height="9" className="fill-[#e5e5ea] dark:fill-[#4a4e88]" />
              ))}
              <rect x="34" y="70" width="8" height="12" rx="4" fill="#ffd60a" opacity="0.8" />
              <path d="M70 160 V136 A12 12 0 0 1 94 136 V160 Z" className="fill-[#8e8e93] dark:fill-[#1c1c3a]" />
              <line x1="38" y1="44" x2="38" y2="20" stroke="#8e8e93" strokeWidth="1.5" />
              <path d="M38 20 L54 25 L38 30 Z" fill="#5856d6" />
            </g>

            {/* Cannon */}
            <g>
              <rect x="96" y="64" width="28" height="9" rx="3" fill="#48484a" transform="rotate(-8 96 68)" />
              <circle cx="98" cy="76" r="6" fill="#3a3a3c" />
              <circle cx={MUZZLE.x} cy={MUZZLE.y} r="3" style={{ fill: loaded ? "var(--tint)" : fired ? "#ffd60a" : "#1c1c1e", transition: "fill 200ms ease" }} />
            </g>

            {/* Shield (wrong answer, non-punitive) */}
            <AnimatePresence>
              {shielded && (
                <motion.g key="shield" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                  <path d="M118 46 Q150 103 118 160 L112 160 L112 46 Z" fill="#40cbe0" fillOpacity="0.2" />
                  <motion.path
                    d="M118 46 Q150 103 118 160"
                    fill="none"
                    stroke="#40cbe0"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={rm ? { pathLength: 1 } : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={rm ? { duration: 0 } : spring.default}
                  />
                </motion.g>
              )}
            </AnimatePresence>

            {/* The wave */}
            <motion.g
              key={question.id}
              style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
              initial={rm ? { opacity: 0 } : { opacity: 0, x: 32 }}
              animate={waveAnim}
              transition={waveTransition}
            >
              <Slime cx={282} w={30} h={24} color="#40cbe0" delay={0.4} bob={!rm && !settled} />
              <Slime cx={TARGET.x} w={52} h={42} color="#bf5af2" delay={0} bob={!rm && !settled} />
              <Slime cx={366} w={32} h={26} color="#ff375f" delay={0.9} bob={!rm && !settled} />
            </motion.g>

            {/* Cannonball + sparkles on a correct answer */}
            {fired && !rm && (
              <g key={`fire-${question.id}`}>
                <motion.circle
                  r="6"
                  fill="#ffd60a"
                  stroke="#ff9f0a"
                  strokeWidth="1.5"
                  initial={{ cx: MUZZLE.x, cy: MUZZLE.y, opacity: 1 }}
                  animate={{ cx: TARGET.x, cy: TARGET.y - 16, opacity: 0 }}
                  transition={{ cx: spring.snappy, cy: spring.snappy, opacity: { duration: 0.1, delay: 0.28 } }}
                />
                {Array.from({ length: 10 }).map((_, k) => {
                  const a = (k / 10) * Math.PI * 2;
                  return (
                    <motion.circle
                      key={k}
                      r={k % 2 ? 2 : 2.8}
                      fill={SPARK_COLORS[k % SPARK_COLORS.length]}
                      initial={{ cx: TARGET.x, cy: TARGET.y - 16, opacity: 0 }}
                      animate={{ cx: TARGET.x + Math.cos(a) * 40, cy: TARGET.y - 16 + Math.sin(a) * 30, opacity: [0, 1, 0] }}
                      transition={{ duration: 0.4, delay: 0.28, ease: "easeOut" }}
                    />
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {/* Cannon loads */}
        <div className="flex shrink-0 items-end justify-center gap-2 bg-[#9ed8a9] px-3 pb-2.5 pt-1 dark:bg-[#18233f] sm:gap-5">
          {question.options.map((o) => {
            const st = optionState(o.id, selected, phase, correctOptionId);
            const short = o.text.length <= 18;
            return (
              <div key={`${question.id}-${o.id}`} className="flex min-w-0 flex-col items-center">
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  disabled={locked}
                  onClick={() => onSelect(o.id as OptionId)}
                  className={cn("pressable rounded-full", locked ? "cursor-default" : "cursor-pointer")}
                >
                  <motion.span
                    className={cn(
                      "relative flex size-11 items-center justify-center rounded-full font-rounded text-base font-bold transition-colors sm:size-12",
                      st === "idle" && "bg-[#3a3a3c] text-white dark:bg-[#636366]",
                      st === "selected" && "bg-tint text-on-tint ring-4 ring-tint/25",
                      st === "correct" && "bg-success-fill text-white",
                      st === "wrong" && "bg-danger-fill text-white",
                      st === "dimmed" && "bg-[#3a3a3c] text-white dark:bg-[#636366]",
                    )}
                    initial={{ opacity: 0 }}
                    animate={
                      st === "wrong" && !rm
                        ? { opacity: 1, y: 0, x: [0, -4, 4, -2, 0] }
                        : { opacity: st === "dimmed" ? 0.5 : 1, y: st === "selected" && !rm ? -4 : 0, x: 0 }
                    }
                    transition={st === "wrong" && !rm ? { default: spring.default, x: { duration: 0.4, ease: "easeOut" } } : rm ? fade : undefined}
                  >
                    <span className="pointer-events-none absolute left-[24%] top-[18%] h-[18%] w-[26%] -rotate-[25deg] rounded-full bg-white/25" aria-hidden="true" />
                    <span className="relative">
                      {st === "correct" ? <Check className="size-5" strokeWidth={3} /> : st === "wrong" ? <X className="size-5" strokeWidth={3} /> : o.id}
                    </span>
                  </motion.span>
                </button>
                {short && (
                  <span
                    className={cn("mt-1 max-w-[52px] truncate text-center t-caption text-ink transition-opacity sm:max-w-[96px]", st === "dimmed" && "opacity-50")}
                    aria-hidden="true"
                  >
                    <RichText text={o.text} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <OptionList question={question} phase={phase} selected={selected} onSelect={onSelect} correctOptionId={correctOptionId} compact />
    </div>
  );
}
