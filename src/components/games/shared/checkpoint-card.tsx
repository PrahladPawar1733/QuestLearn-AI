"use client";

/**
 * The in-game teaching moment.
 *
 * Shown while the simulation is fully paused. Three states:
 *   asking  → the question, with an optional hint
 *   settled → what happened, why, and what the reward was
 *
 * The tone rules from the brief are enforced here rather than left to
 * copywriting: a wrong answer is never called wrong in a scolding way, the
 * misconception is named and explained, a recovery is offered rather than
 * imposed, and the student can always keep driving. There is no penalty
 * anywhere in this component.
 */
import { ArrowRight, Check, Flag, Lightbulb, Loader2, RefreshCw, Wrench, X, Zap } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { RichText } from "@/components/math/rich-text";
import { Visual } from "@/components/viz/visual";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/ui/origin-badge";
import { cn } from "@/lib/cn";
import type { SettledAnswer } from "@/lib/game/learning";
import type { CheckpointReward, GameQuestion } from "@/lib/game/types";
import { fade, spring } from "@/lib/motion";

interface Props {
  question: GameQuestion;
  /**
   * Second-chance mode. After a first wrong answer we do NOT reveal the key:
   * the student is told to think again, given the hint, and allowed another
   * attempt. Showing the answer immediately ends the thinking — the attempt
   * has already been recorded for mastery, so nothing is gained by it.
   */
  thinkAgain?: boolean;
  /**
   * One-line reminder of the concept, shown BEFORE the options. A checkpoint
   * should teach and then ask — asking cold turns the game into a test.
   */
  conceptNote?: string;
  offered: CheckpointReward;
  settled: SettledAnswer | null;
  submitting: boolean;
  hint: string | null;
  hintBusy: boolean;
  error: string | null;
  recoveryBusy: boolean;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  onHint: () => void;
  onRecover: () => void;
  onContinue: () => void;
  selected: string | null;
}

