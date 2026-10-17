"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { collide1D } from "@/lib/validation/physics";
import type { CollisionVisual } from "@/lib/types";

const W = 640;
const H = 164;
const C = W / 2;
const TRACK_Y = 104;
const T_CONTACT = 1.5;
const T_AFTER = 1.7;

function fmt(n: number) {
  if (Math.abs(n) < 1e-9) return "0";
  return String(Number(n.toPrecision(3)));
}

/**
 * Deterministic 1D collision visual. Final velocities are recomputed here
 * from (m1, m2, u1, u2, e); they are never taken from model output.
 * mode "before" shows only the initial state (safe while a question is open).
 */
export function CollisionDiagram({ spec, mode = "full" }: { spec: CollisionVisual; mode?: "before" | "full" }) {
  const reduced = useReducedMotion();
  const { v1, v2 } = useMemo(() => collide1D(spec.m1, spec.m2, spec.u1, spec.u2, spec.e), [spec]);
  const r1 = 14 + 10 * Math.cbrt(spec.m1 / Math.max(spec.m1, spec.m2));
  const r2 = 14 + 10 * Math.cbrt(spec.m2 / Math.max(spec.m1, spec.m2));
  const vmaxBefore = Math.max(Math.abs(spec.u1), Math.abs(spec.u2), 1e-6);
  const vmaxAfter = Math.max(Math.abs(v1), Math.abs(v2), 1e-6);
  const room = C - Math.max(r1, r2) - 24;
  const k = Math.min(room / (vmaxBefore * T_CONTACT), room / (vmaxAfter * T_AFTER));

  const [t, setT] = useState(mode === "before" ? 0 : 0);
  const [playing, setPlaying] = useState(mode === "full" && !reduced);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const step = (now: number) => {
      const dt = last.current == null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const nt = prev + dt;
        if (nt >= T_CONTACT + T_AFTER + 0.8) {
          return 0; // loop
        }
        return nt;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = null;
    };
  }, [playing]);

  const tt = mode === "before" ? 0 : reduced && !playing ? T_CONTACT + T_AFTER : Math.min(t, T_CONTACT + T_AFTER);
  const after = tt > T_CONTACT;
  const x1 = after ? C - r1 + v1 * k * (tt - T_CONTACT) : C - r1 - spec.u1 * k * (T_CONTACT - tt);
  const x2 = after ? C + r2 + v2 * k * (tt - T_CONTACT) : C + r2 - spec.u2 * k * (T_CONTACT - tt);
  const cv1 = after ? v1 : spec.u1;
  const cv2 = after ? v2 : spec.u2;

  const sym = (v: number) => {
    if (!spec.symbolic) return `${fmt(v)} ${spec.velocityUnit}`;
    const r = v / spec.u1;
    if (Math.abs(r) < 1e-9) return "0";
    if (Math.abs(r - 1) < 1e-9) return spec.velocityUnit;
    return `${fmt(r)}${spec.velocityUnit}`;
  };
  const mass = (m: number) => (spec.symbolic ? spec.massUnit : `${fmt(m)} ${spec.massUnit}`);

  const pBefore = spec.m1 * spec.u1 + spec.m2 * spec.u2;
  const pAfter = spec.m1 * v1 + spec.m2 * v2;
  const keB = 0.5 * spec.m1 * spec.u1 ** 2 + 0.5 * spec.m2 * spec.u2 ** 2;
  const keA = 0.5 * spec.m1 * v1 ** 2 + 0.5 * spec.m2 * v2 ** 2;
  const arrowScale = 46 / Math.max(vmaxBefore, vmaxAfter);

  const kind = spec.e >= 0.999 ? "Perfectly elastic (e = 1)" : spec.e <= 0.001 ? "Perfectly inelastic (e = 0)" : `Partially elastic (e = ${fmt(spec.e)})`;

  return (
    <figure className="overflow-hidden rounded-2xl bg-surface-2" aria-label={`${spec.title ?? "Collision"} diagram`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <figcaption className="t-subhead font-semibold text-ink">{spec.title ?? "Collision"}</figcaption>
        <div className="flex items-center gap-1.5">
          <span className="hidden t-footnote text-muted sm:inline">{mode === "before" ? "Before the collision" : kind}</span>
          {mode === "full" && (
            <>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="pressable rounded-full p-1.5 text-tint hover:bg-fill-4"
                aria-label={playing ? "Pause animation" : "Play animation"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setT(0);
                  setPlaying(true);
                }}
                className="pressable rounded-full p-1.5 text-tint hover:bg-fill-4"
                aria-label="Replay animation"
              >
                <RotateCcw className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Body ${spec.label1} and body ${spec.label2} ${after ? "after" : "before"} the collision`}>
        <defs>
          <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill="var(--teal)" />
          </marker>
          <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill="var(--tint)" />
          </marker>
          <radialGradient id="ball1" cx="35%" cy="35%">
            <stop offset="0" stopColor="#b9b8ff" />
            <stop offset="1" stopColor="#5856d6" />
          </radialGradient>
          <radialGradient id="ball2" cx="35%" cy="35%">
            <stop offset="0" stopColor="#b5f0fb" />
            <stop offset="1" stopColor="#1a9fbd" />
          </radialGradient>
        </defs>
        <line x1="12" x2={W - 12} y1={TRACK_Y + 26} y2={TRACK_Y + 26} stroke="var(--line-strong)" strokeWidth="2" />
        {Array.from({ length: 21 }).map((_, i) => (
          <line key={i} x1={12 + i * 30.8} x2={4 + i * 30.8} y1={TRACK_Y + 27} y2={TRACK_Y + 35} stroke="var(--line)" />
        ))}
        {[
          { x: x1, r: r1, v: cv1, fill: "url(#ball1)", label: spec.label1, m: spec.m1, marker: "arrow-purple", color: "var(--tint)" },
          { x: x2, r: r2, v: cv2, fill: "url(#ball2)", label: spec.label2, m: spec.m2, marker: "arrow-cyan", color: "var(--teal)" },
        ].map((b, i) => {
          const len = b.v * arrowScale;
          const cy = TRACK_Y + 26 - b.r;
          return (
            <g key={i}>
              <circle cx={b.x} cy={cy} r={b.r} fill={b.fill} />
              <text x={b.x} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffffff">
                {b.label.length <= 2 ? b.label : ""}
              </text>
              {Math.abs(len) > 2 && (
                <line x1={b.x} x2={b.x + len} y1={cy - b.r - 14} y2={cy - b.r - 14} stroke={b.color} strokeWidth="3" markerEnd={`url(#${b.marker})`} />
              )}
              <text x={b.x + len / 2} y={cy - b.r - 22} textAnchor="middle" fontSize="12" fill="var(--text)" fontWeight="600">
                {Math.abs(b.v) < 1e-9 ? "at rest" : sym(b.v)}
              </text>
              <text x={b.x} y={TRACK_Y + 48} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {b.label.length > 2 ? b.label : mass(b.m)}
              </text>
            </g>
          );
        })}
        {mode === "full" && (
          <text x={W - 16} y={20} textAnchor="end" fontSize="11" fill="var(--muted)" fontWeight="600" letterSpacing="0.06em">
            {after ? "AFTER" : "BEFORE"}
          </text>
        )}
      </svg>

      {mode === "full" && (
        <div className="grid gap-px bg-line t-footnote sm:grid-cols-2">
          <div className="bg-surface-2 px-4 py-2.5">
            <p className="mb-0.5 font-semibold text-muted">Before → After</p>
            <p className="text-ink">
              {spec.label1}: <span className="font-semibold text-tint">{sym(spec.u1)}</span> → <span className="font-semibold text-tint">{sym(v1)}</span>
              <span className="mx-2 text-faint">·</span>
              {spec.label2}: <span className="font-semibold text-cyan">{sym(spec.u2)}</span> → <span className="font-semibold text-cyan">{sym(v2)}</span>
            </p>
          </div>
          <div className="bg-surface-2 px-4 py-2.5">
            <p className="mb-0.5 font-semibold text-muted">Conservation check</p>
            {spec.symbolic ? (
              <p className="text-ink">
                Momentum {fmt(pBefore)}·{spec.massUnit}{spec.velocityUnit} → {fmt(pAfter)}·{spec.massUnit}{spec.velocityUnit} <span className="text-success">✓</span> · KE{" "}
                {Math.abs(keA - keB) < 1e-9 ? <span className="text-success">conserved ✓</span> : <span className="text-amber">{fmt((1 - keA / keB) * 100)}% lost</span>}
              </p>
            ) : (
              <p className="text-ink">
                p: {fmt(pBefore)} → {fmt(pAfter)} kg·m/s <span className="text-success">✓</span> · KE: {fmt(keB)} → {fmt(keA)} J{" "}
                {Math.abs(keA - keB) < 1e-6 * Math.max(1, keB) ? <span className="text-success">✓</span> : <span className="text-amber">({fmt(keB - keA)} J lost)</span>}
              </p>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}
