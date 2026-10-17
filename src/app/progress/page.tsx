import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ChartFigure, DataTable } from "@/components/progress/chart-frame";
import { AccuracyChart, ImprovementChart, SubjectChart } from "@/components/progress/charts";
import { ConceptMasteryCard, type ConceptMasteryInput } from "@/components/progress/concept-mastery";
import { MasteryFormula } from "@/components/progress/mastery-formula";
import {
  daysSince,
  formatDuration,
  lastPractisedLabel,
  MIN_TREND_POINTS,
  overallStatement,
  projectMastery,
  recurringMisconceptions,
  revisionOrder,
  timeOnTask,
} from "@/components/progress/mastery-math";
import { PracticeNow } from "@/components/progress/practice-now";
import { labelTone } from "@/components/progress/run-story";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OriginBadge } from "@/components/ui/origin-badge";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/ids";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { requireUid } from "@/lib/identity";
import { progressSnapshot } from "@/lib/services/progress";
import type { ConceptMastery, Session } from "@/lib/types";

export const metadata: Metadata = { title: "Progress · QuestLearn AI" };

/**
 * An h2 section header with an optional note on the right.
 *
 * Cards on this page carry no `CardHeader`, because `CardTitle` renders an h3
 * and that would put an h3 directly under the page h1. Headings go h1 → h2 → h3.
 */
