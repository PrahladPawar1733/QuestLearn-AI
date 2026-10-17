"use client";

import { Check, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { OptionList } from "../option-list";
import { optionState } from "../option-state";
import type { OptionId, WorldProps } from "../types";

const CHIP = "material-chrome rounded-full px-2.5 py-1 t-caption font-semibold";

const VB_W = 600;
const VB_H = 150;
const MID = 78;
const START = { x: 26, y: MID };
const EXIT = { x: 572, y: MID };

type Pt = { x: number; y: number };

function gatePoints(n: number): Pt[] {
  const first = 96;
  const last = 504;
  return Array.from({ length: n }, (_, i) => ({
    x: n === 1 ? (first + last) / 2 : first + (i * (last - first)) / (n - 1),
    y: MID + (i % 2 === 0 ? -24 : 24),
  }));
}

/** Point `d` units before `to`, on the segment from `from`. */
function approach(from: Pt, to: Pt, d: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.max(0, (len - d) / len);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/** Semantic token colors, so gates follow light and dark mode with the rest of the app. */
const COLORS = {
  success: "var(--green-fill)",
  amber: "var(--orange-fill)",
  tint: "var(--tint)",
  danger: "var(--red-fill)",
  faint: "var(--faint)",
};

/** Maze Escape: every question is a gate. Pick the right door to light your way out. */
export function MazeWorld(props: WorldProps) {
  const { question, phase, selected, onSelect, correctOptionId, outcomes, total, isFollowUp } = props;
  const systemReduced = useReducedMotion();
  const rm = props.reducedMotion || !!systemReduced;
  const locked = phase !== "answering";
  const n = Math.max(1, total);
  const gates = gatePoints(n);
  const path = [START, ...gates, EXIT];

  const current = Math.min(outcomes.length, n);
  const opening = phase === "correct" && !isFollowUp && current < n;
  const tokenIndex = Math.min(n, current + (opening ? 1 : 0));
  const token = tokenIndex >= n ? approach(gates[n - 1], EXIT, 18) : approach(path[tokenIndex], gates[tokenIndex], 22);
  const gateSize = Math.max(9, Math.min(15, Math.floor(260 / n)));
  const tokenTransition = rm ? { duration: 0 } : { ...spring.gentle, delay: opening ? 0.15 : 0 };
  const escaped = current >= n || (opening && current + 1 >= n);

  return (
    <div className="space-y-3">
      <div className="relative flex h-[232px] flex-col overflow-hidden rounded-[1.25rem] bg-[linear-gradient(180deg,#e8f6ec_0%,#d4eedc_100%)] dark:bg-[linear-gradient(180deg,#10261f_0%,#0a1a15_100%)] sm:h-[260px] lg:h-[280px]">
        <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <span className={cn(CHIP, "text-ink")}>
            Gate{" "}
            <span className="font-rounded tabular">
              {Math.min(current + 1, n)}/{total}
            </span>
          </span>
          {isFollowUp && <span className={cn(CHIP, "text-amber")}>Follow-up</span>}
        </div>

        {/* Maze path */}
        <div className="relative min-h-0 flex-1 pt-9">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden="true">
            {/* Hedge walls */}
            <g className="fill-[#a8dcb7] dark:fill-[#1c4536]">
              <rect x="40" y="8" width="120" height="14" rx="7" />
              <rect x="210" y="128" width="150" height="14" rx="7" />
              <rect x="400" y="8" width="110" height="14" rx="7" />
              <rect x="120" y="124" width="60" height="14" rx="7" />
              <rect x="300" y="10" width="40" height="14" rx="7" />
              <rect x="470" y="126" width="90" height="14" rx="7" />
            </g>
            {/* Corridor */}
            <polyline
              points={path.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              className="stroke-white dark:stroke-[#1f3d33]"
              strokeWidth="26"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={path.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#8e8e93"
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              strokeLinejoin="round"
            />
            {/* Lit trail for passed gates */}
            {current > 0 && (
              <polyline
                points={path
                  .slice(0, current + 1)
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                style={{ stroke: COLORS.success }}
                strokeOpacity="0.45"
                strokeWidth="6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Gates */}
            {gates.map((g, i) => {
              const passed = i < current;
              const isCurrent = i === current;
              const open = passed || (isCurrent && opening);
              const color = passed
                ? outcomes[i] === "correct"
                  ? COLORS.success
                  : COLORS.amber
                : isCurrent
                  ? opening
                    ? COLORS.success
                    : phase === "wrong" && !isFollowUp
                      ? COLORS.danger
                      : COLORS.tint
                  : COLORS.faint;
              const h = gateSize * 2;
              const leaf = gateSize - 2;
              // Reduced motion: leaves fade instead of sliding.
              const leftX = open && !rm ? g.x - gateSize - leaf - 1 : g.x - gateSize;
              const rightX = open && !rm ? g.x + gateSize + 1 : g.x + 2;
              const leafOpacity = open ? (rm ? 0.12 : 0.35) : 1;
              return (
                <g key={i} opacity={!passed && !isCurrent ? 0.6 : 1}>
                  {isCurrent && !opening && phase !== "wrong" && (
                    <circle cx={g.x} cy={g.y} r={gateSize + 6} fill="none" style={{ stroke: COLORS.tint }} strokeOpacity="0.35" strokeWidth="1.5" />
                  )}
                  <rect x={g.x - gateSize - 3} y={g.y - h / 2} width="3" height={h} rx="1.5" style={{ fill: color, transition: "fill 200ms ease" }} />
                  <rect x={g.x + gateSize} y={g.y - h / 2} width="3" height={h} rx="1.5" style={{ fill: color, transition: "fill 200ms ease" }} />
                  <motion.rect
                    y={g.y - h / 2 + 3}
                    width={leaf}
                    height={h - 6}
                    rx="1.5"
                    style={{ fill: color, stroke: color, transition: "fill 200ms ease, stroke 200ms ease" }}
                    fillOpacity={0.4}
                    strokeWidth="1"
                    initial={false}
                    animate={{ x: leftX, opacity: leafOpacity }}
                    transition={rm ? fade : spring.default}
                  />
                  <motion.rect
                    y={g.y - h / 2 + 3}
                    width={leaf}
                    height={h - 6}
                    rx="1.5"
                    style={{ fill: color, stroke: color, transition: "fill 200ms ease, stroke 200ms ease" }}
                    fillOpacity={0.4}
                    strokeWidth="1"
                    initial={false}
                    animate={{ x: rightX, opacity: leafOpacity }}
                    transition={rm ? fade : spring.default}
                  />
                </g>
              );
            })}

            {/* Exit */}
            <g>
              <rect x={EXIT.x - 14} y={EXIT.y - 22} width="28" height="44" rx="14" fill="none" style={{ stroke: escaped ? COLORS.success : COLORS.faint }} strokeWidth="2.5" />
              <text x={EXIT.x} y={EXIT.y + 38} textAnchor="middle" fontSize="13" fontWeight="700" style={{ fill: escaped ? COLORS.success : "var(--muted)" }} letterSpacing="1">
                EXIT
              </text>
            </g>

            {/* Explorer token */}
            <motion.circle r="12" fill="#0a84ff" fillOpacity="0.2" initial={false} animate={{ cx: token.x, cy: token.y }} transition={tokenTransition} />
            <motion.circle r="7" fill="#0a84ff" stroke="#ffffff" strokeWidth="2" initial={false} animate={{ cx: token.x, cy: token.y }} transition={tokenTransition} />
          </svg>
        </div>

        {/* Door choices */}
        <div className="flex shrink-0 items-end justify-center gap-1.5 px-3 pb-3 sm:gap-3">
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
                className={cn("pressable min-w-0 max-w-[84px] flex-1", locked ? "cursor-default" : "cursor-pointer")}
              >
                <motion.span
                  className={cn(
                    "relative flex h-[72px] w-full flex-col items-center overflow-hidden rounded-t-full rounded-b-lg pt-4 shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-colors sm:h-[88px]",
                    st === "idle" && "bg-surface",
                    st === "selected" && "bg-tint",
                    st === "correct" && "bg-success-fill",
                    st === "wrong" && "bg-danger-fill",
                    st === "dimmed" && "bg-surface",
                  )}
                  initial={{ opacity: 0 }}
                  animate={
                    st === "wrong" && !rm
                      ? { opacity: 1, y: 0, x: [0, -5, 4, -2, 0] }
                      : { opacity: st === "dimmed" ? 0.5 : 1, y: st === "selected" && !rm ? -4 : 0, x: 0 }
                  }
                  transition={st === "wrong" && !rm ? { default: spring.default, x: { duration: 0.4, ease: "easeOut" } } : rm ? fade : undefined}
                >
                  <span className={cn("flex h-6 items-center font-rounded text-lg font-bold sm:text-xl", filled ? "text-white" : "text-ink")}>
                    {st === "correct" ? <Check className="size-5" strokeWidth={3} /> : st === "wrong" ? <X className="size-5" strokeWidth={3} /> : o.id}
                  </span>
                  {st === "correct" ? (
                    <span className="mt-1 t-caption font-semibold text-white">Open</span>
                  ) : st === "wrong" ? (
                    <span className="mt-1 px-1 text-center t-caption font-semibold leading-tight text-white">Dead end</span>
                  ) : (
                    <>
                      <span className={cn("mt-1.5 size-1.5 rounded-full", filled ? "bg-white" : "bg-faint")} />
                      {short && (
                        <span className={cn("mt-1 hidden w-full truncate px-1.5 text-center t-caption sm:block", filled ? "text-white/90" : "text-muted")}>
                          <RichText text={o.text} />
                        </span>
                      )}
                    </>
                  )}
                </motion.span>
              </button>
            );
          })}
        </div>
      </div>

      <OptionList question={question} phase={phase} selected={selected} onSelect={onSelect} correctOptionId={correctOptionId} compact />
    </div>
  );
}
