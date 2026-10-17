"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SpiderEngine } from "@/components/games/spider-climb/engine.js";

// The game's own palette (spider-climb/hud.tsx), so this reads as a still of the real thing.
const MINT = "#c3f18c";
const PAPER = "#eef1e9";
const MUTED = "#93a0b9";
const LINE = "#293245";

const OPTIONS = [
  { id: "A", text: "1.5 kg·m/s" },
  { id: "B", text: "6.0 kg·m/s" },
  { id: "C", text: "9.0 kg·m/s" },
  { id: "D", text: "0.67 kg·m/s" },
];

/**
 * Landing visual: the actual Spider Climb engine running in its attract mode (the hero runs the
 * first rooftop on a loop), framed by the game's own HUD. Paused off-screen; a single still frame
 * when the visitor prefers reduced motion.
 */
export function SpiderHero({ href }: { href: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [building, setBuilding] = useState(1);
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    // Real play with a scripted player: run to the gap, pause on the anchors, take B, swing, repeat.
    const bank = Array.from({ length: 8 }, () => ({ question: "", options: OPTIONS.map((o) => o.text), correct: 1, explain: "" }));
    let lastPhase = "";
    const engine = new SpiderEngine({
      canvas: cv,
      chapters: [{ cls: "", title: "", color: "#ffd23f", q: bank }],
      onState: (st: { phase: string; screen: string; qi: number }) => {
        if (st.phase === lastPhase) return;
        lastPhase = st.phase;
        setBuilding(st.qi + 1);
        if (st.phase !== "resolving") setPicked(false);
        if (st.phase === "question") {
          if (reduced) return later(() => engine.unmount(), 300);
          later(() => {
            engine.choose(1);
            setPicked(true);
            later(() => engine.resolveChoice(true), 450);
          }, 1800);
        }
      },
    });
    engine.sfx = () => {}; // silent on a landing page
    engine.mount();
    engine.start(0);
    const watchdog = window.setInterval(() => engine.won && engine.start(0), 2000);

    let running = true;
    const io = new IntersectionObserver(([e]) => {
      if (reduced) return;
      if (e.isIntersecting && !running) {
        engine.last = performance.now();
        engine.raf = requestAnimationFrame(engine.frame);
        running = true;
      } else if (!e.isIntersecting && running) {
        engine.unmount();
        running = false;
      }
    });
    io.observe(cv);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      clearInterval(watchdog);
      engine.unmount();
    };
  }, []);

  return (
    <figure className="overflow-hidden rounded-2xl bg-[#0a1020] p-4 sm:p-5" style={{ color: PAPER, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="block text-[10px] font-extrabold uppercase tracking-[2.3px]" style={{ color: MINT }}>
            Physics · Collisions
          </span>
          <p className="mt-1 text-[15px] font-bold tabular-nums">Building {building} of 8</p>
        </div>
        <dl className="flex gap-4 text-right">
          {[
            ["Health", "●●●"],
            ["Score", "0"],
            ["Streak", "0"],
          ].map(([l, v]) => (
            <div key={l}>
              <dt className="text-[9px] uppercase tracking-[1.6px]" style={{ color: MUTED }}>
                {l}
              </dt>
              <dd className="text-[15px] font-bold" style={{ color: l === "Health" ? "#ff8e93" : PAPER }}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-[14px]" style={{ border: "1px solid #37435a" }}>
        <canvas ref={canvas} className="block aspect-[16/9] w-full" role="img" aria-label="Spider Climb: at each gap the hero shoots a web at the lettered anchor of the right answer and swings across" />
      </div>

      <figcaption className="pt-4">
        <span className="block text-[10px] font-extrabold uppercase tracking-[2.3px]" style={{ color: MINT }}>
          Momentum
        </span>
        <p className="mt-2 text-[16px] font-bold leading-[1.4] sm:text-[18px]">A 2 kg cart moves at 3 m/s. What is its momentum?</p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-2.5 rounded-[10px] p-2.5 text-[13px] font-bold transition-colors duration-200"
              style={{ border: `1px solid ${picked && o.id === "B" ? MINT : LINE}`, background: picked && o.id === "B" ? "#1d2a1f" : "#151e30" }}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[11px] font-extrabold" style={{ background: "#222d45", color: MINT }}>
                {o.id}
              </span>
              {o.text}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px]" style={{ color: MUTED }}>
            Your answer picks the web anchor. A wrong one snaps.
          </p>
          <Link href={href} className="shrink-0 rounded-[10px] px-4 py-2.5 text-[13px] font-extrabold" style={{ background: MINT, color: "#172314" }}>
            Play Spider Climb
          </Link>
        </div>
      </figcaption>
    </figure>
  );
}
