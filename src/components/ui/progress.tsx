import { cn } from "@/lib/cn";

/** Solid-tint progress track (no decorative gradients). */
export function Progress({
  value,
  className,
  barClassName,
  label,
  tone = "tint",
}: {
  value: number; // 0..100
  className?: string;
  barClassName?: string;
  label?: string;
  tone?: "tint" | "success" | "amber" | "danger";
}) {
  const v = Math.max(0, Math.min(100, value));
  const color = { tint: "bg-brand", success: "bg-success-fill", amber: "bg-amber-fill", danger: "bg-danger-fill" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-fill-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", color, barClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Pick a tone from a mastery percentage. */
export function masteryTone(m: number): "success" | "tint" | "amber" {
  return m >= 70 ? "success" : m >= 45 ? "tint" : "amber";
}
