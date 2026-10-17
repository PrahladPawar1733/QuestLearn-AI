"use client";

import type { CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Colors are semantic CSS variables, so the charts follow light/dark with the rest of the UI.
 * Series validated with the dataviz palette checker (validate_palette.js) in both modes:
 *   light, surface #ffffff: #5856d6 + var(--chart-2) -> all checks pass (CVD ΔE 18.1, contrast >= 3:1)
 *   dark,  surface #1c1c1e: #7d7aff + var(--chart-2) -> all checks pass (CVD ΔE 13.9; tritan 6.0 relieved by legend + direct labels)
 * SERIES_1 is the app tint (#5856d6 light / #7d7aff dark). SERIES_2 is one teal step that passes in both modes.
 * Text never wears a series color: labels, ticks and tooltips use text tokens.
 */
const SERIES_1 = "var(--tint)";
const SERIES_2 = "var(--chart-2)";
const AXIS = "var(--muted)";
const INK = "var(--text)";
const GRID = "var(--line)";
const SURFACE = "var(--surface)";

const tooltipContent: CSSProperties = {
  background: "var(--material-thick)",
  WebkitBackdropFilter: "blur(40px) saturate(180%)",
  backdropFilter: "blur(40px) saturate(180%)",
  border: "none",
  borderRadius: 12,
  boxShadow: "var(--shadow-float)",
  color: INK,
  fontSize: 13,
  padding: "8px 12px",
};

const tooltipStyle = {
  contentStyle: tooltipContent,
  labelStyle: { color: AXIS, fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: INK, padding: 0 },
  cursor: { stroke: GRID, fill: "var(--fill-4)" },
};

const tick = { fill: AXIS, fontSize: 12 };

export function AccuracyChart({ data }: { data: { run: number; label: string; accuracy: number }[] }) {
  return (
    <div className="h-52 w-full sm:h-60">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="run" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => `#${v}`} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, "Accuracy"]} labelFormatter={(_l, p) => (p?.[0]?.payload as { label?: string })?.label ?? ""} />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke={SERIES_1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SubjectChart({ data }: { data: { subject: string; mastery: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(120, data.length * 52) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" domain={[0, 100]} hide />
          {/* 88 px of label + 44 px of value label still leaves a readable track at 360 px. */}
          <YAxis type="category" dataKey="subject" tick={{ fill: INK, fontSize: 13 }} tickLine={false} axisLine={false} width={88} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, "Mastery"]} />
          <Bar dataKey="mastery" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey="mastery" position="right" formatter={(v) => `${v}%`} fill={INK} fontSize={12} fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ImprovementChart({ data }: { data: { title: string; before: number | null; after: number | null }[] }) {
  const rows = data.map((d) => ({ ...d, before: d.before ?? 0, after: d.after ?? 0 }));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 t-footnote text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: SERIES_1 }} /> Before the lesson
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: SERIES_2 }} /> From the follow-up onwards
        </span>
      </div>
      <div className="w-full" style={{ height: Math.max(140, rows.length * 70) }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 0 }} barGap={2} barCategoryGap={14}>
            <XAxis type="number" domain={[0, 100]} hide />
            {/* Concept titles are long; truncate the tick and let the data table carry the full name. */}
            <YAxis
              type="category"
              dataKey="title"
              tick={{ fill: INK, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={96}
              tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
            />
            <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v}%`, n === "before" ? "Before the lesson" : "From the follow-up onwards"]} />
            <Bar dataKey="before" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={16}>
              <LabelList dataKey="before" position="right" formatter={(v) => `${v}%`} fill={AXIS} fontSize={11} />
            </Bar>
            <Bar dataKey="after" fill={SERIES_2} radius={[0, 4, 4, 0]} maxBarSize={16}>
              <LabelList dataKey="after" position="right" formatter={(v) => `${v}%`} fill={INK} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
