import { ArrowRight, ChartNoAxesColumn, ChevronRight, Gamepad2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { worldMeta } from "@/components/game/types";
import { AppShell } from "@/components/layout/app-shell";
import { AccuracyChart, ImprovementChart, SubjectChart } from "@/components/progress/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { masteryTone, Progress } from "@/components/ui/progress";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { requireUid } from "@/lib/identity";
import { progressSnapshot } from "@/lib/services/progress";

export const metadata: Metadata = { title: "Progress · QuestLearn AI" };

const LABEL_TONE = { Mastered: "success", Proficient: "cyan", Developing: "primary", "Needs revision": "amber", "Not started": "neutral" } as const;

export default async function ProgressPage() {
  const uid = await requireUid();
  const p = await progressSnapshot(uid);
  const cfg = p.masteryConfig;

  if (!p.hasActivity) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-tint/14 text-tint" aria-hidden>
            <ChartNoAxesColumn className="size-7" />
          </span>
          <h1 className="mt-5 t-large-title text-ink">Your learning progress</h1>
          <p className="mt-2 t-body text-muted">Nothing to show yet. Play a quest and your mastery, accuracy trend and revision list will appear here, built from your real answers.</p>
          <Button asChild size="lg" className="mt-7">
            <Link href={`/quest/${DEMO_QUEST_ID}`}>
              <Gamepad2 /> Play the demo quest
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="t-large-title text-ink">Your learning progress</h1>
          <p className="mt-1 t-subhead text-muted tabular">
            {p.user.questionsAnswered} questions answered · {p.concepts.length} concepts practised · overall mastery {p.overallMastery ?? 0}%
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="t-title3">Accuracy over time</CardTitle>
              <span className="t-footnote text-muted">completed runs</span>
            </CardHeader>
            <CardContent>
              {p.accuracyOverTime.length >= 1 ? (
                <AccuracyChart data={p.accuracyOverTime} />
              ) : (
                <p className="rounded-2xl bg-surface-2 px-4 py-10 text-center t-subhead text-muted">Finish a quest to start your accuracy trend.</p>
              )}
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="t-title3">Subject-wise mastery</CardTitle>
            </CardHeader>
            <CardContent>
              <SubjectChart data={p.subjects} />
              <h3 className="mb-2 mt-5 t-eyebrow text-muted">Chapters</h3>
              <ul className="space-y-4">
                {p.chapters.map((c) => (
                  <li key={c.questId}>
                    <Link href={`/quest/${c.questId}`} className="group block">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate t-subhead font-semibold text-ink group-hover:text-tint">{c.title}</span>
                        <span className="shrink-0 t-footnote text-muted tabular">
                          {c.conceptsMastered}/{c.conceptsTotal} mastered · {c.completedRuns} run{c.completedRuns === 1 ? "" : "s"}
                        </span>
                      </div>
                      <Progress value={(c.conceptsPractised / Math.max(1, c.conceptsTotal)) * 100} label={`${c.title} concepts practised`} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="t-title3">Improvement after targeted practice</CardTitle>
            </CardHeader>
            <CardContent>
              {p.improvement.length ? (
                <>
                  <ImprovementChart data={p.improvement} />
                  <p className="mt-2 t-footnote text-muted">Accuracy on each concept before its first follow-up question, compared with accuracy from the follow-up onwards.</p>
                </>
              ) : (
                <p className="rounded-2xl bg-surface-2 px-4 py-8 text-center t-subhead text-muted">After you answer a follow-up question, you&apos;ll see how your accuracy changed here.</p>
              )}
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="t-title3">Concepts requiring revision</CardTitle>
            </CardHeader>
            <CardContent className={p.weak.length === 0 ? undefined : "pb-3"}>
              {p.weak.length === 0 ? (
                <p className="t-subhead text-muted">Nothing below &ldquo;Proficient&rdquo; right now.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {p.weak.map((w) => (
                    <li key={w.conceptId} className="flex items-center gap-3 py-3">
                      <span className="w-11 shrink-0 font-rounded t-headline text-ink tabular">{w.mastery}%</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate t-subhead font-semibold text-ink">{w.title}</p>
                        <p className="t-footnote text-muted">
                          {w.label}
                          {w.topMisconception ? ` · common slip: ${w.topMisconception.replace(/-/g, " ")}` : ""}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="tinted">
                        <Link href={`/learn/${encodeURIComponent(w.conceptId)}`}>
                          Revise <ArrowRight />
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="t-title3">All concepts</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            {/* Phones: an inset-grouped list. Wider screens: a table. */}
            <ul className="divide-y divide-line md:hidden">
              {p.concepts.map((c) => (
                <li key={c.conceptId}>
                  <Link href={`/learn/${encodeURIComponent(c.conceptId)}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 truncate t-subhead font-semibold text-ink">{c.title}</p>
                        <Badge tone={LABEL_TONE[c.label]} className="shrink-0">
                          {c.label}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={c.mastery} tone={masteryTone(c.mastery)} className="max-w-32" label={`${c.title} mastery`} />
                        <span className="font-rounded t-footnote font-semibold text-ink tabular">{c.mastery}%</span>
                      </div>
                      <p className="mt-1 t-footnote text-muted tabular">
                        {c.subject} · {c.correct}/{c.attempts} correct · {c.followUpCorrect}/{c.followUps} follow-ups
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <table className="hidden w-full t-subhead md:table">
              <thead>
                <tr className="text-left t-footnote text-muted">
                  <th className="pb-2 font-semibold">Concept</th>
                  <th className="pb-2 font-semibold">Mastery</th>
                  <th className="pb-2 font-semibold">Correct</th>
                  <th className="pb-2 font-semibold">Follow-ups</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.concepts.map((c) => (
                  <tr key={c.conceptId}>
                    <td className="py-3 pr-3">
                      <Link href={`/learn/${encodeURIComponent(c.conceptId)}`} className="font-semibold text-ink hover:text-tint">
                        {c.title}
                      </Link>
                      <span className="ml-2 t-footnote text-muted">{c.subject}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Progress value={c.mastery} tone={masteryTone(c.mastery)} className="w-24" label={`${c.title} mastery`} />
                        <span className="font-rounded font-semibold text-ink tabular">{c.mastery}%</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-rounded text-muted tabular">
                      {c.correct}/{c.attempts}
                    </td>
                    <td className="py-3 pr-3 font-rounded text-muted tabular">
                      {c.followUpCorrect}/{c.followUps}
                    </td>
                    <td className="py-3">
                      <Badge tone={LABEL_TONE[c.label]}>{c.label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="t-title3">Recent learning sessions</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ul className="divide-y divide-line">
                {p.recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl" aria-hidden>
                      {worldMeta(s.world).emoji}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate t-subhead font-semibold text-ink">{s.title}</span>
                      {s.kind === "practice" && (
                        <Badge tone="cyan" className="shrink-0">
                          Revision
                        </Badge>
                      )}
                    </div>
                    <span className="font-rounded t-subhead font-semibold text-muted tabular">
                      {s.correct}/{s.answered}
                    </span>
                    <Button asChild size="sm" variant={s.status === "active" ? "tinted" : "ghost"} className={s.status === "active" ? undefined : "-mr-2"}>
                      <Link href={s.status === "active" ? `/quest/${s.questId}?session=${s.id}` : `/quest/${s.questId}/results?session=${s.id}`}>
                        {s.status === "active" ? "Resume" : "View"}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="t-title3">How mastery is calculated</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 t-subhead text-muted">
              <p>
                For each concept we take your last {cfg.windowSize} results. Newer results count more (each step back is ×{cfg.recencyDecay}). Follow-up questions count ×{cfg.followUpWeight}, because they test whether a mistake was really fixed. Hard questions count more than easy ones.
              </p>
              <p>
                A correct answer with a hint earns {cfg.hintCredit * 100}% credit. Every concept starts with a neutral prior of {cfg.prior * 100}% (weight {cfg.priorWeight}). That means one lucky answer can&apos;t read as mastery.
              </p>
              <p>
                &ldquo;Mastered&rdquo; needs at least 85% and 4 attempts. &ldquo;Proficient&rdquo; needs 70% and 3 attempts. This is a transparent practice guide, not a validated exam score.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
