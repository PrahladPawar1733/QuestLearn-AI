import { cn } from "@/lib/cn";

/**
 * Every chart on this screen is wrapped in one of these.
 *
 * Three accessibility rules, enforced by construction rather than by review:
 *   1. The plot itself is `aria-hidden` — recharts' SVG is decoration, not content.
 *   2. A one-sentence `summary` always sits under the plot as a visible caption,
 *      so the meaning survives with no colour vision and no images.
 *   3. A real data table is always in the DOM behind "Show the numbers", so every
 *      value is readable as text. A chart that only works in colour is not shipped.
 */
export function ChartFigure({
  summary,
  children,
  table,
  tableLabel = "Show the numbers",
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  table?: React.ReactNode;
  tableLabel?: string;
  className?: string;
}) {
  return (
    <figure className={cn("m-0", className)}>
      <div aria-hidden>{children}</div>
      <figcaption className="mt-2 t-footnote text-muted">{summary}</figcaption>
      {table && (
        <details className="mt-2">
          <summary className="w-fit cursor-pointer rounded-lg t-footnote font-semibold text-tint">{tableLabel}</summary>
          <div className="mt-2 -mx-1 overflow-x-auto px-1">{table}</div>
        </details>
      )}
    </figure>
  );
}

/** Shared table styling for the text alternative under a chart. */
export function DataTable({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full t-footnote">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-muted">
          {head.map((h) => (
            <th key={h} scope="col" className="whitespace-nowrap pb-1.5 pr-3 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line text-ink">{children}</tbody>
    </table>
  );
}

/**
 * One concept's mastery history as a small multiple.
 *
 * Deliberately not a multi-series line chart: eight concepts would need eight
 * hues, and the palette validated for this app has two. Small multiples keep one
 * series colour and stay readable at 360 px.
 *
 * The dashed guide is the next band's threshold, so the gap is visible as a
 * distance rather than only as a number. Shape (dashed vs solid) carries that
 * distinction, never colour alone.
 *
 * It is `aria-hidden`: callers must render `trendSummary(points)` next to it,
 * which states the same movement in words. Nothing here is the only copy of a fact.
 */
export function Sparkline({ points, threshold, height = 32 }: { points: { score: number }[]; threshold?: number | null; height?: number }) {
  if (points.length < 2) return null;
  const W = 100;
  const pad = 4;
  const y = (v: number) => pad + (1 - Math.max(0, Math.min(100, v)) / 100) * (height - pad * 2);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.score).toFixed(2)}`).join(" ");
  const lastX = W;
  const lastY = y(points[points.length - 1].score);
  // The plot is stretched horizontally (preserveAspectRatio="none"), so every
  // mark uses non-scaling strokes and the end marker is a round-capped stub
  // rather than a circle — a circle would come out as an ellipse.
  const dot = (w: number, color: string) => (
    <line x1={lastX - 0.01} x2={lastX} y1={lastY} y2={lastY} stroke={color} strokeWidth={w} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  );
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden focusable="false">
      {threshold != null && (
        <line
          x1={0}
          x2={W}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--line-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={path} fill="none" stroke="var(--tint)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {/* 2 px surface ring so the end marker stays legible where it crosses the guide. */}
      {dot(9, "var(--surface)")}
      {dot(5, "var(--tint)")}
    </svg>
  );
}
