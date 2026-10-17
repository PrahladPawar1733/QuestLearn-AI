"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Atom,
  Clock,
  Crown,
  Flag,
  Flame,
  Globe,
  LayoutGrid,
  Loader2,
  Minus,
  Repeat,
  Sparkles,
  Target,
  Trophy,
  Upload,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MasteryDisclaimer } from "@/components/progress/mastery-disclaimer";
import {
  adaptationStory,
  conceptDelta,
  directionLabel,
  labelTone,
  orderConceptsForStory,
  reviseNextSentence,
  runHeadline,
  stepRangeLabel,
} from "@/components/progress/run-story";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OriginBadge } from "@/components/ui/origin-badge";
import { masteryTone, Progress } from "@/components/ui/progress";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { MASTERY_CONFIG } from "@/lib/engine/mastery";
import { spring } from "@/lib/motion";
import type { SessionView } from "@/lib/services/play";
import type { AdaptationNote, ContentOrigin, GameWorld } from "@/lib/types";

const ICONS: Record<string, typeof Trophy> = { Flag, Flame, Sparkles, Atom, Crown, Globe };

interface Data {
  quest: { id: string; title: string; subject: string; origin: ContentOrigin };
  kind: "quest" | "practice";
  world: GameWorld;
  totals: { xp: number; completionBonus: number; accuracy: number; answered: number; correct: number; followUps: number; followUpsCorrect: number; bestStreak: number; durationMs: number | null };
  perConcept: {
    conceptId: string;
    title: string;
    answered: number;
    correct: number;
    followUpFixed: boolean;
    mastery: number;
    label: string;
    /**
     * Optional, and rendered only when present: the server does not record a
     * pre-run mastery score yet (`sessionResults` in `src/lib/services/play.ts`
     * returns the post-run value only). When it starts to, the arrow appears
     * with no change here. Until then the screen says "mastery now", which is
     * true, instead of inventing a delta.
     */
    masteryBefore?: number;
    labelBefore?: string;
  }[];
  weakConceptIds: string[];
  adaptations: AdaptationNote[];
  achievements: { id: string; title: string; description: string; icon: string }[];
  recommendation: { title: string; detail: string; action: "practice" | "replay" | "new" };
}

function duration(ms: number | null) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return m ? `${m}m ${s}s` : `${s}s`;
}

/** before → after, or an honest "now" when no before-score was recorded. */
function MasteryMovement({ concept }: { concept: Data["perConcept"][number] }) {
  const d = conceptDelta(concept);
  if (!d) {
    return (
      <span className="t-subhead text-ink tabular">
        Mastery now <span className="font-rounded font-semibold">{concept.mastery}%</span>
      </span>
    );
  }
  const Icon = d.delta > 0 ? ArrowUp : d.delta < 0 ? ArrowDown : Minus;
  const word = d.delta > 0 ? "up" : d.delta < 0 ? "down" : "unchanged";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 t-subhead text-ink tabular">
      <span className="font-rounded text-muted">{d.before}%</span>
      <ArrowRight className="size-3.5 text-faint" aria-hidden />
      <span className="font-rounded font-semibold">{d.after}%</span>
      <span className="flex items-center gap-0.5 t-footnote text-muted">
        <Icon className="size-3.5" aria-hidden />
        {word} {d.delta !== 0 ? `${Math.abs(d.delta)} points` : ""}
        {d.bandChanged ? ` · ${concept.labelBefore} → ${concept.label}` : ""}
      </span>
    </span>
  );
}