function SectionTitle({ children, note, id }: { children: React.ReactNode; note?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="t-headline text-ink">
        {children}
      </h2>
      {note && <span className="shrink-0 t-footnote text-muted">{note}</span>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 t-subhead text-muted">{children}</p>;
}

export default async function ProgressPage() {
  const uid = await requireUid();
  const p = await progressSnapshot(uid);

  // `progressSnapshot` flattens mastery rows and drops `recentResults` and
  // `misconceptions`. Both are needed to explain a score rather than just
  // print it, so the full rows are read here. Reads only; nothing is written.
  const [masteryRows, sessions] = await Promise.all([
    db().list<ConceptMastery>("mastery", { ownerId: uid }),
    db().list<Session>("sessions", { ownerId: uid }),
  ]);
  // `nowIso()` rather than `Date.now()`: the lint rules treat a direct clock read
  // inside a component as impure, and this page only needs "today" for day counts.
  const now = Date.parse(nowIso());
  const practised = masteryRows.filter((m) => m.attempts > 0);

  if (!p.hasActivity) {
    const ready = p.materials.find((m) => m.questId);
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <h1 className="t-large-title text-ink">Progress</h1>
          <p className="mt-2 max-w-md t-body text-muted">
            Nothing here yet. After you answer some questions, this page shows how well you know each concept and which mistakes keep coming back.
          </p>
          {/* A student who has uploaded a chapter is sent to their own chapter, not the demo (backlog ON-15). */}
          <Button asChild className="mt-6">
            <Link href={ready?.questId ? `/quest/${ready.questId}` : `/quest/${DEMO_QUEST_ID}`}>{ready?.questId ? `Play ${ready.title}` : "Play the sample quest"}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  /* ---------------- derived, all from the real formula ---------------- */

  const projected = practised
    .map((m) => ({ row: m, p: projectMastery({ attempts: m.attempts, recentResults: m.recentResults }) }))
    .sort((a, b) => a.p.score - b.p.score);

  const atProficient = projected.filter((x) => x.p.label === "Proficient" || x.p.label === "Mastered").length;
  const needsWork = projected.filter((x) => x.p.label === "Needs revision" || x.p.label === "Developing");

  const revision = revisionOrder(
    needsWork.map((x) => ({
      conceptId: x.row.conceptId,
      title: x.row.conceptTitle,
      questId: x.row.questId,
      score: x.p.score,
      label: x.p.label,
      lastPracticedAt: x.row.lastPracticedAt,
      daysSince: daysSince(x.row.lastPracticedAt, now),
    })),
  ).slice(0, 5);

  const slips = recurringMisconceptions(practised.map((m) => ({ conceptTitle: m.conceptTitle, misconceptions: m.misconceptions })));
  const slipMax = slips[0]?.count ?? 1;

  const time = timeOnTask(sessions);

  const bySubject = new Map<string, ConceptMasteryInput[]>();
  for (const x of projected) {
    const list = bySubject.get(x.row.subject) ?? [];
    list.push(x.row);
    bySubject.set(x.row.subject, list);
  }
  const subjectGroups = [...bySubject.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const trendReady = p.accuracyOverTime.length >= MIN_TREND_POINTS;

  return (
    <AppShell>
      <div className="space-y-12">
        <header>
          <h1 className="t-large-title text-ink">Progress</h1>
          <p className="mt-2 max-w-2xl t-body text-muted">
            {overallStatement({
              questionsAnswered: p.user.questionsAnswered,
              conceptsPractised: projected.length,
              conceptsAtProficient: atProficient,
              weakCount: needsWork.length,
            })}
          </p>
          <p className="mt-1.5 t-footnote text-muted tabular">
            {p.user.questionsAnswered} questions answered
            {time.runs > 0 && ` · ${formatDuration(time.ms)} across ${time.runs} finished ${time.runs === 1 ? "run" : "runs"}`}
            {time.excluded > 0 && ` · ${time.excluded} run${time.excluded === 1 ? "" : "s"} left open too long to time`}
          </p>
        </header>

        {/* What to do next, before anything to look at. */}
        <section aria-labelledby="revise-h">
          <SectionTitle id="revise-h" note="weakest score first, then longest since practised">
            Worth revising next
          </SectionTitle>
          <Card>
            <CardContent className="pt-5">
              {revision.length === 0 ? (
                <p className="t-subhead text-muted">Nothing is below Proficient right now. Keep one concept ticking over to stop it fading.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {revision.map((r) => (
                    <li key={r.conceptId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <span className="w-11 shrink-0 font-rounded t-headline text-ink tabular">{r.score}%</span>
                      {/* 9rem floor + flex-wrap: the button wraps below at 360 px rather than
                          crushing the concept title. */}
                      <div className="min-w-[9rem] flex-1">
                        <Link href={`/learn/${encodeURIComponent(r.conceptId)}`} className="block truncate t-subhead font-semibold text-ink hover:text-tint">
                          {r.title}
                        </Link>
                        <p className="t-footnote text-muted">
                          <Badge tone={labelTone(r.label)}>{r.label}</Badge> <span className="ml-1">{lastPractisedLabel(r.lastPracticedAt, now)}</span>
                        </p>
                      </div>
                      <PracticeNow questId={r.questId} conceptIds={[r.conceptId]} className="ml-auto" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* The heart of the page: every concept, with the number explained. */}
        <section aria-labelledby="concepts-h">
          <SectionTitle id="concepts-h" note={`${projected.length} practised`}>
            Concept mastery, explained
          </SectionTitle>
          <div className="space-y-6">
            {subjectGroups.map(([subject, rows]) => (
              <Card key={subject}>
                <CardContent className="pt-5">
                  <h3 className="mb-3 t-eyebrow text-muted">{subject}</h3>
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {rows.map((row) => (
                      <li key={row.conceptId} className="min-w-0">
                        <ConceptMasteryCard concept={row} now={now} className="h-full" />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Slips that keep coming back — a list, not a chart: the labels are sentences. */}
        <section aria-labelledby="slips-h">
          <SectionTitle id="slips-h" note="seen more than once">
            Mistakes that keep recurring
          </SectionTitle>
          <Card>
            <CardContent className="pt-5">
              {slips.length === 0 ? (
                <p className="t-subhead text-muted">
                  No mistake has come back more than once yet. Named misconceptions appear here when the same one catches you twice.
                </p>
              ) : (
                <ul className="space-y-4">
                  {slips.map((s) => (
                    <li key={s.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 t-subhead font-semibold text-ink">{s.label}</span>
                        <span className="shrink-0 font-rounded t-subhead text-ink tabular">{s.count}×</span>
                      </div>
                      <Progress value={(s.count / slipMax) * 100} tone="amber" className="mt-1.5" label={`${s.label}: ${s.count} times`} />
                      <p className="mt-1 t-footnote text-muted">On {s.concepts.join(", ")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Per-subject breakdown. */}
          <section aria-labelledby="subjects-h" className="min-w-0">
            <SectionTitle id="subjects-h">Mastery by subject</SectionTitle>
            <Card className="min-w-0">
              <CardContent className="pt-5">
                <ChartFigure
                  summary={
                    p.subjects.length === 0
                      ? "No subjects practised yet."
                      : p.subjects.map((s) => `${s.subject} ${s.mastery}% across ${s.concepts} ${s.concepts === 1 ? "concept" : "concepts"}`).join("; ") + "."
                  }
                  table={
                    <DataTable caption="Average mastery per subject" head={["Subject", "Mastery", "Concepts", "Mastered"]}>
                      {p.subjects.map((s) => (
                        <tr key={s.subject}>
                          <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                            {s.subject}
                          </th>
                          <td className="py-1.5 pr-3 tabular">{s.mastery}%</td>
                          <td className="py-1.5 pr-3 tabular">{s.concepts}</td>
                          <td className="py-1.5 tabular">{s.mastered}</td>
                        </tr>
                      ))}
                    </DataTable>
                  }
                >
                  <SubjectChart data={p.subjects} />
                </ChartFigure>

                <h3 className="mb-2 mt-6 t-eyebrow text-muted">Chapters</h3>
                <ul className="space-y-4">
                  {p.chapters.map((c) => (
                    <li key={c.questId}>
                      <Link href={`/quest/${c.questId}`} className="group block">
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate t-subhead font-semibold text-ink group-hover:text-tint">{c.title}</span>
                          <span className="shrink-0 t-footnote text-muted tabular">
                            {c.conceptsPractised}/{c.conceptsTotal} practised
                          </span>
                        </div>
                        {/* Where this chapter's content came from, stated rather than assumed. */}
                        <OriginBadge origin={c.origin} className="mb-1.5" />
                        <Progress
                          value={(c.conceptsPractised / Math.max(1, c.conceptsTotal)) * 100}
                          label={`${c.title}: ${c.conceptsPractised} of ${c.conceptsTotal} concepts practised`}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Accuracy per completed run. Not drawn from one or two points. */}
          <section aria-labelledby="accuracy-h" className="min-w-0">
            <SectionTitle id="accuracy-h" note="completed runs">
              Accuracy over time
            </SectionTitle>
            <Card className="min-w-0">
              <CardContent className="pt-5">
                {trendReady ? (
                  <ChartFigure
                    summary={`${p.accuracyOverTime.length} finished runs, from ${p.accuracyOverTime[0].accuracy}% on the first to ${
                      p.accuracyOverTime[p.accuracyOverTime.length - 1].accuracy
                    }% on the most recent. Accuracy is this-run performance, not mastery.`}
                    table={
                      <DataTable caption="Accuracy per completed run" head={["Run", "Chapter", "Accuracy"]}>
                        {p.accuracyOverTime.map((r) => (
                          <tr key={r.run}>
                            <th scope="row" className="py-1.5 pr-3 text-left font-semibold tabular">
                              #{r.run}
                            </th>
                            <td className="py-1.5 pr-3">{r.label}</td>
                            <td className="py-1.5 tabular">{r.accuracy}%</td>
                          </tr>
                        ))}
                      </DataTable>
                    }
                  >
                    <AccuracyChart data={p.accuracyOverTime} />
                  </ChartFigure>
                ) : (
                  <Empty>
                    {p.accuracyOverTime.length === 0
                      ? "Finish a quest and your accuracy per run appears here."
                      : `Not enough practice yet to show a trend — ${p.accuracyOverTime.length} of ${MIN_TREND_POINTS} finished runs. Your latest run was ${p.accuracyOverTime[p.accuracyOverTime.length - 1].accuracy}% accurate.`}
                  </Empty>
                )}

                <h3 className="mb-2 mt-6 t-eyebrow text-muted">Improvement after a second chance</h3>
                {p.improvement.length ? (
                  <ChartFigure
                    summary="Accuracy on each concept before its first follow-up question, compared with accuracy from the follow-up onwards."
                    table={
                      <DataTable caption="Accuracy before and after the first follow-up, per concept" head={["Concept", "Before", "After", "Follow-ups right"]}>
                        {p.improvement.map((r) => (
                          <tr key={r.conceptId}>
                            <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                              {r.title}
                            </th>
                            <td className="py-1.5 pr-3 tabular">{r.before == null ? "—" : `${r.before}%`}</td>
                            <td className="py-1.5 pr-3 tabular">{r.after == null ? "—" : `${r.after}%`}</td>
                            <td className="py-1.5 tabular">
                              {r.followUpsCorrect}/{r.followUps}
                            </td>
                          </tr>
                        ))}
                      </DataTable>
                    }
                  >
                    <ImprovementChart data={p.improvement} />
                  </ChartFigure>
                ) : (
                  <Empty>Answer a follow-up question after a mistake and the before/after comparison appears here.</Empty>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="sessions-h" className="min-w-0">
            <SectionTitle id="sessions-h">Recent sessions</SectionTitle>
            <Card className="min-w-0">
              <CardContent className="pb-3 pt-5">
                <ul className="divide-y divide-line">
                  {p.recentSessions.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className="truncate t-subhead font-semibold text-ink">{s.title}</span>
                          {s.kind === "practice" && <span className="shrink-0 t-footnote text-muted">revision</span>}
                        </p>
                        <p className="t-footnote text-muted tabular">
                          {s.correct}/{s.answered} correct · {s.subject || "—"} · {new Date(s.startedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button asChild size="sm" variant={s.status === "active" ? "tinted" : "ghost"} className={s.status === "active" ? undefined : "-mr-2"}>
                        <Link href={s.status === "active" ? `/quest/${s.questId}?session=${s.id}` : `/quest/${s.questId}/results?session=${s.id}`}>
                          {s.status === "active" ? "Resume" : "What you learned"}
                          {s.status === "active" ? null : <ChevronRight />}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="formula-h" className="min-w-0">
            <SectionTitle id="formula-h">How mastery is calculated</SectionTitle>
            <Card className="min-w-0">
              <CardContent className="pt-5">
                <MasteryFormula />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
