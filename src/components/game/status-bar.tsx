"use client";

import { Flame, Pause, Star } from "lucide-react";
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
    <div className="material-chrome sticky top-[3.75rem] z-30 rounded-[1.25rem] px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        <button
          ref={pauseRef}
          type="button"
          onClick={onPause}
          className="pressable flex size-9 shrink-0 items-center justify-center rounded-full bg-fill-3 text-ink"
          aria-label="Pause quest"
        >
          <Pause className="size-4" fill="currentColor" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate t-subhead font-semibold text-ink">{title}</p>
            <p className="shrink-0 t-footnote text-muted tabular">
              {isFollowUp ? (
                <span className="font-semibold text-amber">Follow-up</span>
              ) : (
                <>
                  <span className="font-semibold text-ink">{Math.min(index, total)}</span> of {total}
                </>
              )}
            </p>
          </div>
          {/* One capsule per question: the quest's checkpoints */}
          <div className="mt-1.5 flex gap-[3px]" aria-label={`${outcomes.length} of ${total} questions answered`}>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  outcomes[i] === "correct" && "bg-success-fill",
                  outcomes[i] === "wrong" && "bg-amber-fill",
                  !outcomes[i] && i === outcomes.length && "bg-tint",
                  !outcomes[i] && i !== outcomes.length && "bg-fill-2",
                )}
              />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div
            className={cn("hidden items-center gap-1 rounded-full px-2.5 py-1 font-rounded t-subhead font-semibold tabular sm:flex", streak >= 2 ? "bg-amber-fill/15 text-amber" : "bg-fill-4 text-faint")}
            title="Correct answers in a row"
            aria-label={`Streak ${streak}`}
          >
            <Flame className="size-4" fill={streak >= 2 ? "currentColor" : "none"} /> {streak}
          </div>
          <div className="relative flex items-center gap-1 rounded-full bg-tint/14 px-2.5 py-1 font-rounded t-subhead font-semibold text-tint tabular" aria-live="polite" aria-label={`${xp} XP`}>
            <Star className="size-4" fill="currentColor" /> {xp}
            <AnimatePresence>
              {xpGain ? (
                <motion.span
                  key={xp}
                  initial={{ opacity: 0, y: 4, scale: 0.9 }}
                  animate={{ opacity: 1, y: -22, scale: 1 }}
                  exit={{ opacity: 0, y: -28 }}
                  className="pointer-events-none absolute right-1 top-0 font-rounded t-subhead font-bold text-success"
                >
                  +{xpGain}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
