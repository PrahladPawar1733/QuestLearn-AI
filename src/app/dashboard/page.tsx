import { AlertTriangle, ArrowRight, BookOpen, ChevronRight, Flame, Gamepad2, Lock, Play, Plus, Sparkles, Star, Target, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDataButton } from "@/components/dashboard/delete-data";
import { worldMeta } from "@/components/game/types";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OriginBadge } from "@/components/ui/origin-badge";
import { masteryTone, Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { requireUid } from "@/lib/identity";
import { progressSnapshot } from "@/lib/services/progress";

export const metadata: Metadata = { title: "Dashboard · QuestLearn AI" };

/** Honesty rule: sample content is always labeled as an example, never passed off as the user's data. */
function SampleTag() {
  return (
    <Badge tone="amber" title="Example of what appears here after you play. Not your data.">
      Example
    </Badge>
  );
}

/** Apple Fitness/Health-style summary tile: small colored glyph, big rounded number, quiet label. */
function StatTile({
  icon,
  iconClass,
  value,
  unit,
  label,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  value: React.ReactNode;
  unit?: string;
  label: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <span className={cn("flex size-8 items-center justify-center rounded-full [&_svg]:size-4", iconClass)} aria-hidden>
        {icon}
      </span>
      <p className="mt-3 font-rounded text-[1.75rem] font-bold leading-none tracking-tight text-ink tabular sm:text-[2rem]">
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-muted">{unit}</span>}
      </p>
      <p className="mt-1.5 t-footnote text-muted">{label}</p>
      {children}
    </Card>
  );
}

export default async function DashboardPage() {
  const uid = await requireUid();
  const p = await progressSnapshot(uid);
  const u = p.user;
  const levelPct = Math.round(u.level.progress * 100);
  const sampleChapters = p.chapters.length === 0;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Greeting */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div
              role="img"
              aria-label={`Level ${u.level.level}`}
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-tint font-rounded text-[1.75rem] font-bold text-on-tint tabular"
            >
              {u.level.level}
            </div>
            <div className="min-w-0">
              <p className="t-subhead text-muted">{p.hasActivity ? "Welcome back," : "Welcome,"}</p>
              <h1 className="truncate t-large-title text-ink">{u.displayName}</h1>
              <p className="t-footnote text-muted">Guest profile · progress saved to this browser&apos;s session</p>
            </div>
          </div>
          <Button asChild size="lg" className="sm:ml-auto">
            <Link href="/create">
              <Plus /> Create a New Quest
            </Link>
          </Button>
        </header>

        {/* Summary tiles: 2-up on phones, 4-up on desktop */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Your stats">
          <StatTile icon={<Star fill="currentColor" />} iconClass="bg-tint/14 text-tint" value={u.totalXP} unit="XP" label={`Level ${u.level.level}`}>
            <Progress value={levelPct} className="mt-3" label="Progress to next level" />
            <p className="mt-1.5 t-caption text-muted tabular">
              {u.level.next - u.totalXP} XP to level {u.level.level + 1}
            </p>
          </StatTile>
          <StatTile
            icon={<Flame fill="currentColor" />}
            iconClass={u.streakDays > 0 ? "bg-amber-fill/16 text-amber" : "bg-fill-3 text-muted"}
            value={u.streakDays}
            label="day streak"
          />
          <StatTile icon={<Target />} iconClass="bg-cyan/14 text-cyan" value={u.questionsAnswered} label="questions answered" />
          <StatTile
            icon={<Sparkles fill="currentColor" />}
            iconClass="bg-success-fill/16 text-success"
            value={p.overallMastery === null ? "—" : p.overallMastery}
            unit={p.overallMastery === null ? undefined : "%"}
            label="overall mastery"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0 space-y-6">
            {/* Continue learning */}
            <Card className="p-5 sm:p-6">
              <p className="t-eyebrow text-tint">Continue learning</p>
              {p.continueSession ? (
                <>
                  <div className="mt-2 flex items-center gap-4">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-3xl" aria-hidden>
                      {worldMeta(p.continueSession.world).emoji}
                    </span>
                    <div className="min-w-0">
                      <h2 className="t-title2 text-ink">{p.continueSession.title}</h2>
                      <p className="mt-0.5 t-subhead text-muted">
                        <span className="tabular">
                          {p.continueSession.answered} of {p.continueSession.playLength}
                        </span>{" "}
                        answered · {worldMeta(p.continueSession.world).name}
                      </p>
                    </div>
                  </div>
                  <Progress value={(p.continueSession.answered / p.continueSession.playLength) * 100} className="mt-4 max-w-sm" label="Quest progress" />
                  <Button asChild className="mt-5">
                    <Link href={`/quest/${p.continueSession.questId}?session=${p.continueSession.id}`}>
                      <Play fill="currentColor" /> Resume quest
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="mt-1.5 t-title2 text-ink">{p.hasActivity ? "Ready for another round?" : "Start with the Collisions demo"}</h2>
                  <p className="mt-1 max-w-md t-subhead text-muted">
                    {p.hasActivity
                      ? "Replay a quest in a new game world, practise a weak concept, or turn a new chapter into a quest."
                      : "A 10-question physics quest with prepared lessons. No upload needed. Or create a quest from your own notes."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/quest/${DEMO_QUEST_ID}`}>
                        <Gamepad2 /> Play demo quest
                      </Link>
                    </Button>
                    <Button asChild variant="tinted">
                      <Link href="/create">
                        <Plus /> Upload notes
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </Card>

            {/* Chapters */}
            <Card>
              <CardHeader>
                <CardTitle className="t-title3">Subjects &amp; chapters</CardTitle>
                {sampleChapters && <SampleTag />}
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(sampleChapters
                  ? [{ questId: DEMO_QUEST_ID, title: "Collisions", subject: "Physics", origin: "demo_prepared" as const, conceptsTotal: 6, conceptsPractised: 4, conceptsMastered: 1, mastery: 58, completedRuns: 1 }]
                  : p.chapters
                ).map((c) => (
                  <Link
                    key={c.questId}
                    href={`/quest/${c.questId}`}
                    className={cn("pressable block rounded-2xl bg-surface-2 p-4 hover:bg-surface-3", sampleChapters && "opacity-60")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{c.subject}</Badge>
                      <OriginBadge origin={c.origin} className="ml-auto" />
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate t-headline text-ink">{c.title}</p>
                      <p className="shrink-0 font-rounded t-headline text-ink tabular">{c.mastery}%</p>
                    </div>
                    <p className="t-footnote text-muted">
                      {c.conceptsPractised}/{c.conceptsTotal} concepts practised · {c.conceptsMastered} mastered
                    </p>
                    <Progress value={c.mastery} tone={masteryTone(c.mastery)} className="mt-3" label={`${c.title} mastery`} />
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Recent quests */}
            <Card>
              <CardHeader>
                <CardTitle className="t-title3">Recent quests</CardTitle>
                <Button asChild variant="ghost" size="sm" className="-mr-2">
                  <Link href="/progress">
                    All progress <ChevronRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="pb-3">
                {p.recentSessions.length === 0 ? (
                  <p className="mb-2 rounded-2xl bg-surface-2 px-4 py-6 text-center t-subhead text-muted">Your quests will appear here once you start playing.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {p.recentSessions.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl" aria-hidden>
                          {worldMeta(s.world).emoji}
                        </span>
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
                            {s.correct}/{s.answered} correct · {s.xp} XP · {new Date(s.startedAt).toLocaleDateString()}
                          </p>
                        </div>
                        {s.status === "active" ? (
                          <Button asChild size="sm" variant="tinted">
                            <Link href={`/quest/${s.questId}?session=${s.id}`}>Resume</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="ghost" className="-mr-2">
                            <Link href={`/quest/${s.questId}/results?session=${s.id}`}>
                              Results <ArrowRight />
                            </Link>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 space-y-6">
            {/* Weak concepts */}
            <Card>
              <CardHeader>
                <CardTitle className="t-title3">Needs revision</CardTitle>
                {p.weak.length === 0 && !p.hasActivity && <SampleTag />}
              </CardHeader>
              <CardContent>
                {p.weak.length === 0 ? (
                  p.hasActivity ? (
                    <p className="t-subhead text-muted">Nothing flagged right now. Nice work!</p>
                  ) : (
                    <ul className="space-y-4 opacity-60">
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
                  )
                ) : (
                  <ul className="space-y-4">
                    {p.weak.map((w) => (
                      <li key={w.conceptId}>
                        <div className="mb-1.5 flex items-baseline gap-3">
                          <Link href={`/learn/${encodeURIComponent(w.conceptId)}`} className="min-w-0 truncate t-subhead font-semibold text-ink hover:text-tint">
                            {w.title}
                          </Link>
                          <span className="ml-auto font-rounded t-subhead font-semibold text-muted tabular">{w.mastery}%</span>
                        </div>
                        <Progress value={w.mastery} tone={masteryTone(w.mastery)} label={`${w.title} mastery`} />
                        {w.topMisconception && <p className="mt-1.5 t-footnote text-muted">Common slip: {w.topMisconception.replace(/-/g, " ")}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Uploads */}
            {p.materials.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="t-title3">Your uploads</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ul className="divide-y divide-line">
                    {p.materials.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 py-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint/14 text-tint" aria-hidden>
                          <BookOpen className="size-[1.125rem]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate t-subhead font-semibold text-ink">{m.title}</p>
                          <p className={cn("t-footnote", m.stage === "failed" ? "text-amber" : "text-muted")}>
                            {m.files} file{m.files === 1 ? "" : "s"} · {m.stage === "ready" ? "Quest ready" : m.stage === "failed" ? "Needs attention" : `Processing: ${m.stage}`}
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
            )}

            {/* Achievements */}
            <Card>
              <CardHeader>
                <CardTitle className="t-title3">Achievements</CardTitle>
                <span className="font-rounded t-subhead font-semibold text-muted tabular">
                  {u.achievements.filter((a) => a.earnedAt).length}/{u.achievements.length}
                </span>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {u.achievements.map((a) => (
                  <div key={a.id} title={a.description} className={cn("rounded-2xl px-3 py-3", a.earnedAt ? "bg-amber-fill/12" : "bg-surface-2")}>
                    <span
                      className={cn("flex size-7 items-center justify-center rounded-full", a.earnedAt ? "bg-amber-fill/18 text-amber" : "bg-fill-3 text-muted")}
                      aria-hidden
                    >
                      {a.earnedAt ? <Trophy className="size-3.5" /> : <Lock className="size-3.5" />}
                    </span>
                    <p className={cn("mt-2 t-subhead font-semibold", a.earnedAt ? "text-ink" : "text-muted")}>
                      <span className="sr-only">{a.earnedAt ? "Earned: " : "Locked: "}</span>
                      {a.title}
                    </p>
                    <p className="mt-0.5 t-caption text-muted">{a.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <DeleteDataButton />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
