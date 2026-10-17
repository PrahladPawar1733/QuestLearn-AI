"use client";

import { Atom, BarChart3, Clock, Crown, Flag, Flame, Globe, LayoutGrid, Loader2, Repeat, Sparkles, Target, Trophy, Upload, Zap } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { masteryTone, Progress } from "@/components/ui/progress";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { materialize, spring } from "@/lib/motion";
import type { SessionView } from "@/lib/services/play";
import type { AdaptationNote, ContentOrigin, GameWorld } from "@/lib/types";
import { worldMeta } from "./types";

const ICONS: Record<string, typeof Trophy> = { Flag, Flame, Sparkles, Atom, Crown, Globe };

interface Data {
  quest: { id: string; title: string; subject: string; origin: ContentOrigin };
  kind: "quest" | "practice";
  world: GameWorld;
  totals: { xp: number; completionBonus: number; accuracy: number; answered: number; correct: number; followUps: number; followUpsCorrect: number; bestStreak: number; durationMs: number | null };
  perConcept: { conceptId: string; title: string; answered: number; correct: number; followUpFixed: boolean; mastery: number; label: string }[];
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

/** Accuracy ring (Fitness-style): the stroke fills on a critically damped spring. */
function Ring({ value, reduced }: { value: number; reduced: boolean }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const v = useMotionValue(reduced ? value : 0);
  const offset = useTransform(v, (x) => C * (1 - x / 100));
  const label = useTransform(v, (x) => `${Math.round(x)}%`);
  useEffect(() => {
    if (reduced) return;
    const c = animate(v, value, { ...spring.gentle, duration: 1.1, delay: 0.25 });
    return () => c.stop();
  }, [v, value, reduced]);
  const tone = value >= 80 ? "var(--green-fill)" : value >= 50 ? "var(--tint)" : "var(--orange-fill)";
  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--fill-3)" strokeWidth="12" />
        <motion.circle cx="60" cy="60" r={R} fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} style={{ strokeDashoffset: offset }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="font-rounded t-title1 text-ink tabular">{label}</motion.span>
        <span className="t-caption text-muted">accuracy</span>
      </div>
    </div>
  );
}

