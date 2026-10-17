"use client";

import { AnimatePresence, motion } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { OriginBadge } from "@/components/ui/origin-badge";
import { Visual } from "@/components/viz/visual";
import type { PublicQuestion } from "@/lib/types";

const DIFF: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export function QuestionCard({ q, hint, settled }: { q: PublicQuestion; hint?: string; settled: boolean }) {
  return (
    <section aria-labelledby="question-text" className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-caption text-muted">
        <span>{[q.conceptTitle, DIFF[q.difficulty]].filter(Boolean).join(" · ")}</span>
        <OriginBadge origin={q.origin} className="ml-auto text-faint" />
      </div>
      <h2 id="question-text" className="t-title3 font-medium text-ink sm:t-title2 sm:font-medium">
        <RichText text={q.text} />
      </h2>
      {q.visual && !settled && <Visual spec={q.visual} mode="before" />}
      <AnimatePresence initial={false}>
        {hint && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-surface-2 p-3.5 t-callout text-ink" role="note">
              <span className="mr-1.5 font-medium">Hint.</span>
              <RichText text={hint} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
