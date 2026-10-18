"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet, SHEET_PEEK_RESERVE } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { fade, spring } from "@/lib/motion";
import type { AnswerResult, SessionView } from "@/lib/services/play";
import type { PublicQuestion, SkinWorld } from "@/lib/types";
import { AchievementToasts, type Achievement } from "./achievement-toast";
import { FeedbackBody, FeedbackHeader } from "./feedback-panel";
import { PauseDialog } from "./pause-dialog";
import { QuestionCard } from "./question-card";
import { StatusBar } from "./status-bar";
import { TutorBody, TutorHeader, type TutorActions } from "./tutor-panel";
import type { OptionId, Phase } from "./types";
import { useExplain } from "./use-explain";
import { WORLD_COMPONENTS } from "./worlds";

type FollowUpResponse = { question: PublicQuestion; origin: string; difficulty: string; reason: string; note?: string };

export function QuestPlayer({ initial, videoEnabled }: { initial: SessionView; videoEnabled: boolean }) {
  const router = useRouter();
  const reduced = !!useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 767px)");
  const [view, setView] = useState(initial);
  const [phase, setPhase] = useState<Phase>("answering");
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [tutor, setTutor] = useState<SessionView["session"]["tutorFor"] | null>(initial.current ? null : (initial.session.tutorFor ?? null));
  const [showTutor, setShowTutor] = useState(!!tutor);
  const [busy, setBusy] = useState<"followup" | "continue" | "hint" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>(initial.hint);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Achievement[]>([]);
  const [paused, setPaused] = useState(false);
  const [pauseOrigin, setPauseOrigin] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);

  const q = view.current;
  // A real-time game has its own player, so reaching this component with one
  // means a stale link; fall back to the focused world rather than crashing.
  const World = WORLD_COMPONENTS[view.session.world as SkinWorld] ?? WORLD_COMPONENTS.classic;
  const explain = useExplain(showTutor && tutor ? { sessionId: view.session.id, questionId: tutor.questionId, conceptId: tutor.conceptId } : null);

  const resync = useCallback(async () => {
    const v = await api<SessionView>(`/api/sessions/${view.session.id}`);
    setView(v);
    setPhase("answering");
    setSelected(null);
    setResult(null);
    setHint(v.hint);
    if (!v.current && v.session.tutorFor) {
      setTutor(v.session.tutorFor);
      setShowTutor(true);
    }
  }, [view.session.id]);

  useEffect(() => {
    if (view.session.status === "completed") router.replace(`/quest/${view.quest.id}/results?session=${view.session.id}`);
  }, [view.session.status, view.quest.id, view.session.id, router]);

  useEffect(() => {
    if (!initial.current && !initial.session.tutorFor && initial.session.status === "active") void next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async () => {
    if (!q || !selected || phase !== "answering") return;
    setPhase("submitting");
    setError(null);
    try {
      const r = await api<AnswerResult>(`/api/quests/${view.quest.id}/answer`, {
        method: "POST",
        json: { sessionId: view.session.id, questionId: q.id, selectedOptionId: selected },
      });
      // Visual + haptic on the same frame (harmony).
      setResult(r);
      setView((v) => ({ ...v, session: r.session }));
      setPhase(r.isCorrect ? "correct" : "wrong");
      haptic(r.isCorrect ? "success" : "error");
      if (r.xpAwarded > 0) {
        setXpGain(r.xpAwarded);
        setTimeout(() => setXpGain(null), 900);
      }
      if (r.newAchievements.length) setToasts((t) => [...t, ...r.newAchievements]);
      if (!r.isCorrect) {
        setTutor({ questionId: q.id, conceptId: q.conceptId, isFollowUp: r.isFollowUp });
        setFollowUpError(null);
        // Let the world react first, then bring in the lesson.
        setTimeout(() => setShowTutor(true), reduced ? 0 : 600);
      }
      if (!isPhone) {
        setTimeout(() => panelRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" }), reduced ? 0 : 1100);
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't submit your answer.", 0, true);
      if (err.code === "NOT_CURRENT") {
        await resync().catch(() => undefined);
        return;
      }
      setError(err);
      setPhase("answering");
    }
  }, [q, selected, phase, view.quest.id, view.session.id, reduced, resync, isPhone]);

  async function next() {
    setBusy("continue");
    setError(null);
    try {
      const v = await api<SessionView & { completed: boolean; newAchievements: Achievement[] }>(`/api/sessions/${view.session.id}/next`, { method: "POST" });
      if (v.completed) {
        haptic("complete");
        router.push(`/quest/${view.quest.id}/results?session=${view.session.id}`);
        return;
      }
      setView(v);
      setPhase("answering");
      setSelected(null);
      setResult(null);
      setTutor(null);
      setShowTutor(false);
      setHint(undefined);
      setNote(null);
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't load the next question.", 0, true));
    } finally {
      setBusy(null);
    }
  }

  async function trySimilar() {
    if (!tutor) return;
    setBusy("followup");
    setFollowUpError(null);
    try {
      const r = await api<FollowUpResponse>(`/api/concepts/${encodeURIComponent(tutor.conceptId)}/follow-up`, {
        method: "POST",
        json: { sessionId: view.session.id, questionId: tutor.questionId },
      });
      setView((v) => ({
        ...v,
        current: r.question,
        currentIsFollowUp: true,
        session: { ...v.session, lastAdaptation: { at: new Date().toISOString(), questionId: r.question.id, targetDifficulty: r.difficulty as "easy", reason: r.reason } },
      }));
      setNote(r.note ?? null);
      setPhase("answering");
      setSelected(null);
      setResult(null);
      setTutor(null);
      setShowTutor(false);
      setHint(undefined);
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    } catch (e) {
      setFollowUpError(e instanceof ApiError ? e.message : "Couldn't create a follow-up question.");
    } finally {
      setBusy(null);
    }
  }

  async function takeHint() {
    if (!q) return;
    setBusy("hint");
    try {
      const r = await api<{ hint: string }>(`/api/quests/${view.quest.id}/hint`, { method: "POST", json: { sessionId: view.session.id, questionId: q.id } });
      setHint(r.hint);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't load the hint.", 0, true));
    } finally {
      setBusy(null);
    }
  }

  const openPause = () => {
    const r = pauseRef.current?.getBoundingClientRect();
    setPauseOrigin(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    setPaused(true);
  };

  // Keyboard: A–D / 1–4 to choose, Enter to submit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || !q || phase !== "answering") return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toUpperCase();
      const idx = ["1", "2", "3", "4", "5"].indexOf(k);
      const id = (idx >= 0 ? q.options[idx]?.id : q.options.find((o) => o.id === k)?.id) as OptionId | undefined;
      if (id) {
        setSelected(id);
        e.preventDefault();
      } else if (e.key === "Enter" && selected && !(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, phase, selected, paused, submit]);

  const settled = phase === "correct" || phase === "wrong";
  // While a main question's result is showing, its outcome is already recorded; keep showing its number.
  const answeredIndex = view.session.outcomes.length + (view.currentIsFollowUp || (settled && !result?.isFollowUp) ? 0 : 1);

  const tutorActions: TutorActions = {
    canFollowUp: !!tutor && !tutor.isFollowUp,
    onTrySimilar: trySimilar,
    onContinue: next,
    busy: busy === "followup" || busy === "continue" ? busy : null,
    followUpError,
  };
  const showFeedback = phase === "correct" && !!result;
  const sheetOpen = isPhone && (showFeedback || (showTutor && !!tutor));

  return (
    <>
      <motion.div
        className="mx-auto w-full max-w-3xl origin-top space-y-4"
        animate={paused && !reduced ? { scale: 0.96, opacity: 0.85 } : { scale: 1, opacity: 1 }}
        transition={spring.default}
        style={{ paddingBottom: sheetOpen ? SHEET_PEEK_RESERVE : undefined }}
      >
        <StatusBar
          title={view.quest.title}
          index={answeredIndex}
          total={view.session.playLength}
          outcomes={view.session.outcomes}
          xp={view.session.xp}
          xpGain={xpGain}
          streak={view.session.streak}
          onPause={openPause}
          isFollowUp={view.currentIsFollowUp}
          pauseRef={pauseRef}
        />

        <AnimatePresence initial={false}>
          {view.session.lastAdaptation && q && phase === "answering" && (
            <motion.p
              key={view.session.lastAdaptation.questionId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden px-1 t-footnote text-faint"
            >
              {view.session.lastAdaptation.reason}
            </motion.p>
          )}
        </AnimatePresence>
        {note && <p className="rounded-xl bg-surface-2 px-3 py-2 t-footnote text-amber">{note}</p>}

        <AnimatePresence mode="popLayout" initial={false}>
          {q && (
            <motion.div
              key={q.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -40 }}
              transition={reduced ? fade : spring.default}
              className="surface space-y-5 rounded-[24px] p-5 sm:p-7"
            >
              <QuestionCard q={q} hint={hint} settled={settled} />
              <World
                question={q}
                phase={phase}
                selected={selected}
                onSelect={(id) => phase === "answering" && setSelected(id)}
                correctOptionId={result?.correctOptionId}
                outcomes={settled && result && !result.isFollowUp ? view.session.outcomes.slice(0, -1) : view.session.outcomes}
                total={view.session.playLength}
                streak={view.session.streak}
                isFollowUp={view.currentIsFollowUp}
                reducedMotion={reduced}
              />
              {!settled && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {q.hasHint && !hint && (
                    <Button variant="ghost" onClick={takeHint} disabled={busy === "hint" || phase !== "answering"} title="Costs 40 XP">
                      {busy === "hint" ? <Loader2 className="animate-spin" /> : null} Show a hint
                    </Button>
                  )}
                  <p className="hidden t-footnote text-faint lg:block">A–D to choose · Return to submit</p>
                  <Button size="lg" className="ml-auto min-w-44 max-sm:w-full" onClick={submit} disabled={!selected || phase !== "answering"}>
                    {phase === "submitting" ? <Loader2 className="animate-spin" /> : null} {phase === "submitting" ? "Checking…" : "Check answer"}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!q && !showTutor && view.session.status === "active" && (
          <div className="flex items-center justify-center gap-2 py-16 t-subhead text-muted">
            <Loader2 className="size-5 animate-spin" /> Loading your next question…
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-fill/10 px-4 py-3 t-subhead text-ink">
            <AlertTriangle className="size-4 text-danger" /> {error.message}
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => (phase === "answering" && q ? submit() : resync().catch(() => undefined))}>
              <RefreshCw /> Retry
            </Button>
          </div>
        )}

        {/* Desktop / tablet: panels sit inline below the question, entering from below. */}
        {!isPhone && (
          <div ref={panelRef} className="scroll-mt-28">
            <AnimatePresence mode="wait">
              {showFeedback && result && (
                <InlinePanel key={`fb-${result.selectedOptionId}-${q?.id}`} tone="success" reduced={reduced}>
                  <FeedbackHeader result={result} onContinue={next} busy={busy === "continue"} />
                  <FeedbackBody result={result} />
                </InlinePanel>
              )}
              {showTutor && tutor && (
                <InlinePanel key={`tutor-${tutor.questionId}`} tone="tint" reduced={reduced} labelledBy="tutor-heading">
                  <TutorHeader data={explain.data} loading={explain.loading} actions={tutorActions} />
                  <TutorBody key={tutor.questionId} data={explain.data} error={explain.error} loading={explain.loading} onRetry={explain.retry} videoEnabled={videoEnabled} conceptId={tutor.conceptId} />
                </InlinePanel>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Phone: the same panels as a draggable, non-modal sheet (peek / medium / large).
          Crossing the breakpoint swaps layouts immediately (a layout change is not a dismissal);
          within the phone layout, dismissals animate back down the way the sheet came. */}
      {isPhone && (
        <AnimatePresence>
          {showFeedback && result && (
            <BottomSheet key={`fb-${q?.id}`} label="Answer feedback" header={<FeedbackHeader result={result} onContinue={next} busy={busy === "continue"} />}>
              <FeedbackBody result={result} />
            </BottomSheet>
          )}
          {showTutor && tutor && (
            <BottomSheet key={`tutor-${tutor.questionId}`} label="Lesson" header={<TutorHeader data={explain.data} loading={explain.loading} actions={tutorActions} />}>
              <TutorBody key={tutor.questionId} data={explain.data} error={explain.error} loading={explain.loading} onRetry={explain.retry} videoEnabled={videoEnabled} conceptId={tutor.conceptId} />
            </BottomSheet>
          )}
        </AnimatePresence>
      )}

      <PauseDialog open={paused} onOpenChange={setPaused} answered={view.session.answered} total={view.session.playLength} origin={pauseOrigin} />
      <AchievementToasts items={toasts} onDone={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}

function InlinePanel({ children, tone, reduced, labelledBy }: { children: React.ReactNode; tone: "success" | "tint"; reduced: boolean; labelledBy?: string }) {
  return (
    <motion.section
      aria-labelledby={labelledBy}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 32 }}
      transition={reduced ? fade : spring.default}
      className={cn("surface overflow-hidden rounded-[24px] pt-3", tone === "success" && "ring-2 ring-success-fill/40")}
      aria-live="polite"
    >
      {children}
    </motion.section>
  );
}