export function CheckpointCard(props: Props) {
  const { question, offered, settled, submitting, hint, hintBusy, error, recoveryBusy, selected, conceptNote, thinkAgain } = props;
  const reduced = !!useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);

  // Move focus into the card when it opens: the student's hands were on the
  // driving keys, and without this a keyboard user has to tab from the canvas.
  const isAsking = settled === null;
  useEffect(() => {
    const first = cardRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
  }, [question.id, isAsking]);

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center overflow-y-auto overscroll-contain p-3 sm:items-center sm:p-6">
      {/* Scrim: darkens the paused scene so the text is readable over any district. */}
      <motion.div
        className="absolute inset-0 bg-[rgba(10,7,4,0.72)] backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
      />

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-heading"
        className="relative w-full max-w-xl rounded-[1.75rem] bg-surface p-4 shadow-[0_24px_80px_rgba(10,7,4,0.5)] sm:p-6"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
        transition={reduced ? fade : spring.default}
      >
        {/* ---------------- header ---------------- */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-tint/14 px-2.5 py-1 t-caption font-semibold text-tint">
            <Flag className="size-3.5" />
            Checkpoint
          </span>
          {question.isRecovery && (
            <span className="rounded-full bg-amber-fill/16 px-2.5 py-1 t-caption font-semibold text-amber">Second chance</span>
          )}
          <span className="rounded-full bg-fill-3 px-2.5 py-1 t-caption font-medium capitalize text-muted">{question.difficulty}</span>
          <OriginBadge origin={question.origin} />
          <span className="ml-auto t-caption text-faint">{question.conceptTitle}</span>
        </div>

        {/* What's at stake, stated plainly up front. */}
        {!settled && <RewardLine offered={offered} />}

        {/* Recall first. The concept is named and restated before the
            question is asked, so a checkpoint reads as a lesson beat rather
            than a pop quiz dropped into a racing game. */}
        {conceptNote && !settled && (
          <p className="mb-3 rounded-xl bg-tint/8 px-3 py-2 t-footnote text-ink ring-1 ring-tint/18">
            <span className="font-semibold text-tint">Recall · {question.conceptTitle}: </span>
            {conceptNote}
          </p>
        )}

        <h2 id="cp-heading" className="mb-1 t-title3 text-ink">
          <RichText text={question.text} />
        </h2>

        {/* The question's diagram. It was being generated and attached to every
            question but rendered nowhere inside the game, so every figure was
            invisible at a gate. `before` hides the outcome while answering;
            `full` reveals the worked result once scored. */}
        {question.visual && (
          <div className="my-3 overflow-hidden rounded-2xl bg-surface-2 p-2">
            <Visual spec={question.visual} mode={settled ? "full" : "before"} />
          </div>
        )}

        {question.reason && !settled && (
          <p className="mb-3 t-footnote text-faint">
            <span className="font-semibold text-muted">Why this question: </span>
            {question.reason}
          </p>
        )}

        <AnimatePresence initial={false}>
          {hint && !settled && (
            <motion.p
              key="hint"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 flex items-start gap-2 overflow-hidden rounded-xl bg-amber-fill/12 px-3 py-2 t-footnote text-ink"
            >
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber" />
              <RichText text={hint} />
            </motion.p>
          )}
        </AnimatePresence>

        {/* ---------------- options ---------------- */}
        <div role="radiogroup" aria-labelledby="cp-heading" className="my-4 grid gap-2">
          {question.options.map((o, i) => {
            const isSelected = selected === o.id;
            // In think-again mode nothing is revealed: no key, no tick, no
            // dimming. The only feedback is "that one isn't it".
            const reveal = !!settled && !thinkAgain;
            const isCorrect = reveal && settled?.correctOptionId === o.id;
            const isWrongPick = reveal && settled.selectedOptionId === o.id && !settled.correct;
            const ruledOut = !!thinkAgain && !!settled && settled.selectedOptionId === o.id;
            const dimmed = reveal && !isCorrect && !isWrongPick;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                // Roving tabindex: one stop for the whole group, arrows move
                // within it — the pattern a radiogroup is supposed to use.
                tabIndex={isSelected || (!selected && i === 0) ? 0 : -1}
                data-autofocus={i === 0 ? "" : undefined}
                disabled={(!!settled && !thinkAgain) || submitting}
                onClick={() => props.onSelect(o.id)}
                onKeyDown={(e) => handleRovingKeys(e, question.options.length, i, (idx) => props.onSelect(question.options[idx].id))}
                className={cn(
                  "pressable flex min-h-[3rem] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                  !reveal && !isSelected && !ruledOut && "bg-surface-2 hover:bg-fill-3",
                  !reveal && isSelected && "bg-tint text-on-tint ring-2 ring-tint",
                  ruledOut && "bg-fill-4 text-faint line-through opacity-60",
                  isCorrect && "bg-success-fill/18 ring-2 ring-success-fill",
                  isWrongPick && "bg-danger-fill/16 ring-2 ring-danger-fill",
                  dimmed && "bg-fill-4 opacity-55",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full font-rounded text-[0.8rem] font-bold",
                    isCorrect ? "bg-success-fill text-white" : isWrongPick ? "bg-danger-fill text-white" : isSelected && !settled ? "bg-white/25 text-white" : "bg-fill text-ink",
                  )}
                >
                  {isCorrect ? <Check className="size-4" strokeWidth={3} /> : isWrongPick || ruledOut ? <X className="size-4" strokeWidth={3} /> : o.id}
                </span>
                <RichText text={o.text} className={cn("min-w-0 t-subhead", isSelected && !settled ? "text-on-tint" : "text-ink")} />
              </button>
            );
          })}
        </div>

        {/* ---------------- settled feedback ---------------- */}
        {/* ---- think again: no answer, just a nudge and the hint ---- */}
        {thinkAgain && settled && (
          <div className="rounded-2xl bg-amber-fill/12 p-3.5 ring-1 ring-amber/30">
            <p className="t-headline text-ink">Not that one — have another think.</p>
            <p className="mt-1 t-subhead text-muted">
              {settled.misconception
                ? settled.misconception.feedback
                : "Re-read the question and rule that option out. You get another go."}
            </p>
            {!hint && question.hasHint && (
              <p className="mt-2 t-footnote text-muted">Stuck? Take the hint below.</p>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {settled && !thinkAgain && (
            <motion.div
              key="settled"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? fade : spring.snappy}
              className="space-y-3"
            >
              <div
                className={cn(
                  "rounded-2xl p-3.5",
                  settled.correct ? "bg-success-fill/12 ring-1 ring-success-fill/30" : "bg-tint/10 ring-1 ring-tint/25",
                )}
              >
                <p className="mb-1.5 t-headline text-ink">
                  {settled.correct ? "Correct — reward unlocked" : "Not this time. Here's what happened."}
                </p>

                {/* The misconception, named. This is the whole point of the loop. */}
                {!settled.correct && settled.misconception && (
                  <p className="mb-2 t-subhead text-ink">
                    <span className="font-semibold">{settled.misconception.misconception}: </span>
                    {settled.misconception.feedback}
                  </p>
                )}

                <RichText text={settled.explanation} className="t-subhead text-muted" />

                {settled.steps.length > 0 && (
                  <ol className="mt-2 space-y-1 pl-4">
                    {settled.steps.map((s, i) => (
                      <li key={i} className="list-decimal t-footnote text-muted">
                        <RichText text={s} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Mastery and XP, kept visually separate from the game score. */}
              <div className="flex flex-wrap items-center gap-2 t-caption">
                {settled.xpAwarded > 0 && (
                  <span className="rounded-full bg-tint/14 px-2.5 py-1 font-semibold text-tint">+{settled.xpAwarded} XP</span>
                )}
                <span className="rounded-full bg-fill-3 px-2.5 py-1 font-medium text-muted">
                  {settled.mastery.conceptTitle}: {Math.round(settled.mastery.before)}% → {Math.round(settled.mastery.after)}% · {settled.mastery.label}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-danger-fill/12 px-3 py-2 t-footnote text-ink">
            {error}
          </p>
        )}

        {/* ---------------- actions ---------------- */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {thinkAgain ? (
            <>
              {question.hasHint && !hint && (
                <Button variant="amber" onClick={props.onHint} disabled={hintBusy}>
                  {hintBusy ? <Loader2 className="animate-spin" /> : <Lightbulb />} Show me a hint
                </Button>
              )}
              <Button size="lg" className="ml-auto min-w-40 max-sm:w-full" onClick={props.onSubmit} disabled={!selected || submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null} Try again
              </Button>
            </>
          ) : !settled ? (
            <>
              {question.hasHint && !hint && (
                <Button variant="amber" onClick={props.onHint} disabled={hintBusy || submitting}>
                  {hintBusy ? <Loader2 className="animate-spin" /> : <Lightbulb />} Hint · −40 XP
                </Button>
              )}
              <Button size="lg" className="ml-auto min-w-40 max-sm:w-full" onClick={props.onSubmit} disabled={!selected || submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {submitting ? "Checking…" : "Lock it in"}
              </Button>
            </>
          ) : (
            <>
              {settled.canRecover && (
                <Button variant="secondary" onClick={props.onRecover} disabled={recoveryBusy}>
                  {recoveryBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Try a similar one
                </Button>
              )}
              <Button size="lg" className="ml-auto min-w-40 max-sm:w-full" onClick={props.onContinue}>
                Keep driving <ArrowRight />
              </Button>
            </>
          )}
        </div>

        {!settled && (
          <p className="mt-2 hidden t-footnote text-faint lg:block">The race is paused. Take your time — there&apos;s no timer on this.</p>
        )}
      </motion.div>
    </div>
  );
}

function RewardLine({ offered }: { offered: CheckpointReward }) {
  if (offered.kind === "none") return null;
  const label =
    offered.kind === "nitro"
      ? `Answer correctly for +${Math.round(offered.amount * 100)}% nitro`
      : offered.kind === "repair"
        ? "Answer correctly to repair your car"
        : offered.kind === "shortcut"
          ? "Answer correctly to open a shortcut"
          : `Answer correctly for −${offered.seconds}s`;
  const Icon = offered.kind === "repair" ? Wrench : Zap;
  return (
    <p className="mb-3 flex items-center gap-1.5 t-footnote font-medium text-muted">
      <Icon className="size-3.5 text-tint" />
      {label}
      <span className="text-faint">· a wrong answer costs you nothing</span>
    </p>
  );
}

/** Arrow-key navigation within the radiogroup, selecting as it moves. */
function handleRovingKeys(e: React.KeyboardEvent, count: number, index: number, select: (i: number) => void) {
  let next = -1;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % count;
  else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index - 1 + count) % count;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = count - 1;
  if (next < 0) return;
  e.preventDefault();
  select(next);
  const group = e.currentTarget.parentElement;
  const buttons = group?.querySelectorAll<HTMLElement>('[role="radio"]');
  buttons?.[next]?.focus();
}
