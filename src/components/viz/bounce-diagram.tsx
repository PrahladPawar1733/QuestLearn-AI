"use client";

import { motion, useReducedMotion } from "motion/react";
import type { BounceVisual } from "@/lib/types";

function fmt(n: number) {
  return String(Number(n.toPrecision(3)));
}

/** Ball dropped from h0 rebounding to e²h0, e⁴h0, … */
export function BounceDiagram({ spec, hideAnswer = false }: { spec: BounceVisual; hideAnswer?: boolean }) {
  const reduced = useReducedMotion();
  const W = 520;
  const H = 190;
  const floor = 160;
  const top = 28;
  const scale = (floor - top) / spec.dropHeight;
  const heights = [spec.dropHeight, spec.e ** 2 * spec.dropHeight, spec.e ** 4 * spec.dropHeight];
  const xs = [70, 230, 360, 460];
  const path = heights
    .map((h, i) => {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const peak = floor - h * scale;
      return i === 0 ? `M ${x0} ${peak} Q ${(x0 + x1) / 2 - 40} ${peak} ${x1 - 40} ${floor}` : `Q ${(x0 + x1) / 2 - 40} ${2 * peak - floor} ${x1 - 40} ${floor}`;
    })
    .join(" ");
  return (
    <figure className="overflow-hidden rounded-2xl bg-surface-2">
      <figcaption className="px-4 pt-3 t-subhead font-semibold text-ink">{spec.title ?? "Bouncing ball"}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Ball dropped from ${spec.dropHeight} ${spec.heightUnit} rebounds to ${fmt(heights[1])} ${spec.heightUnit}`}>
        <line x1="20" x2={W - 20} y1={floor + 8} y2={floor + 8} stroke="var(--line-strong)" strokeWidth="2" />
        <path d={path} fill="none" stroke="var(--teal)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="5 5" />
        {heights.slice(0, 2).map((h, i) => {
          const x = i === 0 ? 40 : xs[1] + 12;
          const y = floor - h * scale;
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={floor + 8} y2={y} stroke={i === 0 ? "var(--tint)" : "var(--teal)"} strokeWidth="1.5" />
              <line x1={x - 5} x2={x + 5} y1={y} y2={y} stroke={i === 0 ? "var(--tint)" : "var(--teal)"} strokeWidth="1.5" />
              <text x={x + 8} y={y + 4} fontSize="12" fill="var(--text)" fontWeight="600">
                {i === 0 ? "h₀" : "h₁"} = {fmt(h)} {spec.heightUnit}
              </text>
            </g>
          );
        })}
        <motion.circle
          r="10"
          cx={xs[0]}
          fill="var(--tint)"
          initial={{ cy: floor - spec.dropHeight * scale }}
          animate={reduced ? undefined : { cy: [floor - spec.dropHeight * scale, floor, floor - heights[1] * scale, floor] }}
          transition={{ duration: 2.4, times: [0, 0.4, 0.7, 1], ease: ["easeIn", "easeOut", "easeIn"], repeat: Infinity, repeatDelay: 0.6 }}
        />
      </svg>
      {!hideAnswer && (
        <p className="px-4 pb-3 t-footnote text-muted">
          Speed ∝ √h, so e = √(h₁/h₀) = <span className="font-semibold text-ink">{fmt(spec.e)}</span>
        </p>
      )}
    </figure>
  );
}
