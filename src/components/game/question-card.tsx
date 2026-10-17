"use client";

import { Lightbulb } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { RichText } from "@/components/math/rich-text";
import { Badge } from "@/components/ui/badge";
import { OriginBadge } from "@/components/ui/origin-badge";
import { Visual } from "@/components/viz/visual";
import type { PublicQuestion } from "@/lib/types";

const CAT: Record<string, string> = { understanding: "Concept", application: "Application", numerical: "Numerical", reasoning: "Reasoning" };
const DIFF: Record<string, { label: string; tone: "success" | "cyan" | "danger" }> = {
  easy: { label: "Easy", tone: "success" },
  medium: { label: "Medium", tone: "cyan" },
  hard: { label: "Hard", tone: "danger" },
};

export function QuestionCard({ q, hint, settled }: { q: PublicQuestion; hint?: string; settled: boolean }) {
  return (
    <section aria-labelledby="question-text" className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {q.conceptTitle && <Badge tone="primary">{q.conceptTitle}</Badge>}
        <Badge>{CAT[q.category] ?? q.category}</Badge>
        <Badge tone={DIFF[q.difficulty].tone}>{DIFF[q.difficulty].label}</Badge>
        <OriginBadge origin={q.origin} className="ml-auto" />
      </div>
      <h2 id="question-text" className="t-title3 text-ink sm:t-title2">
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
            <div className="flex gap-3 rounded-2xl bg-amber-fill/12 p-3.5 t-callout text-ink" role="note">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber" />
              <RichText text={hint} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
