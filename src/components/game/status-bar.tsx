"use client";

import { Pause } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Floating status bar (translucent material). Answers: where am I (quest + question),
 * how am I doing (XP, streak), and how do I get out (pause).
 */
export function StatusBar({
  title,
  index,
  total,
  outcomes,
  xp,
  xpGain,
  streak,
  onPause,
  isFollowUp,
  pauseRef,
}: {
  title: string;
  index: number;
  total: number;
  outcomes: ("correct" | "wrong")[];
  xp: number;
  xpGain: number | null;
  streak: number;
  onPause: () => void;
  isFollowUp: boolean;
  pauseRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <div className="material-chrome sticky top-16 z-30 rounded-2xl px-3 py-2.5 shadow-[var(--shadow-card)] ring-1 ring-line sm:px-4">
      <div className="flex items-center gap-3">
        <button
          ref={pauseRef}
          type="button"
          onClick={onPause}
          className="pressable flex size-9 shrink-0 items-center justify-center rounded-xl bg-fill-3 text-ink hover:bg-fill-2"
          aria-label="Pause quest"
        >
          <Pause className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate t-subhead font-semibold text-ink">{title}</p>
            <p className="shrink-0 t-footnote text-muted tabular">
              {isFollowUp ? (
                <span className="text-ink">Follow-up</span>
              ) : (
                <>
                  {Math.min(index, total)} of {total}
                </>
              )}
            </p>
          </div>
          {/* One segment per question */}
          <div className="mt-2 flex gap-[3px]" aria-label={`${outcomes.length} of ${total} questions answered`}>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  outcomes[i] === "correct" && "bg-success-fill",
                  outcomes[i] === "wrong" && "bg-danger-fill",
                  !outcomes[i] && i === outcomes.length && "bg-brand",
                  !outcomes[i] && i !== outcomes.length && "bg-fill-2",
                )}
              />
            ))}
          </div>
        </div>
        <div className="relative hidden shrink-0 items-center gap-1.5 sm:flex" aria-live="polite">
          {streak >= 2 && (
            <span className="rounded-full bg-amber-fill/14 px-2.5 py-1 font-rounded t-footnote font-bold text-amber tabular" title="Correct answers in a row">
              🔥 {streak}
            </span>
          )}
          <span className="rounded-full bg-tint/10 px-2.5 py-1 font-rounded t-footnote font-bold text-tint tabular" aria-label={`${xp} XP`}>
            {xp} XP
          </span>
          <AnimatePresence>
            {xpGain ? (
              <motion.span
                key={xp}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: -16 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="pointer-events-none absolute right-0 top-0 t-footnote font-medium text-success"
              >
                +{xpGain}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
