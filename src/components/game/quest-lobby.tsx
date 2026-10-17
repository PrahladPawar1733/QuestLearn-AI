"use client";

import { BookOpen, Check, ChevronDown, ChevronRight, Loader2, Play, RotateCcw } from "lucide-react";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/ui/origin-badge";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import type { SessionView } from "@/lib/services/play";
import type { ContentOrigin, ExtractedContent, GameWorld } from "@/lib/types";
import { ChapterBrief } from "@/components/learn/chapter-brief";
import { GamePreview } from "@/components/games/game-preview";
import { playableGames } from "@/components/games/registry";
import { WORLDS, worldMeta } from "./types";
import { WorldPreview } from "./world-preview";

interface Props {
  quest: { id: string; title: string; subject: string; grade: string; origin: ContentOrigin; playLength: number; questionCount: number; rejectedCount: number };
  concepts: { id: string; title: string; description: string; fromNotes: boolean; questions: number }[];
  active: { id: string; answered: number; world: GameWorld } | null;
  completedRuns: number;
  defaultWorld?: GameWorld;
  /** The chapter brief extracted from the student's own material. */
  extracted: ExtractedContent | null;
}

export function QuestLobby({ quest, concepts, active, completedRuns, defaultWorld, extracted }: Props) {
  const router = useRouter();
  const [world, setWorld] = useState<GameWorld>(defaultWorld ?? "classic");
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

      <section aria-labelledby="games-heading">
        <div className="mb-3 px-1">
          <h2 id="games-heading" className="t-title2 text-ink">
            How do you want to learn this?
          </h2>
          <p className="t-subhead text-muted">
            Same questions, same marking, same mastery either way. Start with the questions — add a game when you want one.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="games-heading"
          className="grid gap-3 sm:grid-cols-2"
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
                  "pressable surface relative overflow-hidden rounded-[1.5rem] text-left",
                  on ? "ring-2 ring-tint" : "ring-0",
                )}
              >
                <div className={cn("h-44 p-6", w.accent)}>
                  <WorldPreview world={w.id} />
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-2 t-title3 text-ink">
                    {w.name}
                    <span className="rounded-full bg-tint/14 px-2 py-0.5 t-caption font-semibold text-tint">Recommended</span>
                  </p>
                  <p className="mt-0.5 t-subhead text-muted">{w.tagline}</p>
                  <ul className="mt-2.5 space-y-1 t-caption text-faint">
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 shrink-0 text-tint" /> Works on any device, no 3D needed
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 shrink-0 text-tint" /> Full keyboard and screen-reader support
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 shrink-0 text-tint" /> {w.unit}
                    </li>
                  </ul>
                </div>
                {on && (
                  <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-tint text-on-tint shadow-sm">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          {playableGames().map((g) => {
            const on = world === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${g.name} — ${g.tagline}`}
                onClick={() => {
                  setWorld(g.id);
                  haptic("selection");
                }}
                className={cn(
                  "pressable surface relative overflow-hidden rounded-[1.5rem] text-left",
                  on ? "ring-2 ring-tint" : "ring-0",
                )}
              >
                <div className="relative h-36">
                  <GamePreview id={g.id} />
                  <span className="absolute left-3 top-3 rounded-full bg-[rgba(8,10,18,0.66)] px-2.5 py-1 t-caption font-semibold text-white backdrop-blur-md">
                    {g.intensity === "calm" ? "Calm" : g.intensity === "steady" ? "Steady" : "Fast"}
                  </span>
                </div>
                <div className="p-4">
                  <p className="t-title3 text-ink">{g.name}</p>
                  <p className="mt-0.5 t-subhead text-muted">{g.tagline}</p>
                  <p className="mt-2 t-caption text-faint">Good for {g.subjects.join(" · ")}</p>
                </div>
                {on && (
                  <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-tint text-on-tint shadow-sm">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}

        </div>
      </section>

      {extracted && (
        <section aria-labelledby="brief-heading">
          <details className="surface group overflow-hidden rounded-[1.5rem]">
            <summary className="pressable flex cursor-pointer list-none items-center gap-3 p-4 sm:px-5">
              <BookOpen className="size-4 shrink-0 text-tint" />
              <span className="min-w-0 flex-1">
                <span id="brief-heading" className="block t-headline text-ink">
                  Read the chapter first
                </span>
                <span className="block t-caption text-faint">
                  Two minutes · {extracted.concepts.length} concepts · {extracted.formulas.length} formulas ·{" "}
                  {extracted.definitions.length} definitions
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line px-4 py-4 sm:px-5">
              <ChapterBrief
                extracted={extracted}
                conceptQuestionCounts={Object.fromEntries(concepts.map((c) => [c.title.trim().toLowerCase(), c.questions]))}
                originNote={<OriginBadge origin={quest.origin} />}
              />
            </div>
          </details>
        </section>
      )}

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
