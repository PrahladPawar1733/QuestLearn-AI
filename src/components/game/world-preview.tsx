import type { GameWorld } from "@/lib/types";

/**
 * Small decorative scene thumbnails for the world picker. Flat shapes in
 * system colors; neutrals use tokens so they read on light and dark tiles.
 */
export function WorldPreview({ world }: { world: GameWorld }) {
  const common = { viewBox: "0 0 200 80", className: "h-full w-full", "aria-hidden": true } as const;
  switch (world) {
    case "balloons":
      return (
        <svg {...common}>
          {[52, 84, 116, 148].map((x, i) => {
            const cy = 28 + (i % 2) * 6;
            return (
              <g key={x}>
                <path d={`M${x} ${cy + 16} Q${x + 3} ${cy + 26} ${x} ${cy + 38}`} fill="none" strokeWidth="1" className="stroke-faint" />
                <ellipse cx={x} cy={cy} rx="12" ry="15" fill={["#ff375f", "#ff9f0a", "#bf5af2", "#30b0c7"][i]} />
                <ellipse cx={x - 4} cy={cy - 6} rx="3" ry="5" fill="#ffffff" opacity="0.35" transform={`rotate(-20 ${x - 4} ${cy - 6})`} />
              </g>
            );
          })}
        </svg>
      );
    case "rocket":
      return (
        <svg {...common}>
          <path d="M88 26 C88 16 94 9 100 4 C106 9 112 16 112 26 Z" fill="#f2f2f7" className="stroke-line" strokeWidth="1" />
          <rect x="88" y="27" width="24" height="15" rx="3" fill="#7d7aff" />
          <rect x="88" y="43" width="24" height="15" rx="3" fill="#5856d6" />
          <path d="M82 58 H118 L122 66 H78 Z" fill="#ff375f" />
          <path d="M95 66 C95 72 100 77 100 77 C100 77 105 72 105 66 Z" fill="#ff9f0a" />
          {[
            [30, 18], [52, 50], [150, 22], [172, 54], [136, 64], [64, 14],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" className="fill-faint" />
          ))}
        </svg>
      );
    case "maze":
      return (
        <svg {...common}>
          <path d="M15 60 H60 V25 H110 V55 H160 V20 H190" fill="none" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" className="stroke-fill-3" />
          <path d="M15 60 H60 V25 H85" fill="none" stroke="#30d158" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {[60, 110, 160].map((x, i) => (
            <rect key={x} x={x - 6} y={i === 1 ? 49 : i === 0 ? 19 : 14} width="12" height="12" rx="3" fill={i === 0 ? "#30d158" : undefined} className={i === 0 ? undefined : "fill-fill"} />
          ))}
          <circle cx="88" cy="25" r="6" fill="#0a84ff" stroke="#ffffff" strokeWidth="2" />
        </svg>
      );
    case "bubbles":
      return (
        <svg {...common}>
          <rect x="30" y="8" width="140" height="66" rx="12" className="fill-surface/50" />
          <rect x="30" y="30" width="140" height="44" rx="12" fill="#40cbe0" opacity="0.2" />
          {[
            [62, 48, 12, "#40cbe0"],
            [100, 32, 15, "#5856d6"],
            [140, 50, 11, "#40cbe0"],
            [82, 20, 7, "#40cbe0"],
          ].map(([x, y, r, c], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill={i === 1 ? (c as string) : "#ffffff"} fillOpacity={i === 1 ? 1 : 0.7} stroke={c as string} strokeWidth="2" />
              <circle cx={(x as number) - (r as number) * 0.35} cy={(y as number) - (r as number) * 0.35} r={(r as number) * 0.22} fill="#ffffff" opacity="0.6" />
            </g>
          ))}
        </svg>
      );
    case "castle":
      return (
        <svg {...common}>
          <path d="M20 70 V30 H30 V22 H40 V30 H50 V22 H60 V30 H70 V70 Z" fill="#5856d6" />
          <path d="M39 70 V58 A6 6 0 0 1 51 58 V70 Z" fill="#ffffff" opacity="0.35" />
          <circle cx="96" cy="46" r="5" fill="#ffd60a" />
          <path d="M140 70 C140 56 148 50 160 50 C172 50 180 56 180 70 Z" fill="#bf5af2" />
          <circle cx="154" cy="60" r="2" fill="#1c1c1e" />
          <circle cx="166" cy="60" r="2" fill="#1c1c1e" />
          <rect x="10" y="70" width="180" height="3" rx="1.5" className="fill-fill" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={30 + (i % 2) * 74}
              y={12 + Math.floor(i / 2) * 32}
              width="66"
              height="24"
              rx="8"
              fill={i === 1 ? "#5856d6" : undefined}
              className={i === 1 ? undefined : "fill-surface/70"}
            />
          ))}
        </svg>
      );
  }
}
