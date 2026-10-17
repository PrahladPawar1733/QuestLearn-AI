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
import { OriginBadge } from "@/components/ui/origin-badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { requireUid } from "@/lib/identity";
import { nowIso } from "@/lib/ids";
import { progressSnapshot } from "@/lib/services/progress";
import type { ConceptMastery } from "@/lib/types";

export const metadata: Metadata = { title: "Chapters · QuestLearn" };

function SectionTitle({ children, note, id }: { children: React.ReactNode; note?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <h2 id={id} className="t-headline text-ink">
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

  const chapters = p.chapters.length
    ? p.chapters
    : [{ questId: DEMO_QUEST_ID, title: "Collisions", subject: "Physics", origin: "demo_prepared" as const, conceptsTotal: 6, conceptsPractised: 0, conceptsMastered: 0, mastery: 0, completedRuns: 0 }];
  const pending = p.materials.filter((m) => !m.questId);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-12">
        <header>
          <h1 className="t-large-title text-ink">Your chapters</h1>
          <p className="mt-2 max-w-xl t-body text-muted">
            {overallStatement({
              questionsAnswered: u.questionsAnswered,
              conceptsPractised: projected.length,
              conceptsAtProficient: atProficient,
              weakCount: needsWork.length,
            })}
          </p>
        </header>

        {/* One obvious next step. */}
        {(p.continueSession || lastRun || readyMaterial?.questId) && (
          <section aria-labelledby="continue-h" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-surface-2 p-5">
            <div className="min-w-0 flex-1">
              <p id="continue-h" className="t-footnote text-muted">
                {p.continueSession ? "Unfinished run" : lastRun ? "Last played" : "Ready to play"}
              </p>
              <p className="mt-0.5 truncate t-title3 text-ink">{p.continueSession?.title ?? lastRun?.title ?? readyMaterial?.title}</p>
              <p className="mt-0.5 t-footnote text-muted tabular">
                {p.continueSession
                  ? `${p.continueSession.answered} of ${p.continueSession.playLength} answered`
                  : lastRun
                    ? `${lastRun.correct} of ${lastRun.answered} right · ${new Date(lastRun.startedAt).toLocaleDateString()}`
                    : "Your questions have been written and checked."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.continueSession ? (
                <Button asChild>
                  <Link href={`/quest/${p.continueSession.questId}?session=${p.continueSession.id}`}>Resume</Link>
                </Button>
              ) : lastRun ? (
                <>
                  <Button asChild variant="secondary">
                    <Link href={`/quest/${lastRun.questId}/results?session=${lastRun.id}`}>Results</Link>
                  </Button>
                  <Button asChild>
                    <Link href={`/quest/${lastRun.questId}`}>Play again</Link>
                  </Button>
                </>
              ) : (
                <Button asChild>
                  <Link href={`/quest/${readyMaterial!.questId}`}>Start</Link>
                </Button>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="chapters-h">
          <SectionTitle id="chapters-h" note={<Link href="/create" className="text-ink hover:opacity-70">New quest</Link>}>
            Chapters
          </SectionTitle>
          <ul className="divide-y divide-line">
            {chapters.map((c) => (
              <li key={c.questId}>
                <Link href={`/quest/${c.questId}`} className="group flex items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate t-headline text-ink group-hover:opacity-70">{c.title}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 t-footnote text-muted">
                      <span>{c.subject}</span>
                      <span aria-hidden>·</span>
                      <OriginBadge origin={c.origin} className="t-footnote font-normal" />
                    </p>
                  </div>
                  <div className="w-28 shrink-0 text-right sm:w-36">
                    <p className="t-footnote text-muted tabular">
                      {c.conceptsPractised} / {c.conceptsTotal} concepts
                    </p>
                    <Progress
                      value={(c.conceptsPractised / Math.max(1, c.conceptsTotal)) * 100}
                      className="mt-1.5"
                      label={`${c.title}: ${c.conceptsPractised} of ${c.conceptsTotal} concepts practised`}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {!p.chapters.length && (
            <p className="mt-3 t-footnote text-muted">
              Collisions is a sample chapter.{" "}
              <Link href="/create" className="text-ink underline underline-offset-2 hover:opacity-70">
                Upload your own notes
              </Link>{" "}
              to make a quest from them.
            </p>
          )}
        </section>

        {p.hasActivity && due.length > 0 && (
          <section aria-labelledby="due-h">
            <SectionTitle id="due-h" note="weakest first">
              Due for revision
            </SectionTitle>
            <ul className="divide-y divide-line">
              {due.map((d, i) => (
                <li key={d.conceptId} className="py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="w-10 shrink-0 t-headline text-ink tabular">{d.score}%</span>
                    <div className="min-w-[9rem] flex-1">
                      <Link href={`/learn/${encodeURIComponent(d.conceptId)}`} className="block truncate t-subhead font-medium text-ink hover:opacity-70">
                        {d.title}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 t-footnote text-muted">
                        <Badge tone={labelTone(d.label)}>{d.label}</Badge>
                        {lastPractisedLabel(d.lastPracticedAt, now)}
                      </p>
                    </div>
                    <PracticeNow questId={d.questId} conceptIds={[d.conceptId]} className="ml-auto" />
                  </div>
                  {i === 0 && <p className="mt-2 pl-14 t-footnote text-muted">{d.next}</p>}
                </li>
              ))}
            </ul>
            <MasteryDisclaimer className="mt-3" />
          </section>
        )}

        {pending.length > 0 && (
          <section aria-labelledby="uploads-h">
            <SectionTitle id="uploads-h">In progress</SectionTitle>
            <ul className="divide-y divide-line">
              {pending.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate t-subhead font-medium text-ink">{m.title}</p>
                    <p className={cn("t-footnote", m.stage === "failed" ? "text-amber" : "text-muted")}>
                      {m.files} file{m.files === 1 ? "" : "s"} · {m.stage === "failed" ? "Needs attention" : `Processing: ${m.stage}`}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/create?material=${m.id}`}>Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.recentSessions.length > 0 && (
          <section aria-labelledby="recent-h">
            <SectionTitle
              id="recent-h"
              note={
                <Link href="/progress" className="text-ink hover:opacity-70">
                  All progress
                </Link>
              }
            >
              Recent runs
            </SectionTitle>
            <ul className="divide-y divide-line">
              {p.recentSessions.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link
                    href={s.status === "active" ? `/quest/${s.questId}?session=${s.id}` : `/quest/${s.questId}/results?session=${s.id}`}
                    className="group flex items-center gap-3 py-3.5"
                  >
                    <span className="min-w-0 flex-1 truncate t-subhead text-ink group-hover:opacity-70">
                      {s.title}
                      {s.kind === "practice" && <span className="text-muted"> · revision</span>}
                    </span>
                    <span className="shrink-0 t-footnote text-muted tabular">
                      {s.status === "active" ? "In progress" : `${s.correct}/${s.answered} right`} · {new Date(s.startedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* XP and streaks measure turning up, not understanding: kept to one quiet line. */}
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 t-footnote text-muted">
          <span className="tabular">
            Level {u.level.level} · {u.totalXP} XP{u.streakDays > 0 ? ` · ${u.streakDays}-day streak` : ""}
          </span>
          <details className="group">
            <summary className="cursor-pointer list-none text-ink hover:opacity-70">
              Achievements {u.achievements.filter((a) => a.earnedAt).length}/{u.achievements.length}
            </summary>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {u.achievements.map((a) => (
                <li key={a.id}>
                  <p className={cn("t-footnote", a.earnedAt ? "font-medium text-ink" : "text-muted")}>
                    <span className="sr-only">{a.earnedAt ? "Earned: " : "Locked: "}</span>
                    {a.title}
                  </p>
                  <p className="t-caption text-faint">{a.description}</p>
                </li>
              ))}
            </ul>
          </details>
          <span className="ml-auto">
            <DeleteDataButton />
          </span>
        </footer>
      </div>
    </AppShell>
  );
}
