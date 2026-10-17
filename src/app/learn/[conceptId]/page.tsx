import { BookOpen, ChevronLeft, Gamepad2, Sigma } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LearnPractice } from "@/components/game/learn-practice";
import { AppShell } from "@/components/layout/app-shell";
import { Tex, RichText } from "@/components/math/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { masteryTone, Progress } from "@/components/ui/progress";
import { Visual } from "@/components/viz/visual";
import { db } from "@/lib/db";
import { DEMO_LESSONS } from "@/lib/demo/collisions";
import { masteryLabel } from "@/lib/engine/mastery";
import { requireUid } from "@/lib/identity";
import { orNotFound } from "@/lib/server-data";
import { loadConcept } from "@/lib/services/access";
import type { ConceptMastery, Material, Question } from "@/lib/types";

export const metadata: Metadata = { title: "Concept · QuestLearn AI" };

export default async function LearnPage(props: PageProps<"/learn/[conceptId]">) {
  const { conceptId } = await props.params;
  const id = decodeURIComponent(conceptId);
  const uid = await requireUid();
  const concept = await orNotFound(loadConcept(id, uid));
  const [mastery, material, questions] = await Promise.all([
    db().get<ConceptMastery>("mastery", `${uid}__${id}`),
    db().get<Material>("materials", concept.materialId),
    concept.questId ? db().list<Question>("questions", { questId: concept.questId, conceptId: id }) : Promise.resolve([] as Question[]),
  ]);
  const lesson = DEMO_LESSONS[id];
  const formulas = material?.extracted?.formulas ?? [];
  const visual = questions.find((q) => q.visual && !q.followUpOf)?.visual;
  const label = masteryLabel(mastery?.masteryScore ?? 0, mastery?.attempts ?? 0);
  const topMisconceptions = Object.entries(mastery?.misconceptions ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const practised = !!mastery && mastery.attempts > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={concept.questId ? `/quest/${concept.questId}` : "/dashboard"} className="-ml-1.5 inline-flex items-center t-body text-tint hover:opacity-70">
          <ChevronLeft className="size-5" aria-hidden /> {concept.questId ? "Back to quest" : "Back to Dashboard"}
        </Link>

        {/* Hero */}
        <header>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge tone="primary">{concept.subject}</Badge>
            <Badge className="capitalize">{concept.difficulty}</Badge>
            <Badge tone={concept.fromNotes ? "success" : "neutral"}>{concept.fromNotes ? "From your material" : "Background knowledge"}</Badge>
          </div>
          <h1 className="t-large-title text-ink">{concept.title}</h1>
          <p className="mt-2 t-body text-muted">{concept.description}</p>
        </header>

        {/* Mastery */}
        <Card>
          <CardHeader>
            <CardTitle className="t-title3">Your mastery</CardTitle>
            <Badge tone={label === "Mastered" ? "success" : label === "Needs revision" ? "amber" : "cyan"}>{label}</Badge>
          </CardHeader>
          <CardContent>
            {practised ? (
              <>
                <p className="font-rounded text-[2.5rem] font-bold leading-none tracking-tight text-ink tabular">
                  {mastery.masteryScore}
                  <span className="ml-0.5 text-xl font-semibold text-muted">%</span>
                </p>
                <Progress value={mastery.masteryScore} tone={masteryTone(mastery.masteryScore)} className="mt-3 h-2" label={`${concept.title} mastery`} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-surface-2 px-4 py-3">
                    <p className="font-rounded t-title3 font-bold text-ink tabular">
                      {mastery.correctAttempts}/{mastery.attempts}
                    </p>
                    <p className="t-footnote text-muted">correct</p>
                  </div>
                  <div className="rounded-2xl bg-surface-2 px-4 py-3">
                    <p className="font-rounded t-title3 font-bold text-ink tabular">
                      {mastery.followUpCorrect}/{mastery.followUpAttempts}
                    </p>
                    <p className="t-footnote text-muted">follow-ups fixed</p>
                  </div>
                </div>
                {topMisconceptions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 t-eyebrow text-muted">Slips to watch</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {topMisconceptions.map(([m, n]) => (
                        <Badge key={m} tone="amber">
                          {m.replace(/-/g, " ")} <span className="font-rounded tabular">×{n}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="t-subhead text-muted">Not practised yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Lesson */}
        {lesson && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 t-title3">
                <BookOpen className="size-5 text-tint" aria-hidden /> The idea
              </CardTitle>
              <Badge tone="amber">Prepared lesson</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <RichText as="p" text={lesson.explanation} className="t-body text-ink" />
              <div className="rounded-2xl bg-surface-2 p-4">
                <h3 className="mb-1.5 t-eyebrow text-muted">In everyday terms</h3>
                <RichText as="p" text={lesson.simple} className="t-body text-ink" />
              </div>
              {lesson.keyEquations.length > 0 && (
                <div>
                  <h3 className="mb-1.5 t-eyebrow text-muted">Key equations</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {lesson.keyEquations.map((k, i) => (
                      <div key={i} className="min-w-0 rounded-2xl bg-surface-2 px-4 py-3">
                        <Tex tex={k.latex} display className="block text-ink" />
                        <p className="t-footnote text-muted">{k.meaning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!lesson && formulas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 t-title3">
                <Sigma className="size-5 text-tint" aria-hidden /> Formulas from this chapter
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {formulas.slice(0, 6).map((f, i) => (
                <div key={i} className="min-w-0 rounded-2xl bg-surface-2 px-4 py-3">
                  <Tex tex={f.latex} display className="block text-ink" />
                  <p className="t-footnote text-muted">
                    {f.meaning} {f.sourceRef ? `· ${f.sourceRef}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {visual && <Visual spec={visual} />}

        {concept.sourceRefs.length > 0 && (
          <p className="px-1 t-footnote text-muted">
            <span className="font-semibold">Sources:</span>{" "}
            {concept.sourceRefs.map((s) => (
              <span key={s.ref} className="mr-2">
                {s.ref}
                {s.quote ? ` "${s.quote}"` : ""}
              </span>
            ))}
          </p>
        )}

        {/* Actions */}
        {concept.questId && (
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-start">
            <LearnPractice questId={concept.questId} conceptId={concept.id} />
            <Button asChild variant="secondary" size="lg">
              <Link href={`/quest/${concept.questId}`}>
                <Gamepad2 /> Play the full quest
              </Link>
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
