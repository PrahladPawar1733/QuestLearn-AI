"use client";

/**
 * The narrated-scene player.
 *
 * A video-style lesson built from the deterministic diagrams we already have:
 * it moves, it can talk, it stops and asks a question, and it carries on
 * differently depending on the answer — while being unable to contradict the
 * answer key, because every number on screen is recomputed by
 * `src/components/viz/` rather than played back from a file.
 *
 * ### Captions are the primary channel
 *
 * The caption is always on screen. It is not a toggle, because a toggle is
 * off by default and therefore not a channel. Most students using this in a
 * classroom or on a bus have audio off, so "visual + caption + transport" is
 * the *normal* mode and generated narration is an enhancement layered on top.
 *
 * ### Accessibility
 *
 *  - Captions always rendered; `aria-live="polite"` only while the cue is
 *    advancing on its own, because a change the student caused themselves
 *    should not be announced twice.
 *  - Every transport control is a real `<button>`; the scrub bar is a row of
 *    per-cue buttons rather than a custom slider, so it is keyboard- and
 *    screen-reader-operable with no ARIA guesswork. Space/K toggles play,
 *    arrow keys step cues.
 *  - `prefers-reduced-motion` turns off silent auto-advance, so nothing moves
 *    without a press, and the diagrams already honour the same signal
 *    themselves.
 *  - No audio is ever started without a user gesture: the player's
 *    `audioAllowed` starts false and only an explicit press flips it.
 *  - A full static transcript sits under the player, for skimming and print.
 */