export function ResultsView({ questId, data }: { questId: string; data: Data }) {
  const reduced = !!useReducedMotion();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = data.totals;
  const headline = t.accuracy >= 90 ? "Outstanding." : t.accuracy >= 70 ? "Great run." : t.accuracy >= 50 ? "Good effort." : "Every mistake taught you something.";

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

  const stats = [
    { icon: Zap, color: "bg-tint", label: "XP earned", value: `+${t.xp}` },
    { icon: Target, color: "bg-success-fill", label: "Correct", value: `${t.correct}/${t.answered}` },
    { icon: Flame, color: "bg-amber-fill", label: "Best streak", value: String(t.bestStreak) },
    { icon: Repeat, color: "bg-teal", label: "Mistakes fixed", value: `${t.followUpsCorrect}/${t.followUps}` },
    { icon: Clock, color: "bg-blue", label: "Time", value: duration(t.durationMs) },
    { icon: BarChart3, color: "bg-purple", label: "Concepts", value: String(data.perConcept.length) },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Completion: the trophy materializes, the ring fills. Calm, not confetti. */}
      <section className="surface flex flex-col items-center gap-6 rounded-[1.75rem] px-6 py-10 text-center sm:flex-row sm:text-left">
        <motion.div
          {...(reduced ? {} : materialize)}
          transition={spring.gentle}
          className="flex size-20 shrink-0 items-center justify-center rounded-[1.4rem] bg-amber-fill text-white shadow-[0_10px_30px_-10px_var(--orange-fill)]"
        >
          <Trophy className="size-10" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="t-eyebrow text-amber">{data.kind === "practice" ? "Revision complete" : "Quest complete"}</p>
          <h1 className="mt-1 t-large-title text-ink">{headline}</h1>
          <p className="mt-1 t-subhead text-muted">
            {data.quest.title} · {worldMeta(data.world).emoji} {worldMeta(data.world).name}
            {t.completionBonus ? ` · +${t.completionBonus} XP completion bonus` : ""}
          </p>
        </div>
        <Ring value={t.accuracy} reduced={reduced} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Quest statistics">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.default, delay: 0.15 + i * 0.04 }}
            className="surface rounded-[1.25rem] p-4"
          >
            <span className={cn("mb-3 flex size-7 items-center justify-center rounded-lg text-white", s.color)}>
              <s.icon className="size-4" />
            </span>
            <p className="font-rounded t-title2 text-ink tabular">{s.value}</p>
            <p className="t-footnote text-muted">{s.label}</p>
          </motion.div>
        ))}
      </section>

      {/* Recommendation: the next step, based on this run's data. */}
      <section className="rounded-[1.75rem] bg-tint/10 p-6">
        <p className="t-eyebrow text-tint">Recommended next</p>
        <h2 className="mt-1 t-title2 text-ink">{data.recommendation.title}</h2>
        <p className="mt-1 t-body text-muted">{data.recommendation.detail}</p>
        {error && <p className="mt-3 t-subhead text-danger">{error}</p>}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {data.weakConceptIds.length > 0 && (
            <Button size="lg" onClick={practice} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Practice Weak Concepts
            </Button>
          )}
          {data.recommendation.action === "new" && (
            <Button asChild size="lg" variant={data.weakConceptIds.length ? "secondary" : "primary"}>
              <Link href="/create">
                <Upload /> Create a New Quest
              </Link>
            </Button>
          )}
          {data.recommendation.action === "replay" && (
            <Button asChild size="lg" variant="secondary">
              <Link href={`/quest/${questId}`}>
                <Repeat /> Replay Quest
              </Link>
            </Button>
          )}
          <Button asChild size="lg" variant="secondary">
            <Link href="/dashboard">
              <LayoutGrid /> Return to Dashboard
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mastery by concept</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {data.perConcept.map((c) => (
                <li key={c.conceptId}>
                  <div className="mb-1.5 flex items-center gap-2 t-subhead">
                    <Link href={`/learn/${encodeURIComponent(c.conceptId)}`} className="font-semibold text-ink hover:text-tint">
                      {c.title}
                    </Link>
                    {c.followUpFixed && <Badge tone="success">fixed a mistake</Badge>}
                    <span className="ml-auto t-footnote text-muted tabular">
                      {c.correct}/{c.answered} · {c.label}
                    </span>
                  </div>
                  <Progress value={c.mastery} tone={masteryTone(c.mastery)} label={`${c.title} mastery ${c.mastery}%`} />
                </li>
              ))}
            </ul>
            <p className="mt-4 t-footnote text-faint">Mastery uses your recent results on each concept across sessions. One correct answer never counts as mastery.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How your quest adapted</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5">
              {data.adaptations.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 t-subhead">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-2 py-0.5 t-caption font-semibold capitalize",
                      a.targetDifficulty === "hard" ? "bg-danger-fill/14 text-danger" : a.targetDifficulty === "medium" ? "bg-cyan/14 text-cyan" : "bg-success-fill/16 text-success",
                    )}
                  >
                    {a.targetDifficulty}
                  </span>
                  <span className="text-ink">{a.reason}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {data.achievements.length > 0 && (
        <section aria-labelledby="ach-h">
          <h2 id="ach-h" className="mb-3 px-1 t-title3 text-ink">
            Achievements earned this run
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.achievements.map((a, i) => {
              const Icon = ICONS[a.icon] ?? Trophy;
              return (
                <motion.div
                  key={a.id}
                  initial={reduced ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring.default, delay: 0.5 + i * 0.06 }}
                  className="surface flex items-center gap-3 rounded-[1.25rem] p-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-fill text-white">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="t-headline text-ink">{a.title}</p>
                    <p className="t-footnote text-muted">{a.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
