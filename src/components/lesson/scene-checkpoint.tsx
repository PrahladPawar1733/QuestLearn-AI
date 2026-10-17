"use client";

/**
 * A question checkpoint inside a narrated scene.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE `onAnswer` CONTRACT — read this before wiring it up
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **This component never scores an answer, and it cannot.** It holds no
 * answer key: `CheckpointCue.prompt` carries only the stem and the option
 * text, because the scene is shipped to the browser and a key in it would be
 * readable in devtools. That is the same rule the games follow — "a game
 * never decides correctness" (`src/lib/game/types.ts:5-9`) — and the scene
 * gets even less authority than a game.
 *
 * So the host supplies `onAnswer`, and it must:
 *
 *  1. **Return a settled result from the server.** The intended wiring is one
 *     line, because `SettledAnswer` from `LearningDirector`
 *     (`src/lib/game/learning.ts`) is structurally assignable to
 *     `CheckpointSettlement`:
 *
 *     ```tsx
 *     <SceneCheckpoint
 *       cue={cue}
 *       onAnswer={({ selectedOptionId }) => director.answer(selectedOptionId, { kind: "none" })}
 *       onContinue={(settled) => player.resolveCheckpoint(settled)}
 *     />
 *     ```
 *
 *     Going through `LearningDirector.answer()` is what makes XP, mastery,
 *     misconception recording and the recovery offer all work here with no
 *     new scoring code — the scene is just another surface onto the same
 *     `POST /api/quests/{id}/answer`.
 *
 *  2. **Reject, not resolve, on failure.** A thrown error (including
 *     `ApiError`) is caught and shown with a Retry; the student's selection
 *     survives and nothing is marked. Never resolve with a guessed `correct`.
 *
 *  3. **Be idempotent per `questionId`.** The server already de-duplicates
 *     attempts, but the component also disables submit while in flight.
 *
 * `onContinue` receives the settlement (or `null` if the student skipped) and
 * is where the host calls `ScenePlayer.resolveCheckpoint()` /
 * `skipCheckpoint()`, which picks the branch. The component does not touch
 * the player: it reports, the host decides.
 *
 * Accessibility: the card is interactive the instant it renders. Nothing
 * waits for audio, the submit button is never disabled because narration is
 * playing, and there is no state in which "the voice hasn't finished" blocks
 * an answer.
 */
import { AlertTriangle, ArrowRight, Check, Lightbulb, Loader2, X } from "lucide-react";
import { useState } from "react";
import { RichText } from "@/components/math/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import type { CheckpointCue, CheckpointSettlement, OptionId } from "@/lib/lesson/types";
import { ReadAloudButton } from "./read-aloud-button";

/** What the host must implement. See the contract at the top of this file. */
export type CheckpointAnswerHandler = (input: {
  cueId: string;
  questionId: string;
  conceptId?: string;
  selectedOptionId: OptionId;
}) => Promise<CheckpointSettlement>;

export interface SceneCheckpointProps {
  cue: CheckpointCue;
  /** Server-backed scoring. Must reject on failure; must never guess. */
  onAnswer: CheckpointAnswerHandler;
  /**
   * Called when the student moves on. `null` means they skipped without
   * answering — the host should follow the `correct` branch (the main path),
   * never drop them into remedial material they did not earn.
   */
  onContinue: (settlement: CheckpointSettlement | null) => void;
  /** Reveal the stored hint. Costs XP server-side; never changes the key. */
  onHint?: () => Promise<string>;
  /** Hide the skip affordance where the host wants the question answered. */
  allowSkip?: boolean;
  className?: string;
}

type Phase = "answering" | "submitting" | "settled";

