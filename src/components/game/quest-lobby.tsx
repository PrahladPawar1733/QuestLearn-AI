"use client";

import { ChevronDown, Loader2 } from "lucide-react";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { WORLDS } from "./types";

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

  const options = [
    ...WORLDS.map((w) => ({ id: w.id, name: w.name, tagline: "Just the questions. Works on any device, with full keyboard and screen-reader support.", game: false })),
    ...playableGames().map((g) => ({ id: g.id as GameWorld, name: g.name, tagline: g.tagline, game: true })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <header>
        <p className="flex flex-wrap items-center gap-x-2 t-footnote text-muted">
          <span>{quest.subject}</span>
          <span aria-hidden>·</span>
          {quest.grade && (
            <>
              <span>Grade {quest.grade}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <OriginBadge origin={quest.origin} />
        </p>
        <h1 className="mt-2 t-large-title text-ink sm:t-display">{quest.title}</h1>
        <p className="mt-3 max-w-xl t-body text-muted">
          {quest.playLength} questions a run, chosen from {quest.questionCount} checked questions across {concepts.length} concepts.
          {quest.rejectedCount > 0 && ` ${quest.rejectedCount} generated question${quest.rejectedCount === 1 ? " was" : "s were"} left out by our checks.`}
        </p>
        {active && (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3">
            <p className="t-subhead text-ink">
              Run in progress <span className="text-muted">· {active.answered} of {quest.playLength} answered</span>
            </p>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => router.push(`/quest/${quest.id}?session=${active.id}`)}>
              Resume
            </Button>
          </div>
        )}
      </header>

      <section aria-labelledby="games-heading">
        <h2 id="games-heading" className="t-title3 text-ink">
          How do you want to play?
        </h2>
        <p className="mt-1 t-subhead text-muted">The questions, marking and mastery are the same in each.</p>
        <div role="radiogroup" aria-labelledby="games-heading" className="mt-4 grid gap-3">
          {options.map((o) => {
            const on = world === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${o.name}: ${o.tagline}`}
                onClick={() => {
                  setWorld(o.id);
                  haptic("selection");
                }}
                className={cn(
                  "pressable surface flex w-full items-center gap-4 rounded-[20px] p-3 text-left transition-shadow sm:p-4",
                  on ? "ring-2 ring-tint shadow-[0_10px_28px_-12px_rgb(91_69_240/0.55)]" : "hover:shadow-[var(--shadow-float)]",
                )}
              >
                <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:h-20 sm:w-32">
                  {o.game ? <GamePreview id={o.id as never} /> : <FocusThumb />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block t-headline text-ink">{o.name}</span>
                  <span className="block t-footnote text-muted">{o.tagline}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors",
                    on ? "bg-brand ring-transparent" : "ring-line-strong",
                  )}
                >
                  {on && <span className="size-2 rounded-full bg-on-tint" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="lg" onClick={start} disabled={busy} className="max-sm:w-full">
            {busy ? <Loader2 className="animate-spin" /> : null} {active ? "Start a new run" : "Start quest"}
          </Button>
          <p className="t-footnote text-muted">
            {error ? <span className="text-danger">{error}</span> : completedRuns > 0 ? `Played ${completedRuns} time${completedRuns === 1 ? "" : "s"}` : `${quest.playLength} questions, about ${Math.max(3, Math.round(quest.playLength * 0.6))} minutes`}
          </p>
        </div>
      </section>

      {extracted && (
        <section aria-labelledby="brief-heading">
          <details className="group border-t border-line">
            <summary className="flex cursor-pointer list-none items-center gap-3 py-4">
              <span className="min-w-0 flex-1">
                <span id="brief-heading" className="block t-headline text-ink">
                  Read the chapter first
                </span>
                <span className="block t-footnote text-muted">
                  {extracted.concepts.length} concepts · {extracted.formulas.length} formulas · {extracted.definitions.length} definitions
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
            </summary>
            <div className="pb-4">
              <ChapterBrief
                extracted={extracted}
                conceptQuestionCounts={Object.fromEntries(concepts.map((c) => [c.title.trim().toLowerCase(), c.questions]))}
                originNote={<OriginBadge origin={quest.origin} />}
              />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

/** Thumbnail for the plain question mode: four answer letters, nothing else. */
function FocusThumb() {
  return (
    <span aria-hidden className="grid h-full w-full grid-cols-2 place-content-center gap-1 p-3">
      {["A", "B", "C", "D"].map((l) => (
        <span key={l} className="rounded-[4px] bg-surface py-0.5 text-center text-[9px] font-medium text-muted shadow-[inset_0_0_0_1px_var(--line)]">
          {l}
        </span>
      ))}
    </span>
  );
}
