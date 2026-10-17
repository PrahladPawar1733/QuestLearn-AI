"use client";

import { Check, ChevronRight, Loader2, Play, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/ui/origin-badge";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import type { SessionView } from "@/lib/services/play";
import type { ContentOrigin, GameWorld } from "@/lib/types";
import { WORLDS, worldMeta } from "./types";
import { WorldPreview } from "./world-preview";

interface Props {
  quest: { id: string; title: string; subject: string; grade: string; origin: ContentOrigin; playLength: number; questionCount: number; rejectedCount: number };
  concepts: { id: string; title: string; description: string; fromNotes: boolean; questions: number }[];
  active: { id: string; answered: number; world: GameWorld } | null;
  completedRuns: number;
  defaultWorld?: GameWorld;
}

export function QuestLobby({ quest, concepts, active, completedRuns, defaultWorld }: Props) {
  const router = useRouter();
  const [world, setWorld] = useState<GameWorld>(defaultWorld && WORLDS.some((w) => w.id === defaultWorld) ? defaultWorld : "classic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const v = await api<SessionView>(`/api/quests/${quest.id}/start`, { method: "POST", json: { world }, retries: 0 });
      router.push(`/quest/${quest.id}?session=${v.session.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the quest.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10 pb-28">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{quest.subject}</Badge>
          <Badge>Grade {quest.grade}</Badge>
          <OriginBadge origin={quest.origin} />
        </div>
        <h1 className="t-large-title text-ink sm:t-display">{quest.title}</h1>
        <p className="max-w-2xl t-body text-muted">
          {quest.playLength} questions per run, picked adaptively from {quest.questionCount} checked questions across {concepts.length} concepts.
          {quest.rejectedCount > 0 && ` ${quest.rejectedCount} generated question${quest.rejectedCount === 1 ? " was" : "s were"} rejected by our checks.`}
        </p>
        {active && (
          <button
            type="button"
            onClick={() => router.push(`/quest/${quest.id}?session=${active.id}`)}
            className="pressable surface flex w-full max-w-md items-center gap-3 rounded-2xl p-3 text-left"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-tint/14 text-tint">
              <RotateCcw className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block t-headline text-ink">Resume your run</span>
              <span className="block t-footnote text-muted">
                {active.answered} of {quest.playLength} answered · {worldMeta(active.world).name}
              </span>
            </span>
            <ChevronRight className="size-5 text-faint" />
          </button>
        )}
      </header>

      <section aria-labelledby="world-heading">
        <div className="mb-3 px-1">
          <h2 id="world-heading" className="t-title2 text-ink">
            Choose a world
          </h2>
          <p className="t-subhead text-muted">Same questions and scoring in every world. Pick the one you enjoy.</p>
        </div>
        {/* Phone: native scroll-snap carousel (native momentum). Desktop: grid. */}
        <div
          role="radiogroup"
          aria-labelledby="world-heading"
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
        >
          {WORLDS.map((w) => {
            const on = world === w.id;
            return (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setWorld(w.id);
                  haptic("selection");
                }}
                className={cn(
                  "pressable surface relative w-[72%] shrink-0 snap-center overflow-hidden rounded-[1.25rem] text-left sm:w-auto",
                  on ? "ring-2 ring-tint" : "ring-0",
                )}
              >
                <div className={cn("h-28", w.accent)}>
                  <WorldPreview world={w.id} />
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-2 t-headline text-ink">
                    <span aria-hidden>{w.emoji}</span> {w.name}
                  </p>
                  <p className="mt-0.5 t-subhead text-muted">{w.tagline}</p>
                  <p className="mt-2 t-caption text-faint">{w.unit}</p>
                </div>
                {on && (
                  <motion.span layoutId="world-check" className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-tint text-on-tint shadow-sm">
                    <Check className="size-4" strokeWidth={3} />
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="concepts-heading">
        <h2 id="concepts-heading" className="mb-3 px-1 t-title2 text-ink">
          Concepts
        </h2>
        <ul className="surface divide-y divide-line overflow-hidden rounded-[1.25rem]">
          {concepts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-tint/14 font-rounded t-subhead font-bold text-tint">{c.questions}</span>
              <div className="min-w-0 flex-1">
                <p className="t-headline text-ink">{c.title}</p>
                <p className="t-subhead text-muted">{c.description}</p>
              </div>
              <span className="mt-1 hidden shrink-0 t-caption text-faint sm:block">{c.fromNotes ? "From your notes" : "Background"}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Floating action bar (material): the one primary action on this screen. */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="material-thick mx-auto flex max-w-3xl items-center gap-3 rounded-[1.5rem] p-2.5 pl-4">
          <div className="min-w-0 flex-1">
            <p className="truncate t-subhead font-semibold text-ink">
              {worldMeta(world).emoji} {worldMeta(world).name}
            </p>
            <p className="truncate t-caption text-muted">
              {error ? <span className="text-danger">{error}</span> : completedRuns > 0 ? `Completed ${completedRuns} time${completedRuns === 1 ? "" : "s"}` : `${quest.playLength} questions`}
            </p>
          </div>
          <Button size="lg" onClick={start} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />} {active ? "New Run" : "Start Quest"}
          </Button>
        </div>
      </div>
    </div>
  );
}
