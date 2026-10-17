"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { RichText } from "@/components/math/rich-text";
import { Button } from "@/components/ui/button";
import { Visual } from "@/components/viz/visual";
import type { AnswerResult } from "@/lib/services/play";

/** Title row + primary action. Used inline (desktop) and as the sheet header (phone). */
export function FeedbackHeader({ result, onContinue, busy }: { result: AnswerResult; onContinue: () => void; busy: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  // Focus for keyboard users without scrolling away from the world's reaction.
  useEffect(() => btn.current?.focus({ preventScroll: true }), []);
  return (
    <div className="flex items-center gap-3 px-5 pb-4 pt-2">
      <motion.span
        initial={reduced ? false : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-fill text-white"
        aria-hidden
      >
        <Check className="size-4" strokeWidth={3} />
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="t-headline text-ink">{result.isFollowUp ? "Mistake fixed" : "Correct"}</p>
        <p className="truncate t-footnote text-muted" title={result.xpBreakdown.map((b) => `${b.label} ${b.xp > 0 ? "+" : ""}${b.xp}`).join(" · ")}>
          +{result.xpAwarded} XP
        </p>
      </div>
      <Button ref={btn} onClick={onContinue} disabled={busy}>
        Continue <ArrowRight />
      </Button>
    </div>
  );
}

export function FeedbackBody({ result }: { result: AnswerResult }) {
  return (
    <div className="space-y-4 px-5 pb-5">
      <RichText as="p" text={result.explanation} className="t-body text-ink" />
      {result.visual && <Visual spec={result.visual} />}
      <MasteryChange m={result.mastery} />
    </div>
  );
}

export function MasteryChange({ m }: { m: AnswerResult["mastery"] }) {
  const delta = m.after - m.before;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 t-subhead">
      <span className="text-muted">{m.conceptTitle}</span>
      <span className="text-ink tabular">
        {m.before}% → {m.after}%
      </span>
      <span className={delta >= 0 ? "text-success tabular" : "text-amber tabular"}>{delta >= 0 ? `+${delta}` : delta}</span>
      <span className="ml-auto t-footnote text-muted">
        {m.label} · {m.attempts} attempt{m.attempts === 1 ? "" : "s"}
      </span>
    </div>
  );
}
