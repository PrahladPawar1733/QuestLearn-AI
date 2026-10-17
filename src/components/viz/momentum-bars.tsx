import type { MomentumBarsVisual } from "@/lib/types";

function fmt(n: number) {
  return String(Number(n.toPrecision(3)));
}

/**
 * Signed momentum bars around a zero line: right = positive direction.
 * Values sit just past the bar end in label color (never in the series color).
 */
export function MomentumBars({ spec }: { spec: MomentumBarsVisual }) {
  const max = Math.max(...spec.items.map((i) => Math.abs(i.value)), 1e-6);
  return (
    <figure className="overflow-hidden rounded-2xl bg-surface-2">
      <figcaption className="flex items-center justify-between px-4 pt-3 t-subhead font-semibold text-ink">
        <span>{spec.title ?? "Momentum"}</span>
        <span className="t-footnote font-normal text-muted">← negative · positive →</span>
      </figcaption>
      <div className="space-y-2.5 px-4 pb-4 pt-3">
        {spec.items.map((it, i) => {
          // Leave room for the value label on each side.
          const pct = (Math.abs(it.value) / max) * 16;
          const pos = it.value >= 0;
          return (
            <div key={i} className="grid grid-cols-[minmax(64px,112px)_1fr] items-center gap-3">
              <span className="truncate t-footnote text-muted">{it.label}</span>
              <div className="relative h-7 rounded-lg bg-fill-4">
                <div className="absolute inset-y-1.5 left-1/2 w-px bg-line-strong" />
                <div className={`absolute inset-y-1.5 rounded-[5px] ${pos ? "bg-teal" : "bg-tint"}`} style={pos ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }} />
                <span
                  className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap t-caption font-semibold text-ink tabular"
                  style={pos ? { left: `calc(50% + ${pct}% + 6px)` } : { right: `calc(50% + ${pct}% + 6px)` }}
                >
                  {fmt(it.value)} {it.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