export function SceneCheckpoint({ cue, onAnswer, onContinue, onHint, allowSkip = true, className }: SceneCheckpointProps) {
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [phase, setPhase] = useState<Phase>("answering");
  const [settled, setSettled] = useState<CheckpointSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintBusy, setHintBusy] = useState(false);

  const locked = phase !== "answering";

  const submit = async () => {
    if (!selected || phase !== "answering") return;
    setPhase("submitting");
    setError(null);
    try {
      const result = await onAnswer({
        cueId: cue.id,
        questionId: cue.prompt.questionId,
        conceptId: cue.conceptId,
        selectedOptionId: selected,
      });
      setSettled(result);
      setPhase("settled");
      haptic(result.correct ? "success" : "error");
    } catch (e) {
      // Nothing is marked and the selection survives: a failed request must
      // never cost the student their answer.
      setError(e instanceof Error ? e.message : "Couldn't check your answer.");
      setPhase("answering");
    }
  };

  const revealHint = async () => {
    if (!onHint || hintBusy || hint) return;
    setHintBusy(true);
    try {
      setHint(await onHint());
    } catch {
      setHint(cue.prompt.hint ?? null);
    } finally {
      setHintBusy(false);
    }
  };

  return (
    <section
      className={cn("rounded-2xl bg-surface p-4 shadow-card", className)}
      aria-labelledby={`checkpoint-${cue.id}-stem`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow text-tint">Checkpoint</p>
          <p className="t-footnote text-muted">{cue.conceptTitle ?? "Your turn"}</p>
        </div>
        <ReadAloudButton text={`${cue.prompt.text}. ${cue.prompt.options.map((o) => `${o.id}. ${o.text}`).join(". ")}`} label="Read the question and options aloud" />
      </header>

      <p id={`checkpoint-${cue.id}-stem`} className="t-body text-ink">
        <RichText text={cue.prompt.text} />
      </p>

      <div role="radiogroup" aria-label="Answer options" className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {cue.prompt.options.map((o) => {
          const state = optionTone(o.id, selected, settled);
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected === o.id}
              aria-label={`Option ${o.id}${state === "correct" ? ", correct answer" : state === "wrong" ? ", your answer, incorrect" : ""}`}
              disabled={locked}
              onPointerDown={() => !locked && selected !== o.id && haptic("selection")}
              onClick={() => !locked && setSelected(o.id)}
              className={cn(
                "pressable flex h-full w-full items-start gap-3 rounded-2xl p-3.5 text-left ring-inset",
                state === "idle" && "bg-surface-2 hover:bg-fill-3",
                state === "selected" && "bg-tint/12 ring-2 ring-tint",
                state === "correct" && "bg-success-fill/14 ring-2 ring-success-fill",
                state === "wrong" && "bg-danger-fill/12 ring-2 ring-danger-fill",
                state === "dimmed" && "bg-surface-2 opacity-50",
                locked && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full t-footnote font-bold",
                  state === "idle" && "bg-fill-3 text-muted",
                  state === "selected" && "bg-tint text-on-tint",
                  state === "correct" && "bg-success-fill text-white",
                  state === "wrong" && "bg-danger-fill text-white",
                  state === "dimmed" && "bg-fill-4 text-faint",
                )}
              >
                {state === "correct" ? <Check className="size-4" strokeWidth={3} /> : state === "wrong" ? <X className="size-4" strokeWidth={3} /> : o.id}
              </span>
              <RichText text={o.text} className="pt-0.5 t-callout text-ink" />
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 t-footnote text-amber">
          <AlertTriangle className="size-3.5 shrink-0" /> {error}
        </p>
      )}

      {hint && (
        <p className="mt-3 flex gap-2 rounded-xl bg-surface-2 px-3 py-2 t-footnote text-ink">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber" />
          <RichText text={hint} />
        </p>
      )}

      {/* The result. Text first, always: if audio and the screen ever
          disagree, the screen is right. */}
      {phase === "settled" && settled && (
        <div className="mt-4 space-y-2">
          <p className={cn("flex items-center gap-2 t-subhead font-semibold", settled.correct ? "text-success" : "text-danger")}>
            {settled.correct ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
            {settled.correct ? "That is it." : `The answer is ${settled.correctOptionId}.`}
          </p>
          {!settled.correct && settled.misconception && (
            <>
              <Badge tone="amber" title={settled.misconception.misconception}>
                Misconception: {settled.misconception.misconception.replace(/-/g, " ")}
              </Badge>
              <RichText as="p" text={settled.misconception.feedback} className="t-callout text-ink" />
            </>
          )}
          <RichText as="p" text={settled.explanation} className="t-callout text-muted" />
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {phase === "settled" ? (
          <Button onClick={() => onContinue(settled)}>
            {settled?.correct ? "Keep going" : "Show me why"} <ArrowRight />
          </Button>
        ) : (
          <>
            <Button onClick={submit} disabled={!selected || phase === "submitting"}>
              {phase === "submitting" ? <Loader2 className="animate-spin" /> : null} Check answer
            </Button>
            {onHint && !hint && (
              <Button variant="ghost" size="md" onClick={revealHint} disabled={hintBusy}>
                {hintBusy ? <Loader2 className="animate-spin" /> : <Lightbulb />} Hint
              </Button>
            )}
            {allowSkip && (
              <Button variant="plain" size="md" onClick={() => onContinue(null)}>
                Skip
              </Button>
            )}
          </>
        )}
      </footer>
    </section>
  );
}

type OptionTone = "idle" | "selected" | "correct" | "wrong" | "dimmed";

/**
 * Mirrors `optionState` in `src/components/game/option-state.ts` so a
 * checkpoint inside a scene looks and reads exactly like one on the track.
 * The correct option is only ever known *after* the server has settled it.
 */
function optionTone(id: OptionId, selected: OptionId | null, settled: CheckpointSettlement | null): OptionTone {
  if (!settled) return selected === id ? "selected" : "idle";
  if (id === settled.correctOptionId) return "correct";
  if (id === selected) return "wrong";
  return "dimmed";
}
