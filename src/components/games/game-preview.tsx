"use client";

/**
 * Card art for the game chooser.
 *
 * A flat SVG per game, drawn in that game's own palette so the card reads as
 * the game before a student clicks it. These were blank gradients, which told
 * a student nothing and made the chooser look unfinished.
 *
 * Deliberately not a live canvas: the chooser would then boot a game engine
 * per card just to draw a thumbnail, and a student browsing chapters should
 * not be running game loops.
 */
import type { GameId } from "@/lib/game/types";

export function GamePreview({ id }: { id: GameId }) {
  // Wrapped so the <text> inside these SVGs (option letters, the "?" sign)
  // can never be scraped into a control's accessible name.
  const art = id === "spider-climb" ? <SpiderPreview /> : id === "force-rush" ? <ForcePreview /> : null;
  return (
    <div aria-hidden="true" role="presentation" className="h-full w-full">
      {art ?? <div className="h-full w-full bg-[#141a2b]" />}
    </div>
  );
}

/** Night skyline, moon, and the four lettered anchors you shoot a web at. */
function SpiderPreview() {
  return (
    <svg viewBox="0 0 320 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#090f22" />
          <stop offset="0.6" stopColor="#26334f" />
          <stop offset="1" stopColor="#d28b83" />
        </linearGradient>
        <radialGradient id="sc-moon">
          <stop offset="0" stopColor="#fff2c4" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="128" fill="url(#sc-sky)" />
      <circle cx="258" cy="34" r="40" fill="url(#sc-moon)" />
      <circle cx="258" cy="34" r="13" fill="#fff2c4" />
      {[18, 52, 96, 150, 206, 250, 292].map((x, i) => (
        <rect key={x} x={x} y={74 - (i % 3) * 13} width={26} height={70} fill={i % 2 ? "#1b1b4f" : "#161641"} />
      ))}
      {/* the player's rooftop */}
      <rect x="6" y="92" width="80" height="40" fill="#26334f" />
      {[12, 26, 40, 54, 68].map((x) => (
        <rect key={x} x={x} y={99} width={6} height={8} fill="rgba(255,210,63,0.75)" />
      ))}
      {/* anchors, in the original's badge colours */}
      {[
        { x: 120, y: 44, c: "#e0242b", l: "A" },
        { x: 160, y: 30, c: "#2f6fd6", l: "B" },
        { x: 196, y: 52, c: "#ffa62b", l: "C" },
        { x: 232, y: 38, c: "#8f5bff", l: "D" },
      ].map((a) => (
        <g key={a.l}>
          <line x1="78" y1="88" x2={a.x} y2={a.y} stroke="#eef1e9" strokeOpacity="0.28" strokeDasharray="3 4" />
          <rect x={a.x - 8} y={a.y - 8} width="16" height="16" rx="4" fill={a.c} />
          <text x={a.x} y={a.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
            {a.l}
          </text>
        </g>
      ))}
      <circle cx="76" cy="88" r="4" fill="#f0525c" />
    </svg>
  );
}

/** A road with a barrier across it: the obstacle that only an answer opens. */
function ForcePreview() {
  return (
    <svg viewBox="0 0 320 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="fr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1020" />
          <stop offset="1" stopColor="#3a2a4a" />
        </linearGradient>
      </defs>
      <rect width="320" height="128" fill="url(#fr-sky)" />
      <rect y="86" width="320" height="42" fill="#2a2b33" />
      <rect y="86" width="320" height="3" fill="#54566a" />
      {[10, 60, 110, 160, 210, 260, 310].map((x) => (
        <rect key={x} x={x} y={106} width={26} height={4} fill="rgba(242,242,244,0.7)" />
      ))}
      {/* warning sign */}
      <g>
        <rect x="168" y="44" width="22" height="16" rx="3" fill="#ffd166" />
        <text x="179" y="56" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1d1e26">
          ?
        </text>
        <rect x="177" y="60" width="3" height="22" fill="#54566a" />
      </g>
      {/* the barrier */}
      <rect x="214" y="52" width="10" height="42" fill="#c8503c" />
      <rect x="234" y="52" width="10" height="42" fill="#c8503c" />
      <rect x="210" y="46" width="38" height="8" rx="2" fill="#54566a" />
      {/* the car */}
      <g>
        <path d="M70 94 l6-13 h18 l8-9 h14 l8 9 h6 l3 13 Z" fill="#3f6fd8" />
        <rect x="100" y="76" width="13" height="8" fill="#9fc2ff" />
        <circle cx="84" cy="96" r="6" fill="#15161c" />
        <circle cx="116" cy="96" r="6" fill="#15161c" />
      </g>
    </svg>
  );
}
