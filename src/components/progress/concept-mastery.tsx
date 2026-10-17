import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { masteryTone, Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import type { MasteryResult } from "@/lib/types";
import { Sparkline } from "./chart-frame";
import {
  hasTrend,
  humanizeMisconception,
  lastPractisedLabel,
  masteryTimeline,
  MIN_TREND_POINTS,
  nextStepSentence,
  projectMastery,
  requirementFor,
  trendSummary,
} from "./mastery-math";
import { PracticeNow } from "./practice-now";
import { labelTone } from "./run-story";

/** Everything the card needs. Shaped like the stored `ConceptMastery` row. */
export interface ConceptMasteryInput {
  conceptId: string;
  conceptTitle: string;
  subject: string;
  questId: string;
  attempts: number;
  correctAttempts: number;
  followUpAttempts: number;
  followUpCorrect: number;
  recentResults: MasteryResult[];
  misconceptions: Record<string, number>;
  lastPracticedAt: string;
}

/**
 * A concept's mastery, explained.
 *
 * The number is never presented alone: the band, the attempt count, the date,
 * the exact thing that would move it, and the recurring slip all sit beside it.
 * Everything numeric comes out of `mastery-math`, which runs the published
 * formula — nothing here estimates.
 */
export function ConceptMasteryCard({ concept, now, className }: { concept: ConceptMasteryInput; now: number; className?: string }) {
  const p = projectMastery({ attempts: concept.attempts, recentResults: concept.recentResults });
  const timeline = masteryTimeline(concept.recentResults, concept.attempts);
  const trend = hasTrend(timeline);
  const targetReq = p.target ? requirementFor(p.target) : null;
  const slips = Object.entries(concept.misconceptions ?? {}).sort((a, b) => b[1] - a[1]);
  const topSlip = slips[0];
  const href = `/learn/${encodeURIComponent(concept.conceptId)}`;

  return (
    <div className={cn("rounded-2xl bg-surface-2 p-4", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link href={href} className="min-w-0 t-headline text-ink hover:text-tint">
          {concept.conceptTitle}
        </Link>
        <Badge tone={labelTone(p.label)} className="shrink-0">
          {p.label}
        </Badge>
        <span className="ml-auto font-rounded t-title3 text-ink tabular">{concept.attempts === 0 ? "—" : `${p.score}%`}</span>
      </div>

      {concept.attempts > 0 && (
        <Progress value={p.score} tone={masteryTone(p.score)} className="mt-2.5" label={`${concept.conceptTitle} mastery ${p.score} per cent`} />
      )}

      <p className="mt-2 t-footnote text-muted tabular">
        {concept.subject} · {concept.correctAttempts}/{concept.attempts} correct
        {concept.followUpAttempts > 0 && ` · ${concept.followUpCorrect}/${concept.followUpAttempts} fixed after a miss`} ·{" "}
        {lastPractisedLabel(concept.lastPracticedAt, now)}
      </p>

      {/* Trend: drawn only once there are enough recomputed points to mean anything. */}
      {trend ? (
        <div className="mt-3">
          <Sparkline points={timeline} threshold={targetReq?.min ?? null} />
          <p className="mt-1 t-caption text-muted">
            {trendSummary(timeline)}
            {targetReq ? ` Dashed line: ${targetReq.min}% for ${p.target}.` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-3 t-caption text-muted">
          {concept.attempts === 0
            ? "Not practised yet."
            : `Not enough practice yet to show a trend — ${concept.attempts} of ${MIN_TREND_POINTS} answers needed.`}
        </p>
      )}

      {/* The thing a student can act on. */}
      <p className="mt-3 rounded-xl bg-surface px-3 py-2 t-footnote text-ink">
        <span className="t-eyebrow mr-1.5 text-tint">Next</span>
        {nextStepSentence(p)}
      </p>

      {topSlip && (
        <p className="mt-2 t-footnote text-muted">
          Recurring slip: <span className="text-ink">{humanizeMisconception(topSlip[0])}</span> ({topSlip[1]}×)
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PracticeNow questId={concept.questId} conceptIds={[concept.conceptId]} />
        <Link href={href} className="t-footnote font-semibold text-tint hover:opacity-70">
          Read the lesson
        </Link>
      </div>
    </div>
  );
}