import { ChevronRight, Gauge, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RichText } from "@/components/math/rich-text";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/ui/origin-badge";
import { Visual } from "@/components/viz/visual";
import { cn } from "@/lib/cn";
import { sceneHasNarration } from "@/lib/lesson/generation";
import { ScenePlayer, type ScenePlayerAudio, type ScenePlayerSnapshot } from "@/lib/lesson/player";
import { sceneChapters, sceneTranscript } from "@/lib/lesson/scene";
import type { CheckpointCue, NarratedScene } from "@/lib/lesson/types";
import type { VisualSpec } from "@/lib/types";
import { ReadAloudButton } from "./read-aloud-button";
import { SceneCheckpoint, type CheckpointAnswerHandler } from "./scene-checkpoint";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export interface NarratedSceneProps {
  scene: NarratedScene;
  /**
   * Server-backed scoring for checkpoints. See the contract at the top of
   * `scene-checkpoint.tsx`. When omitted, checkpoints render as a preview
   * (question visible, no marking) — which is the right thing in a lobby,
   * where there is no session to score against.
   */
  onAnswer?: CheckpointAnswerHandler;
  /** Reveal the stored hint for the open checkpoint. */
  onHint?: (questionId: string) => Promise<string>;
  /** The scene reached its last cue. */
  onComplete?: () => void;
  /**
   * Web Audio sink for generated narration — see
   * `createWebAudioSceneAudio()`. Omit for the caption-only lesson.
   */
  audio?: ScenePlayerAudio | null;
  /**
   * Called from the student's press on "Turn on narration". Resolve true once
   * the audio context is actually running (`gameAudio.unlock()`).
   */
  onUnlockAudio?: () => Promise<boolean>;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* The hook                                                            */
/* ------------------------------------------------------------------ */

/**
 * Binds a `ScenePlayer` to React. Everything stateful lives in the player;
 * this only subscribes, drives the frame clock while playing, and pushes
 * preference changes down.
 */
export function useScenePlayer(
  scene: NarratedScene,
  options: { audio?: ScenePlayerAudio | null; reducedMotion?: boolean } = {},
): { player: ScenePlayer; snapshot: ScenePlayerSnapshot } {
  const reduced = options.reducedMotion ?? false;
  // Deliberately NOT keyed on `reducedMotion`: a media-query change must not
  // rebuild the player and lose playback position. The effect below pushes it
  // in instead, and that lands before anything can advance, because a freshly
  // constructed player is `idle` and `tick()` only runs while playing.
  const player = useMemo(() => new ScenePlayer(scene, { autoAdvanceWithoutAudio: true }), [scene]);

  const subscribe = useCallback((fn: () => void) => player.subscribe(() => fn()), [player]);
  const getSnapshot = useCallback(() => player.getSnapshot(), [player]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => player.setReducedMotion(reduced), [player, reduced]);
  useEffect(() => player.setAudio(options.audio ?? null), [player, options.audio]);

  // The frame clock. Only runs while actually playing, so a parked scene
  // costs nothing.
  useEffect(() => {
    if (snapshot.status !== "playing") return;
    let raf = 0;
    const step = (now: number) => {
      player.tick(now);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [player, snapshot.status]);

  return { player, snapshot };
}

/* ------------------------------------------------------------------ */
/* The component                                                       */
/* ------------------------------------------------------------------ */

export function NarratedSceneView({ scene, onAnswer, onHint, onComplete, audio, onUnlockAudio, className }: NarratedSceneProps) {
  const reduced = !!useReducedMotion();
  const { player, snapshot } = useScenePlayer(scene, { audio, reducedMotion: reduced });
  const chapters = useMemo(() => sceneChapters(scene), [scene]);
  const transcript = useMemo(() => sceneTranscript(scene), [scene]);
  const timeline = player.timeline();
  const hasNarration = useMemo(() => sceneHasNarration(scene), [scene]);
  const [unlocking, setUnlocking] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (snapshot.status !== "ended" || completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [snapshot.status, onComplete]);

  const cue = snapshot.cue;
  const spec: VisualSpec = cue.visual.visual ?? scene.visual;
  const checkpoint = snapshot.checkpoint;

  /** Space/K toggles, arrows step. Ignored when a control already has focus. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      player.toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      player.next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      player.previous();
    }
  };

  const currentChapterIndex = chapters.reduce((acc, ch, i) => {
    const idx = scene.cues.findIndex((c) => c.id === ch.cueId);
    return idx >= 0 && idx <= snapshot.cueIndex ? i : acc;
  }, 0);

  return (
    <section
      aria-label={`Narrated lesson: ${scene.title}`}
      className={cn("rounded-card bg-surface p-4 shadow-card", className)}
      onKeyDown={onKeyDown}
      // Focusable so the shortcuts are reachable by keyboard alone. Presses
      // on the buttons inside are left to the buttons (see onKeyDown).
      tabIndex={0}
      aria-keyshortcuts="Space ArrowRight ArrowLeft"
    >
      {/* ---- header ---- */}
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-eyebrow text-muted">Narrated lesson</p>
          <h2 className="t-title3 text-ink">{scene.title}</h2>
          {scene.subtitle && <p className="t-footnote text-muted">{scene.subtitle}</p>}
        </div>
        <OriginBadge origin={scene.origin} className="mt-1 shrink-0" />
      </header>

      {/* ---- the deterministic visual ---- */}
      <Visual spec={spec} mode={cue.visual.mode} />

      {/* ---- the caption: always on screen, never a toggle ---- */}
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3">
        <p
          // Announced only while the cue is advancing on its own. When the
          // student pressed Next, they already know what changed.
          aria-live={snapshot.status === "playing" && snapshot.autoAdvance ? "polite" : "off"}
          aria-atomic="true"
          className="min-w-0 flex-1 t-callout text-ink"
        >
          <RichText text={snapshot.caption} />
        </p>
        <ReadAloudButton text={snapshot.caption} label="Read this caption aloud" className="-mr-1 -mt-0.5 shrink-0" />
      </div>

      {/* ---- the checkpoint ---- */}
      {checkpoint &&
        (onAnswer ? (
          <SceneCheckpoint
            key={checkpoint.id}
            cue={checkpoint}
            onAnswer={onAnswer}
            onHint={onHint ? () => onHint(checkpoint.prompt.questionId) : undefined}
            onContinue={(settlement) => {
              if (settlement) player.resolveCheckpoint(settlement);
              else player.skipCheckpoint();
            }}
            className="mt-3"
          />
        ) : (
          <CheckpointPreview cue={checkpoint} onContinue={() => player.skipCheckpoint()} className="mt-3" />
        ))}

      {/* ---- transport ---- */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="plain"
          size="icon"
          onClick={() => player.previous()}
          disabled={!snapshot.canPrevious && snapshot.cueIndex === 0}
          aria-label="Previous cue"
        >
          <SkipBack />
        </Button>
        <Button
          size="icon"
          onClick={() => player.toggle()}
          disabled={snapshot.status === "checkpoint"}
          aria-label={snapshot.status === "playing" ? "Pause" : snapshot.status === "ended" ? "Play again" : "Play"}
        >
          {snapshot.status === "playing" ? <Pause /> : <Play />}
        </Button>
        <Button variant="plain" size="icon" onClick={() => player.next()} disabled={!snapshot.canNext} aria-label="Next cue">
          <SkipForward />
        </Button>

        {/* Cue scrubbing. One button per cue: keyboard-operable by
            construction, and a checkpoint reads as a marker rather than a
            zero-width sliver. */}
        <div className="flex min-w-[10rem] flex-1 items-center gap-1" role="group" aria-label="Scrub by cue">
          {timeline.entries.map((entry) => {
            const active = entry.index === snapshot.cueIndex;
            const past = entry.index < snapshot.cueIndex;
            const isCheck = entry.kind === "checkpoint";
            return (
              <button
                key={entry.cueId}
                type="button"
                onClick={() => player.seekToCue(entry.index)}
                aria-label={`${isCheck ? "Checkpoint" : "Cue"}: ${scene.cues[entry.index].text.slice(0, 60)}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "pressable h-5 rounded-full",
                  isCheck ? "w-2.5 shrink-0" : "min-w-2 flex-1",
                  "flex items-end py-1.5",
                )}
                style={isCheck ? undefined : { flexGrow: Math.max(1, entry.durationMs) }}
              >
                <span
                  className={cn(
                    "block h-1.5 w-full overflow-hidden rounded-full",
                    isCheck ? (past ? "bg-amber-fill" : "bg-fill") : past ? "bg-tint" : "bg-fill-3",
                  )}
                >
                  {active && !isCheck && (
                    <span
                      className="block h-full rounded-full bg-tint"
                      style={{ width: `${Math.round(snapshot.cueProgress * 100)}%` }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <p className="t-caption tabular text-muted" aria-label="Elapsed time">
          {fmtTime(snapshot.timelineMs)} / {fmtTime(snapshot.timelineTotalMs)}
        </p>

        {/* Speed. A native select: keyboard- and screen-reader-complete. */}
        <label className="flex items-center gap-1 t-caption text-muted">
          <Gauge className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Playback speed</span>
          <select
            value={snapshot.rate}
            onChange={(e) => player.setRate(Number(e.target.value))}
            className="rounded-lg bg-fill-4 px-1.5 py-1 t-caption font-semibold text-ink"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ---- audio: only ever started from this press ---- */}
      {hasNarration && !snapshot.audioAllowed && (
        <div className="mt-3">
          <Button
            variant="tinted"
            size="sm"
            disabled={unlocking}
            onClick={async () => {
              setUnlocking(true);
              try {
                const ok = onUnlockAudio ? await onUnlockAudio() : true;
                player.setAudioAllowed(ok);
              } catch {
                player.setAudioAllowed(false);
              } finally {
                setUnlocking(false);
              }
            }}
          >
            <Volume2 /> Turn on narration
          </Button>
        </div>
      )}

      {/* ---- auto-advance ---- */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => player.setAutoAdvanceWithoutAudio(!snapshot.autoAdvanceWithoutAudio)}
          aria-pressed={snapshot.autoAdvanceWithoutAudio}
          disabled={snapshot.reducedMotion}
          className={cn(
            "pressable rounded-full px-2.5 py-1 t-caption font-semibold",
            snapshot.autoAdvanceWithoutAudio ? "bg-tint/14 text-tint" : "bg-fill-4 text-muted",
            snapshot.reducedMotion && "opacity-40",
          )}
        >
          Auto-advance captions
        </button>
        {snapshot.reducedMotion && (
          <p className="t-caption text-muted">Reduced motion is on, so cues wait for you.</p>
        )}
        {snapshot.status === "waiting" && (
          <p className="flex items-center gap-1 t-caption text-tint">
            <ChevronRight className="size-3.5" /> Press next when you are ready.
          </p>
        )}
      </div>

      {/* ---- chapters ---- */}
      {chapters.length > 1 && (
        <nav aria-label="Lesson chapters" className="mt-4">
          <p className="mb-1.5 t-eyebrow text-muted">Chapters</p>
          <ol className="grid gap-1.5">
            {chapters.map((ch, i) => {
              const visited = snapshot.visited.includes(ch.cueId);
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => player.seekToCue(ch.cueId)}
                    aria-current={i === currentChapterIndex ? "step" : undefined}
                    className={cn(
                      "pressable flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left",
                      i === currentChapterIndex ? "bg-tint/12" : "hover:bg-fill-4",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full t-caption font-bold",
                        i === currentChapterIndex ? "bg-tint text-on-tint" : visited ? "bg-fill-2 text-ink" : "bg-fill-4 text-muted",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate t-subhead", i === currentChapterIndex ? "font-semibold text-tint" : "text-ink")}>
                      {ch.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {/* ---- transcript ---- */}
      <details className="mt-4 rounded-2xl bg-surface-2 px-4 py-3">
        <summary className="cursor-pointer t-subhead font-semibold text-ink">
          <span className="inline-flex items-center gap-2">
            <ListMusic className="size-4 text-tint" aria-hidden="true" /> Full transcript
          </span>
        </summary>
        <ol className="mt-2 space-y-1.5">
          {transcript.map((line) => (
            <li key={line.cueId}>
              <button
                type="button"
                onClick={() => player.seekToCue(line.cueId)}
                className={cn(
                  "pressable w-full rounded-lg px-2 py-1 text-left t-footnote hover:bg-fill-4",
                  line.cueId === cue.id ? "text-tint" : "text-ink",
                )}
              >
                {line.kind === "checkpoint" && <span className="mr-1.5 font-semibold text-amber">Question:</span>}
                {line.remedial && <span className="mr-1.5 font-semibold text-muted">If you miss it:</span>}
                <RichText text={line.text} />
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Checkpoint without a session                                        */
/* ------------------------------------------------------------------ */

/**
 * What a checkpoint looks like with no `onAnswer` — a lobby preview. The
 * question is shown because it is part of the lesson, but nothing is marked
 * and nothing pretends to be: there is no session, so there is no score.
 */
function CheckpointPreview({
  cue,
  onContinue,
  className,
}: {
  cue: CheckpointCue;
  onContinue: () => void;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-surface-2 p-4", className)} aria-label="Checkpoint preview">
      <p className="t-eyebrow text-tint">Checkpoint</p>
      <p className="mt-1 t-body text-ink">
        <RichText text={cue.prompt.text} />
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {cue.prompt.options.map((o) => (
          <li key={o.id} className="rounded-xl bg-surface px-3 py-2 t-footnote text-ink">
            <span className="mr-1.5 font-bold">{o.id}.</span>
            <RichText text={o.text} />
          </li>
        ))}
      </ul>
      <p className="mt-2 t-caption text-muted">This one is marked when you play the quest.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onContinue}>
        Carry on <ChevronRight />
      </Button>
    </section>
  );
}

function fmtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
