import { AlertTriangle, ArrowRight, BookOpen, Flame, Gamepad2, Play, Plus, Star, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDataButton } from "@/components/dashboard/delete-data";
import { AppShell } from "@/components/layout/app-shell";
import { MasteryDisclaimer } from "@/components/progress/mastery-disclaimer";
import {
  daysSince,
  lastPractisedLabel,
  nextStepSentence,
  overallStatement,
  projectMastery,
  revisionOrder,
} from "@/components/progress/mastery-math";
import { PracticeNow } from "@/components/progress/practice-now";
import { labelTone } from "@/components/progress/run-story";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OriginBadge } from "@/components/ui/origin-badge";
import { masteryTone, Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { requireUid } from "@/lib/identity";
import { nowIso } from "@/lib/ids";
import { progressSnapshot } from "@/lib/services/progress";
import type { ConceptMastery } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard · QuestLearn AI" };

/** Honesty rule: sample content is always labeled as an example, never passed off as the user's data. */
function SampleTag() {
  return (
    <Badge tone="amber" title="Example of what appears here after you play. Not your data.">
      Example
    </Badge>
  );
}

function SectionTitle({ children, note, id }: { children: React.ReactNode; note?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
      <h2 id={id} className="t-title3 text-ink">
        {children}
      </h2>
      {note && <span className="shrink-0 t-footnote text-muted">{note}</span>}
    </div>
  );
}

export default async function DashboardPage() {
  const uid = await requireUid();
  const p = await progressSnapshot(uid);
  const u = p.user;

  // Full mastery rows: the flattened snapshot has no `recentResults`, and without
  // them a score cannot be explained — only displayed. Reads only.
  const masteryRows = await db().list<ConceptMastery>("mastery", { ownerId: uid });
  const now = Date.parse(nowIso());

  const projected = masteryRows
    .filter((m) => m.attempts > 0)
    .map((m) => ({ row: m, p: projectMastery({ attempts: m.attempts, recentResults: m.recentResults }) }));
  const atProficient = projected.filter((x) => x.p.label === "Proficient" || x.p.label === "Mastered").length;
  const needsWork = projected.filter((x) => x.p.label === "Needs revision" || x.p.label === "Developing");

  /**
   * The revision queue. Ordered by weakest score, then by longest since
   * practised — stated in the UI, because there is no `nextReviewAt` in the data
   * model yet and a made-up "due date" would be a lie (backlog QA-02).
   */
  const due = revisionOrder(
    needsWork.map((x) => ({
      conceptId: x.row.conceptId,
      title: x.row.conceptTitle,
      subject: x.row.subject,
      questId: x.row.questId,
      score: x.p.score,
      label: x.p.label,
      lastPracticedAt: x.row.lastPracticedAt,
      daysSince: daysSince(x.row.lastPracticedAt, now),
      next: nextStepSentence(x.p),
    })),
  ).slice(0, 4);

  const lastRun = p.recentSessions.find((s) => s.status === "completed");
  const readyMaterial = p.materials.find((m) => m.questId);
  const sampleChapters = p.chapters.length === 0;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Greeting and the one honest line about where the student is. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="t-subhead text-muted">{p.hasActivity ? "Welcome back," : "Welcome,"}</p>
            <h1 className="truncate t-large-title text-ink">{u.displayName}</h1>
            <p className="mt-2 max-w-xl t-body text-ink">
              {overallStatement({
                questionsAnswered: u.questionsAnswered,
                conceptsPractised: projected.length,
                conceptsAtProficient: atProficient,
                weakCount: needsWork.length,
              })}
            </p>
            <p className="mt-1.5 t-footnote text-faint">Guest profile · progress saved to this browser&apos;s session</p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link href="/create">
              <Plus /> New quest from your notes
            </Link>
          </Button>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
          <div className="min-w-0 space-y-8">
            {/* 1. Continue. One screen, one obvious next tap. */}
            <section aria-labelledby="continue-h">
              <SectionTitle id="continue-h">Pick up where you left off</SectionTitle>
              <Card className="px-5 py-5 sm:px-6">
                {p.continueSession ? (
                  <>
                    <p className="t-eyebrow text-tint">Unfinished run</p>
                    <h3 className="mt-1 t-title2 text-ink">{p.continueSession.title}</h3>
                    <p className="mt-1 t-subhead text-muted tabular">
                      {p.continueSession.answered} of {p.continueSession.playLength} questions answered
                    </p>
                    <Progress
                      value={(p.continueSession.answered / Math.max(1, p.continueSession.playLength)) * 100}
                      className="mt-4 max-w-sm"
                      label={`${p.continueSession.title}: ${p.continueSession.answered} of ${p.continueSession.playLength} answered`}
                    />
                    <Button asChild size="lg" className="mt-5">
                      <Link href={`/quest/${p.continueSession.questId}?session=${p.continueSession.id}`}>
                        <Play fill="currentColor" /> Resume this run
                      </Link>
                    </Button>
                  </>
                ) : lastRun ? (
                  <>
                    <p className="t-eyebrow text-tint">Last time</p>
                    <h3 className="mt-1 t-title2 text-ink">{lastRun.title}</h3>
                    <p className="mt-1 t-subhead text-muted tabular">
                      {lastRun.correct} of {lastRun.answered} right · {new Date(lastRun.startedAt).toLocaleDateString()}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button asChild size="lg">
                        <Link href={`/quest/${lastRun.questId}/results?session=${lastRun.id}`}>
                          <BookOpen /> What you learned
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="tinted">
                        <Link href={`/quest/${lastRun.questId}`}>
                          <Play fill="currentColor" /> Play it again
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : readyMaterial?.questId ? (
                  <>
                    {/* A student who uploaded a chapter is pointed at their own chapter, not the demo (backlog ON-15). */}
                    <p className="t-eyebrow text-tint">Ready to play</p>
                    <h3 className="mt-1 t-title2 text-ink">{readyMaterial.title}</h3>
                    <p className="mt-1 max-w-md t-subhead text-muted">Your chapter has been read, its concepts named and its questions checked. Start whenever you like.</p>
                    <Button asChild size="lg" className="mt-5">
                      <Link href={`/quest/${readyMaterial.questId}`}>
                        <Play fill="currentColor" /> Start this chapter
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="t-eyebrow text-tint">Start here</p>
                    <h3 className="mt-1 t-title2 text-ink">The prepared Collisions chapter</h3>
                    <p className="mt-1 max-w-md t-subhead text-muted">
                      A short physics chapter with hand-written lessons — no upload needed. You will finish knowing which of its ideas you can still get wrong.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button asChild size="lg">
                        <Link href={`/quest/${DEMO_QUEST_ID}`}>
                          <Gamepad2 /> Play the demo chapter
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="tinted">
                        <Link href="/create">
                          <Plus /> Use my own notes
                        </Link>
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            </section>

            {/* 2. Due for revision — the second tap, and the honest one. */}
            <section aria-labelledby="due-h">
              <SectionTitle id="due-h" note={due.length > 0 ? "weakest first, then longest since practised" : undefined}>
                Due for revision
              </SectionTitle>
              <Card>
                <CardContent className="pt-5">
                  {!p.hasActivity ? (
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <SampleTag />
                        <span className="t-footnote text-muted">this is what appears after you play</span>
                      </div>
                      <ul className="space-y-3 opacity-60">
                        {(
                          [
                            ["Coefficient of restitution", 32],
                            ["Inelastic collisions", 41],
                          ] as const
                        ).map(([t, m]) => (
                          <li key={t}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                              <span className="t-subhead font-semibold text-ink">{t}</span>
                              <span className="font-rounded t-subhead font-semibold text-muted tabular">{m}%</span>
                            </div>
                            <Progress value={m} tone={masteryTone(m)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : due.length === 0 ? (
                    <p className="t-subhead text-muted">
                      Nothing is below Proficient right now.{" "}
                      <Link href="/progress" className="font-semibold text-tint hover:opacity-70">
                        See every concept
                      </Link>{" "}
                      to pick one to keep fresh.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {due.map((d, i) => (
                        <li key={d.conceptId} className="py-3.5 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="w-11 shrink-0 font-rounded t-headline text-ink tabular">{d.score}%</span>
                            {/* 9rem floor + flex-wrap: at 360 px the button drops to its own line
                                instead of squeezing the concept title to nothing. */}
                            <div className="min-w-[9rem] flex-1">
                              <Link href={`/learn/${encodeURIComponent(d.conceptId)}`} className="block truncate t-subhead font-semibold text-ink hover:text-tint">
                                {d.title}
                              </Link>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 t-footnote text-muted">
                                <Badge tone={labelTone(d.label)}>{d.label}</Badge>
                                {lastPractisedLabel(d.lastPracticedAt, now)}
                              </p>
                            </div>
                            <PracticeNow questId={d.questId} conceptIds={[d.conceptId]} className="ml-auto" />
                          </div>
                          {/* The top concept gets the concrete target; repeating it four times would be noise. */}
                          {i === 0 && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 t-footnote text-ink">{d.next}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.hasActivity && due.length > 0 && <MasteryDisclaimer className="mt-4" />}
                </CardContent>
              </Card>
            </section>

            {/* 3. What you have to work with. */}
            <section aria-labelledby="chapters-h">
              <SectionTitle id="chapters-h" note={sampleChapters ? <SampleTag /> : undefined}>
                Your chapters
              </SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {(sampleChapters
                  ? [{ questId: DEMO_QUEST_ID, title: "Collisions", subject: "Physics", origin: "demo_prepared" as const, conceptsTotal: 6, conceptsPractised: 4, conceptsMastered: 1, mastery: 58, completedRuns: 1 }]
                  : p.chapters
                ).map((c) => (
                  <Link
                    key={c.questId}
                    href={`/quest/${c.questId}`}
                    className={cn("pressable surface block rounded-2xl p-4 hover:bg-surface-2", sampleChapters && "opacity-60")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{c.subject}</Badge>
                      <OriginBadge origin={c.origin} className="ml-auto" />
                    </div>
                    <p className="mt-3 truncate t-headline text-ink">{c.title}</p>
                    <p className="t-footnote text-muted tabular">
                      {c.conceptsPractised} of {c.conceptsTotal} concepts practised · {c.conceptsMastered} mastered
                    </p>
                    <Progress
                      value={(c.conceptsPractised / Math.max(1, c.conceptsTotal)) * 100}
                      className="mt-3"
                      label={`${c.title}: ${c.conceptsPractised} of ${c.conceptsTotal} concepts practised`}
                    />
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <div className="min-w-0 space-y-8">
            {/* Uploads in flight. */}
            {p.materials.length > 0 && (
              <section aria-labelledby="uploads-h">
                <SectionTitle id="uploads-h">Your uploads</SectionTitle>
                <Card>
                  <CardContent className="pb-3 pt-5">
                    <ul className="divide-y divide-line">
                      {p.materials.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint/14 text-tint" aria-hidden>
                            <BookOpen className="size-[1.125rem]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate t-subhead font-semibold text-ink">{m.title}</p>
                            <p className={cn("t-footnote", m.stage === "failed" ? "text-amber" : "text-muted")}>
                              {m.files} file{m.files === 1 ? "" : "s"} ·{" "}
                              {m.stage === "ready" ? "Quest ready" : m.stage === "failed" ? "Needs attention" : `Processing: ${m.stage}`}
                            </p>
                          </div>
                          {m.questId ? (
                            <Button asChild size="sm" variant="tinted">
                              <Link href={`/quest/${m.questId}`}>
                                <Play fill="currentColor" /> Play
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild size="sm" variant={m.error ? "amber" : "secondary"}>
                              <Link href={`/create?material=${m.id}`}>{m.error ? <AlertTriangle /> : null} Open</Link>
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Recent runs: a way back to a results page, not a scoreboard. */}
            {p.recentSessions.length > 0 && (
              <section aria-labelledby="recent-h">
                <SectionTitle
                  id="recent-h"
                  note={
                    <Link href="/progress" className="font-semibold text-tint hover:opacity-70">
                      All progress
                    </Link>
                  }
                >
                  Recent runs
                </SectionTitle>
                <Card>
                  <CardContent className="pb-3 pt-5">
                    <ul className="divide-y divide-line">
                      {p.recentSessions.slice(0, 5).map((s) => (
                        <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0">
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-2">
                              <span className="truncate t-subhead font-semibold text-ink">{s.title}</span>
                              {s.kind === "practice" && (
                                <Badge tone="cyan" className="shrink-0">
                                  Revision
                                </Badge>
                              )}
                            </p>
                            <p className="t-footnote text-muted tabular">
                              {s.correct}/{s.answered} right · {new Date(s.startedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Button asChild size="sm" variant={s.status === "active" ? "tinted" : "ghost"} className={s.status === "active" ? undefined : "-mr-2"}>
                            <Link href={s.status === "active" ? `/quest/${s.questId}?session=${s.id}` : `/quest/${s.questId}/results?session=${s.id}`}>
                              {s.status === "active" ? "Resume" : "Results"}
                              {s.status === "active" ? null : <ArrowRight />}
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* XP, level, streak and badges: real, but kept quiet and collapsed.
                They measure turning up, not understanding. */}
            <section aria-labelledby="game-h">
              <SectionTitle id="game-h">Game stats</SectionTitle>
              <Card>
                <CardContent className="pt-5">
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 t-subhead text-ink tabular">
                    <span className="flex items-center gap-1.5">
                      <Star className="size-4 text-tint" fill="currentColor" aria-hidden /> Level {u.level.level}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Trophy className="size-4 text-muted" aria-hidden /> {u.totalXP} XP
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Flame className={cn("size-4", u.streakDays > 0 ? "text-amber" : "text-muted")} fill="currentColor" aria-hidden /> {u.streakDays}-day
                      streak
                    </span>
                  </p>
                  <Progress value={Math.round(u.level.progress * 100)} className="mt-3" label={`Progress to level ${u.level.level + 1}`} />
                  <p className="mt-1.5 t-footnote text-muted tabular">{u.level.next - u.totalXP} XP to level {u.level.level + 1}</p>
                  <p className="mt-3 t-footnote text-faint">XP and streaks measure how often you turn up. They never feed your mastery scores.</p>

                  <details className="mt-4">
                    <summary className="w-fit cursor-pointer t-footnote font-semibold text-tint">
                      Achievements ({u.achievements.filter((a) => a.earnedAt).length}/{u.achievements.length})
                    </summary>
                    <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {u.achievements.map((a) => (
                        <li key={a.id} className={cn("rounded-xl px-3 py-2.5", a.earnedAt ? "bg-amber-fill/12" : "bg-surface-2")}>
                          <p className={cn("t-footnote font-semibold", a.earnedAt ? "text-ink" : "text-muted")}>
                            <span className="sr-only">{a.earnedAt ? "Earned: " : "Locked: "}</span>
                            {a.title}
                          </p>
                          <p className="mt-0.5 t-caption text-muted">{a.description}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                </CardContent>
              </Card>
            </section>

            <div className="flex justify-end">
              <DeleteDataButton />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
