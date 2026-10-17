"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { fade } from "@/lib/motion";


export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

/** Enters from the top and leaves the way it came. One at a time. */
export function AchievementToasts({ items, onDone }: { items: Achievement[]; onDone: (id: string) => void }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => onDone(items[0].id), 4200);
    return () => clearTimeout(t);
  }, [items, onDone]);
  const a = items[0];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4" aria-live="assertive">
      <AnimatePresence>
        {a && (
          <motion.div
            key={a.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.9, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.9, filter: "blur(6px)" }}
            transition={reduced ? fade : undefined}
            className="material-thick pointer-events-auto rounded-xl px-4 py-2.5"
          >
            <p className="t-caption text-muted">Achievement</p>
            <p className="t-subhead font-medium text-ink">{a.title}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