export function ResultsView({ questId, data }: { questId: string; data: Data }) {
  const reduced = !!useReducedMotion();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = data.totals;
  const concepts = orderConceptsForStory(data.perConcept);
  const fixed = data.perConcept.filter((c) => c.followUpFixed);
  const steps = adaptationStory(data.adaptations);

  async function practice() {
    setBusy(true);
    setError(null);
    try {
      const v = await api<SessionView>(`/api/quests/${questId}/start`, { method: "POST", json: { world: data.world, practiceConceptIds: data.weakConceptIds }, retries: 0 });
      router.push(`/quest/${questId}?session=${v.session.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start practice.");
      setBusy(false);
    }
  }

  /* Score lives here, deliberately at the bottom and deliberately small. */
  const scoreRow = [
    { icon: Zap, label: "XP", value: `+${t.xp}` },
    { icon: Flame, label: "Best streak", value: String(t.bestStreak) },
    { icon: Clock, label: "Time", value: duration(t.durationMs) },
    { icon: Target, label: "Accuracy", value: `${t.accuracy}%` },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 1. The chapter and what happened to its ideas — not a trophy, not a ring. */}
      <motion.header
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="surface rounded-[1.75rem] px-5 py-6 sm:px-7 sm:py-8"
      >
        <p className="t-eyebrow text-tint">{data.kind === "practice" ? "Revision complete" : "Quest complete"}</p>
        <h1 className="mt-1 t-large-title text-ink">What you learned</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="min-w-0 t-subhead font-semibold text-ink">{data.quest.title}</span>
          <Badge tone="primary">{data.quest.subject}</Badge>
          <OriginBadge origin={data.quest.origin} />
        </div>
        <p className="mt-4 t-body text-ink">{runHeadline(data.perConcept)}</p>
        <p className="mt-1.5 t-subhead text-muted">{reviseNextSentence(data.perConcept)}</p>
      </motion.header>

      {/* 2. Mistake → mastery. The one event worth celebrating above everything else. */}
      {fixed.length > 0 && (
        <motion.section
          initial={reduced ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring.gentle, delay: 0.1 }}
          aria-labelledby="fixed-h"
          className="rounded-[1.5rem] bg-success-fill/12 px-5 py-5"
        >
          <p className="flex items-center gap-1.5 t-eyebrow text-success">
            <Repeat className="size-3.5" aria-hidden /> Mistake → mastery
          </p>
          <h2 id="fixed-h" className="mt-1 t-title3 text-ink">
            You fixed {fixed.length} {fixed.length === 1 ? "mistake" : "mistakes"} on the retry
          </h2>
          <ul className="mt-3 space-y-1.5">
            {fixed.map((c) => (
              <li key={c.conceptId} className="t-subhead text-ink">
                <Link href={`/learn/${encodeURIComponent(c.conceptId)}`} className="font-semibold hover:text-tint">
                  {c.title}
                </Link>
                <span className="text-muted"> — got it wrong, read why, then got it right.</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 t-footnote text-muted">
            A follow-up answer counts ×{MASTERY_CONFIG.followUpWeight} in the mastery formula — more than a question you got right first time, because it shows
            the mistake is actually gone.
          </p>
        </motion.section>
      )}

      {/* 3. Concept by concept: the learning column the plan asks for. */}
      <section aria-labelledby="concepts-h">
        <h2 id="concepts-h" className="mb-3 px-1 t-title3 text-ink">
          Concept by concept
        </h2>
        {concepts.length === 0 ? (
          <Card>
            <CardContent className="pt-5 t-subhead text-muted">No questions were answered in this run, so there is nothing to show yet.</CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {concepts.map((c, i) => (
              <motion.li
                key={c.conceptId}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.default, delay: 0.15 + i * 0.05 }}
                className="surface rounded-[1.25rem] px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Link href={`/learn/${encodeURIComponent(c.conceptId)}`} className="min-w-0 t-headline text-ink hover:text-tint">
                    {c.title}
                  </Link>
                  <Badge tone={labelTone(c.label)} className="shrink-0">
                    {c.label}
                  </Badge>
                  {c.followUpFixed && (
                    <Badge tone="success" className="shrink-0">
                      <Repeat /> fixed on the retry
                    </Badge>
                  )}
                </div>
                <div className="mt-2">
                  <MasteryMovement concept={c} />
                </div>
                <Progress value={c.mastery} tone={masteryTone(c.mastery)} className="mt-2.5" label={`${c.title} mastery ${c.mastery} per cent`} />
                <p className="mt-2 t-footnote text-muted tabular">
                  {c.correct} of {c.answered} right in this run
                  {c.answered > c.correct ? " · worth another pass" : ""}
                </p>
              </motion.li>
            ))}
          </ul>
        )}
        <MasteryDisclaimer className="mt-3 px-1" />
      </section>

      {/* 4. What to do next. */}
      <section className="rounded-[1.75rem] bg-tint/10 px-5 py-6" aria-labelledby="next-h">
        <p className="t-eyebrow text-tint">Recommended next</p>
        <h2 id="next-h" className="mt-1 t-title2 text-ink">
          {data.recommendation.title}
        </h2>
        <p className="mt-1 t-body text-muted">{data.recommendation.detail}</p>
        {error && (
          <p role="alert" className="mt-3 t-subhead text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {data.weakConceptIds.length > 0 && (
            <Button size="lg" onClick={practice} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Practise weak concepts
            </Button>
          )}
          {data.recommendation.action === "new" && (
            <Button asChild size="lg" variant={data.weakConceptIds.length ? "secondary" : "primary"}>
              <Link href="/create">
                <Upload /> Create a new quest
              </Link>
            </Button>
          )}
          {data.recommendation.action === "replay" && (
            <Button asChild size="lg" variant="secondary">
              <Link href={`/quest/${questId}`}>
                <Repeat /> Replay quest
              </Link>
            </Button>
          )}
          <Button asChild size="lg" variant="secondary">
            <Link href="/dashboard">
              <LayoutGrid /> Dashboard
            </Link>
          </Button>
        </div>
      </section>

      {/* 5. The adaptive timeline as prose, grouped into difficulty runs. */}
      {steps.length > 0 && (
        <section aria-labelledby="adapt-h">
          <h2 id="adapt-h" className="mb-3 px-1 t-title3 text-ink">
            How the questions adapted to you
          </h2>
          <Card>
            <CardContent className="pt-5">
              <ol className="space-y-3">
                {steps.map((s) => {
                  const Icon = s.direction === "up" ? ArrowUp : s.direction === "down" ? ArrowDown : Minus;
                  return (
                    <li key={`${s.from}-${s.difficulty}`} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                          s.direction === "up" ? "bg-tint/14 text-tint" : s.direction === "down" ? "bg-amber-fill/16 text-amber" : "bg-fill-3 text-muted",
                        )}
                        aria-hidden
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="t-subhead font-semibold text-ink">
                          {stepRangeLabel(s)} · {directionLabel(s.direction, s.difficulty)}
                        </p>
                        <p className="t-footnote text-muted">{s.reason}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 t-footnote text-faint">
                Two correct in a row raises the difficulty; two misses lowers it. Difficulty changes what you are asked next — it never changes whether an answer
                counted as right.
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* 6. Score, demoted. It measures the game, not the learning. */}
      <section aria-labelledby="score-h">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <h2 id="score-h" className="t-title3 text-ink">
            Score this run
          </h2>
          <span className="shrink-0 t-footnote text-muted tabular">
            {t.correct}/{t.answered} answered correctly
          </span>
        </div>
        <Card>
          <CardContent className="pt-5">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {scoreRow.map((s) => (
                <div key={s.label} className="rounded-xl bg-surface-2 px-3 py-3">
                  <dt className="flex items-center gap-1.5 t-caption text-muted">
                    <s.icon className="size-3.5" aria-hidden /> {s.label}
                  </dt>
                  <dd className="mt-1 font-rounded t-headline text-ink tabular">{s.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 t-footnote text-faint">
              XP, streaks and accuracy describe this run only. They never feed your mastery score.
              {t.completionBonus ? ` Includes a +${t.completionBonus} XP completion bonus.` : ""}
            </p>
          </CardContent>
        </Card>
      </section>

      {data.achievements.length > 0 && (
        <section aria-labelledby="ach-h">
          <h2 id="ach-h" className="mb-3 px-1 t-title3 text-ink">
            Achievements earned this run
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.achievements.map((a) => {
              const Icon = ICONS[a.icon] ?? Trophy;
              return (
                <div key={a.id} className="surface flex items-center gap-3 rounded-[1.25rem] p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-fill/16 text-amber" aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="t-subhead font-semibold text-ink">{a.title}</p>
                    <p className="t-footnote text-muted">{a.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
