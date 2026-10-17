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
    <div className="material-chrome sticky top-14 z-30 -mx-4 border-b border-line px-4 py-3 sm:mx-0 sm:rounded-xl sm:border sm:px-4">
      <div className="flex items-center gap-3">
        <button
          ref={pauseRef}
          type="button"
          onClick={onPause}
          className="pressable -ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-fill-4 hover:text-ink"
          aria-label="Pause quest"
        >
          <Pause className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate t-subhead font-medium text-ink">{title}</p>
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
                  "h-[3px] flex-1 rounded-full transition-colors duration-300",
                  outcomes[i] === "correct" && "bg-tint",
                  outcomes[i] === "wrong" && "bg-danger-fill",
                  !outcomes[i] && i === outcomes.length && "bg-tint/35",
                  !outcomes[i] && i !== outcomes.length && "bg-fill-2",
                )}
              />
            ))}
          </div>
        </div>
        <div className="relative hidden shrink-0 t-footnote text-muted tabular sm:block" aria-live="polite">
          {streak >= 2 && <span title="Correct answers in a row">{streak} in a row · </span>}
          <span aria-label={`${xp} XP`}>{xp} XP</span>
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
