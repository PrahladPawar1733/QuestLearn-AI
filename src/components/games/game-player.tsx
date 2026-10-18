"use client";

/**
 * The shared game host.
 *
 * Owns the DOM, the network and the question UI. The game owns the canvas and
 * the simulation. Nothing crosses that line except the callbacks in
 * `GameHostContext` — which is what lets the same host drive a second game
 * later with only the class swapped.
 *
 * Note what is deliberately absent: there is no path by which the game can
 * mark an answer, and no path by which an answer can end a run.
 */
import { ArrowLeft, Gauge, Pause, Play, RotateCcw, Settings2, Target, Volume2, VolumeX, WifiOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { gameAudio } from "@/lib/game/audio";
import { haptic } from "@/lib/haptics";
import { InputManager } from "@/lib/game/input";
import { LearningDirector, type SettledAnswer } from "@/lib/game/learning";
import {
  DEFAULT_GAME_PREFS,
  QUALITY_PRESETS,
  QualityGovernor,
  defaultMotionPreferences,
  detectQualityTier,
  loadGamePrefs,
  saveGamePrefs,
  type StoredGamePrefs,
} from "@/lib/game/quality";
import type { CheckpointRequest, GameQuestion, GameRunSummary, MotionPreferences, QualityTier } from "@/lib/game/types";
import { fade, spring } from "@/lib/motion";
import type { SessionView } from "@/lib/services/play";
import type { PublicQuestion } from "@/lib/types";
import { CheckpointCard } from "./shared/checkpoint-card";
import { RunSummaryCard } from "./shared/run-summary";
import type { AnyGameModule } from "./registry";

type Screen = "ready" | "racing" | "paused" | "finished";

/**
 * How long a student may play without being asked anything.
 *
 * This is a SAFETY NET, not the main path. Each game delivers questions
 * through its own mechanic — in Spider Climb the question decides which web
 * anchor holds — and that should almost always fire first. This
 * only catches a student who is stuck or idle, so it must be long enough not
 * to pre-empt the game's own gates.
 */
const FORCE_QUESTION_AFTER_MS = 40_000;

interface Props {
  initial: SessionView;
  /** The game to host. Loaded lazily by the page from the registry. */
  module: AnyGameModule;
  /** Concept descriptions, used to teach before asking at a checkpoint. */
  concepts?: { id: string; title: string; description: string }[];
}


export function GamePlayer({ initial, module: mod, concepts = [] }: Props) {
  const conceptNotes = useMemo(() => Object.fromEntries(concepts.map((c) => [c.id, c.description])), [concepts]);
  const router = useRouter();
  const systemReduced = !!useReducedMotion();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<AnyGameModule["create"]> | null>(null);
  const directorRef = useRef<LearningDirector | null>(null);
  const governorRef = useRef<QualityGovernor | null>(null);

  const [screen, setScreen] = useState<Screen>("ready");
  const [hud, setHud] = useState<unknown>(mod.emptyHud);
  // Lazy init rather than a setState-in-effect. Safe for hydration: the first
  // render is the "ready" overlay, which reads none of these values.
  const [prefs, setPrefs] = useState<StoredGamePrefs>(() =>
    typeof window === "undefined" ? DEFAULT_GAME_PREFS : loadGamePrefs(),
  );
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  /* ---- checkpoint state ---- */
  const [checkpoint, setCheckpoint] = useState<{ req: CheckpointRequest; question: GameQuestion } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settled, setSettled] = useState<SettledAnswer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const [summary, setSummary] = useState<GameRunSummary | null>(null);
  /**
   * The game's own InputManager, published after mount. Touch controls MUST
   * write into this instance — a separate one would be read by nobody.
   */
  const [input, setInput] = useState<InputManager | null>(null);
  /** The question a self-presenting game currently has on screen. */
  const openQuestionRef = useRef<GameQuestion | null>(null);
  /** Wrong attempts on the current in-game question (first miss = retry). */
  const gameAttemptsRef = useRef(0);
  /** The scored first attempt, while the game offers a second try on the same question. */
  const firstMissRef = useRef<SettledAnswer | null>(null);
  /** Set after a second miss, to show the explanation over the game. */
  const [inGameResult, setInGameResult] = useState<SettledAnswer | null>(null);
  /** Bound inside the mount effect so the HUD can score and advance. */
  const chooseRef = useRef<((optionId: string) => void) | null>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  /** Geometry of the HUD's `[data-game-stage]` element, in shell coordinates. */
  const [stageBox, setStageBox] = useState<React.CSSProperties>({ left: 0, top: 0, width: "100%", height: 0 });
  const continueRef = useRef<(() => void) | null>(null);



  const motionPrefs: MotionPreferences = useMemo(
    () => ({
      reducedMotion: systemReduced,
      cameraShake: prefs.cameraShake && !systemReduced,
      motionBlur: prefs.motionBlur && !systemReduced,
      speedEffects: prefs.speedEffects && !systemReduced,
    }),
    [prefs.cameraShake, prefs.motionBlur, prefs.speedEffects, systemReduced],
  );

  /* ------------------------------------------------------------------ */
  /* prefs                                                              */
  /* ------------------------------------------------------------------ */
  // Push the stored prefs into the audio engine (an external system).
  useEffect(() => {
    gameAudio.setEnabled(prefs.audio);
    gameAudio.setBusVolume("music", prefs.musicVolume);
    gameAudio.setBusVolume("sfx", prefs.sfxVolume);
    // Mount-only: later changes go through updatePrefs, which applies them directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePrefs = useCallback((patch: Partial<StoredGamePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveGamePrefs(next);
      if (patch.audio !== undefined) gameAudio.setEnabled(patch.audio);
      if (patch.musicVolume !== undefined) gameAudio.setBusVolume("music", patch.musicVolume);
      if (patch.sfxVolume !== undefined) gameAudio.setBusVolume("sfx", patch.sfxVolume);
      if (patch.tier !== undefined && patch.tier !== "auto") {
        governorRef.current?.setTier(patch.tier, true);
        gameRef.current?.setQuality(QUALITY_PRESETS[patch.tier]);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    gameRef.current?.setMotionPreferences(motionPrefs);
  }, [motionPrefs]);

  /* ------------------------------------------------------------------ */
  /* mount the game                                                     */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;

    const stored = loadGamePrefs();
    const tier: QualityTier = stored.tier === "auto" ? detectQualityTier() : stored.tier;
    const baseMotion = defaultMotionPreferences();

    const director = new LearningDirector(initial.session.id, initial.quest.id, initial.session, {
      onSession: () => {
        /* session totals are shown on the summary; the HUD keeps game stats only */
      },
      onError: (e) => setOffline(e.code === "NETWORK"),
      onExhausted: () => {
        // The goal of a run is the questions, so finishing them finishes the
        // run. Previously the student answered the last question and then
        // kept driving to a finish line that meant nothing.
        setNotice("All questions answered");
        window.setTimeout(() => gameRef.current?.quit(), 1200);
      },
    });
    director.noGap = !!mod.presentsOwnQuestions;
    director.seed(initial.current as PublicQuestion | null, initial.session.lastAdaptation?.reason);
    directorRef.current = director;

    const rect = shell.getBoundingClientRect();
    const game = mod.create({
      // Strong assist by default. This is a SKILL aid only — it never touches
      // scoring or mastery — and students were failing to reach questions.
      assist: 0.85,
      learningCheckpoints: Math.max(4, Math.min(8, initial.session.playLength)),
    });
    gameRef.current = game;

    const governor = new QualityGovernor(
      tier,
      (settings) => game.setQuality(settings),
      stored.tier === "auto",
    );
    governorRef.current = governor;

    void Promise.resolve(
      game.mount({
        canvas,
        width: Math.max(320, rect.width),
        height: Math.max(240, rect.height),
        quality: QUALITY_PRESETS[tier],
        motion: {
          reducedMotion: baseMotion.reducedMotion,
          cameraShake: stored.cameraShake && !baseMotion.reducedMotion,
          motionBlur: stored.motionBlur && !baseMotion.reducedMotion,
          speedEffects: stored.speedEffects && !baseMotion.reducedMotion,
        },
        seed: `${initial.quest.id}:${initial.session.id}`,
        onAnswerChosen: (optionId) => {
          // Answer-as-action: the game reported a move that IS the answer.
          void scoreFromGame(optionId);
        },
        onCheckpoint: (req) => {
          lastAsk = performance.now();
          const q = director.open();
          if (!q) {
            // Nothing buffered after all — do not stall the race.
            game.setQuestionArmed(false);
            return;
          }
          haptic("selection");
          // A new question: its misses start from zero.
          gameAttemptsRef.current = 0;
          firstMissRef.current = null;
          if (mod.presentsOwnQuestions) {
            // The game draws the question itself; play continues.
            openQuestionRef.current = q;
            game.presentQuestion?.(q);
            return;
          }
          setSelected(null);
          setSettled(null);
          setHint(null);
          setCardError(null);
          setCheckpoint({ req, question: q });
          game.pause("checkpoint");
          setScreen("racing");
        },
        onHud: (state) => {
          // The game mutates one object in place, so copy before handing it to
          // React or the state update will be skipped as referentially equal.
          setHud({ ...state });
        },
        onFinish: (s) => {
          const tally = director.tally;
          setSummary({ ...s, learning: { answered: tally.answered, correct: tally.correct, recoveriesFixed: tally.recoveriesFixed } });
          setScreen("finished");
        },
        onError: (e) => setFatal(e.message),
        onNotice: (text) => setNotice(text),
        onPauseRequest: () => setScreen((s) => (s === "racing" ? "paused" : s)),
      }),
    )
      .then(() => {
        if (gameRef.current !== game) return;
        setInput(game.inputManager);
        // Opt-in diagnostics for development: `?debug=1` publishes a snapshot
        // getter so track position can be inspected from the console.
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug")) {
          (window as unknown as { __game?: unknown }).__game = () => (game as unknown as { debug?: unknown }).debug;
        }
      })
      .catch((e: unknown) => setFatal(e instanceof Error ? e.message : "The game failed to start."));

    // Resize with the element, not the window: the canvas is inside a shell
    // that changes size when the sheet opens or the device rotates.
    // Observe whichever element actually determines the drawing size: the
    // canvas for a page band, the shell for a fullscreen game.
    // Track the HUD's stage element and keep the canvas box glued to it.
    let stageRo: ResizeObserver | null = null;
    if (mod.layout === "page") {
      const sync = () => {
        const el = shell.querySelector<HTMLElement>("[data-game-stage]");
        if (!el) return;
        const r = el.getBoundingClientRect();
        const s0 = shell.getBoundingClientRect();
        setStageBox({
          left: Math.round(r.left - s0.left),
          top: Math.round(r.top - s0.top + shell.scrollTop),
          width: Math.round(r.width),
          height: Math.round(r.height),
        });
      };
      sync();
      stageRo = new ResizeObserver(sync);
      stageRo.observe(shell);
      const el = shell.querySelector<HTMLElement>("[data-game-stage]");
      if (el) stageRo.observe(el);
      window.setTimeout(sync, 60);
    }

    const sizeTarget = mod.layout === "page" ? canvas : shell;
    const ro = new ResizeObserver(() => {
      const w = Math.max(320, Math.round(sizeTarget.clientWidth));
      const h = Math.max(200, Math.round(sizeTarget.clientHeight));
      game.resize(w, h);
    });
    ro.observe(sizeTarget);

    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Keep the next question warm, and tell the game whether a gate may ask.
    void director.prefetch();

    /**
     * Score a move made inside the game world. Identical to the card path —
     * the server still owns correctness — but the result goes back to the
     * game to animate rather than to a dialog.
     */
    const scoreFromGame = async (optionId: string) => {
      const q = openQuestionRef.current;
      if (!q) return;
      // Let the game know which option was chosen before it is scored, so its
      // animation (which anchor the web took) matches the student's choice.
      (game as unknown as { noteChoice?: (id: string) => void }).noteChoice?.(optionId);
      try {
        // The server scores a question once: re-sending it returns the first (wrong) result, so
        // the second try is judged here against the key that first answer returned. Score and
        // mastery keep the first attempt, which is the honest record.
        const first = firstMissRef.current?.question.id === q.id ? firstMissRef.current : null;
        const result: SettledAnswer = first
          ? { ...first, correct: optionId === first.correctOptionId, selectedOptionId: optionId, xpAwarded: 0, achievements: [] }
          : await director.answer(optionId, { kind: "none" });
        firstMissRef.current = null;
        // Give the game the worked explanation before it animates, so its "correct" banner can show it.
        (game as unknown as { setExplanation?: (t: string) => void }).setExplanation?.call(game, result.explanation);
        game.settleQuestion?.(result.correct, result.correctOptionId);
        if (result.correct) {
          openQuestionRef.current = null;
          gameAttemptsRef.current = 0;
          setInGameResult(null);
          director.close();
        } else if (gameAttemptsRef.current >= 1) {
          // Second miss: now show the explanation, because the thinking is done.
          // The question is finished, so close it and warm the next one.
          openQuestionRef.current = null;
          gameAttemptsRef.current = 0;
          director.close();
          const correctText = result.question.options.find((o) => o.id === result.correctOptionId);
          const setReveal = (game as unknown as { setReveal?: (r: unknown) => void }).setReveal;
          if (setReveal) {
            // A page-layout game renders the explanation itself, in its own
            // visual language, rather than in a modal over the top.
            // `.call(game)`: it is a class method, and called bare `this` is undefined, so it
            // threw (silently, into the catch below) after the question was already closed.
            setReveal.call(game, {
              correctText: correctText ? `${correctText.id}. ${correctText.text}` : "",
              explanation: result.explanation,
              misconception: result.misconception?.feedback,
            });
          } else {
            setInGameResult(result);
          }
        } else {
          // First miss: the game rules that option out and lets them retry.
          gameAttemptsRef.current += 1;
          firstMissRef.current = result;
          const setMiss = (game as unknown as { setMiss?: (m: unknown) => void }).setMiss;
          setMiss?.call(game, {
            misconception: result.misconception?.misconception,
            feedback: result.misconception?.feedback,
          });
          // Show the hint too: a second attempt deserves real help, not just
          // "try again". It arrives with the wrong-answer result.
          if (result.hint) {
            setMiss?.call(game, {
              misconception: result.misconception?.misconception,
              feedback: result.misconception?.feedback,
              hint: result.hint,
            });
          }
        }
      } catch (e) {
        setNotice(e instanceof ApiError ? e.message : "Couldn't check that answer.");
      }
    };

    chooseRef.current = (optionId: string) => {
      // If the game drives its own answer animation, let it start that first;
      // it will call back through onAnswerChosen when it is ready to score.
      const present = (game as unknown as { presentChoice?: (id: string) => void }).presentChoice;
      if (present) present.call(game, optionId);
      else void scoreFromGame(optionId);
    };
    continueRef.current = () => {
      // A game that owns its own retry flow handles this itself; otherwise
      // the host closes the question and moves on.
      const retry = (game as unknown as { retry?: () => void }).retry;
      if (retry) {
        retry.call(game);
        return;
      }
      setInGameResult(null);
      director.close();
    };

    /**
     * The pacing guarantee.
     *
     * Each game decides where its own "safe moment" is, which is right — but
     * it meant a student could play for a minute with nothing asked, because
     * they never reached a gate / cleared a wave / landed on the right roof.
     * For a learning app that is a failure, so the HOST asks anyway once too
     * long has passed. Gameplay is paused first, exactly as a gate would.
     */
    let lastAsk = performance.now();
    const pacer = window.setInterval(() => {
      if (document.hidden) return;
      // A game that presents its own questions asks at every obstacle, so it
      // already guarantees pacing. Letting the pacer also fire would pull the
      // buffered question out from under the engine mid-question: the options
      // on screen would belong to one question and the scoring to another,
      // which is exactly how a correct answer came back marked wrong.
      if (mod.presentsOwnQuestions) return;
      const sinceAsk = performance.now() - lastAsk;
      const canAsk = director.canAskNow(performance.now());
      if (!canAsk || sinceAsk < FORCE_QUESTION_AFTER_MS) return;
      const q = director.open();
      if (!q) return;
      lastAsk = performance.now();
      haptic("selection");
      setSelected(null);
      setSettled(null);
      setHint(null);
      setCardError(null);
      setCheckpoint({ req: { checkpointId: `paced-${Math.round(sinceAsk)}`, offered: { kind: "none" } }, question: q });
      game.pause("checkpoint");
    }, 1000);
    const arm = window.setInterval(() => {
      const ready = director.canAskNow(performance.now());
      game.setQuestionArmed(ready);
      game.setQuestionsRemain(director.currentStatus !== "exhausted" && director.remaining > 0);
      // Push the learning rail: what this run is about and how it is going.
      const t = director.tally;
      game.setLearningState({
        intent: `${initial.quest.subject} · ${initial.quest.title}`,
        learned: t.correct,
        met: Math.max(t.answered, 1),
        nextConcept: null,
      });
      if (director.currentStatus === "idle" || director.currentStatus === "error") void director.prefetch();
    }, 700);

    return () => {
      stageRo?.disconnect();
      window.clearInterval(pacer);
      window.clearInterval(arm);
      ro.disconnect();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      game.dispose();
      gameRef.current = null;
      directorRef.current = null;
      setInput(null);
    };
    // Mount once per session: re-running this would rebuild the whole world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.session.id]);

  /* ------------------------------------------------------------------ */
  /* notices                                                            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(t);
  }, [notice]);

  /* ------------------------------------------------------------------ */
  /* screen transitions                                                 */
  /* ------------------------------------------------------------------ */
  const startRace = () => {
    setScreen("racing");
    gameRef.current?.start();
  };

  const pauseRace = () => {
    setScreen("paused");
    gameRef.current?.pause("user");
    gameAudio.sfx.uiTap();
  };

  // Escape inside the canvas only flips the screen; the sim is paused here so
  // there is exactly one place that stops the loop.
  useEffect(() => {
    if (screen === "paused") gameRef.current?.pause("user");
  }, [screen]);

  const resumeRace = () => {
    setScreen("racing");
    gameRef.current?.resume();
    gameAudio.sfx.uiTap();
  };

  const quitRace = () => {
    gameRef.current?.quit();
  };

  /* ------------------------------------------------------------------ */
  /* checkpoint handlers                                                */
  /* ------------------------------------------------------------------ */
  const submitAnswer = async () => {
    const director = directorRef.current;
    if (!director || !checkpoint || !selected) return;
    setSubmitting(true);
    setCardError(null);
    try {
      const result = await director.answer(selected, checkpoint.req.offered);
      setSettled(result);
      haptic(result.correct ? "success" : "error");
      if (result.correct) gameAudio.sfx.answerCorrect();
      else gameAudio.sfx.answerWrong();
      gameRef.current?.applyCheckpointOutcome({
        checkpointId: checkpoint.req.checkpointId,
        questionId: result.question.id,
        conceptId: result.question.conceptId,
        correct: result.correct,
        reward: result.reward,
        recoveryOffered: result.canRecover,
      });
    } catch (e) {
      setCardError(e instanceof ApiError ? e.message : "Couldn't check your answer. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const takeHint = async () => {
    const director = directorRef.current;
    if (!director) return;
    setHintBusy(true);
    try {
      setHint(await director.hint());
    } catch (e) {
      setCardError(e instanceof ApiError ? e.message : "Couldn't load the hint.");
    } finally {
      setHintBusy(false);
    }
  };

  const takeRecovery = async () => {
    const director = directorRef.current;
    if (!director || !settled) return;
    setRecoveryBusy(true);
    try {
      await director.requestRecovery(settled.question.conceptId, settled.question.id);
      setNotice("New question queued for the next checkpoint");
      closeCheckpoint();
    } catch (e) {
      setCardError(e instanceof ApiError ? e.message : "Couldn't build a follow-up question.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const closeCheckpoint = () => {
    directorRef.current?.close();
    setCheckpoint(null);
    setSettled(null);
    setSelected(null);
    setHint(null);
    gameRef.current?.resume();
  };

  /* ------------------------------------------------------------------ */
  /* auto quality sampling                                              */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (screen !== "racing" || prefs.tier !== "auto") return;
    const id = window.setInterval(() => {
      // The loop exposes its own smoothed fps; sampling from here keeps the
      // governor out of the render path.
      const fps = gameRef.current?.fps;
      if (typeof fps === "number") governorRef.current?.sample(fps, performance.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [screen, prefs.tier]);

  const hudVisible = screen === "racing" && !checkpoint;

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative w-full bg-[#0a1020]",
        mod.layout === "page" ? "min-h-[100dvh] overflow-y-auto" : "h-[100dvh] overflow-hidden",
      )}
      style={mod.layout === "page" ? ({ ["--sc-stage-top" as string]: "86px" } as React.CSSProperties) : undefined}
    >
      {mod.layout === "page" ? (
        // The canvas is a BAND inside the page, positioned to exactly cover
        // the element the HUD marks with `data-game-stage`. Measuring the real
        // element beats guessing an offset: every HUD lays its header out
        // differently, and a hard-coded top drifts the moment one changes.
        <div ref={stageBoxRef} className="pointer-events-none absolute" style={stageBox}>
          <canvas ref={canvasRef} aria-label={`${mod.id} gameplay`} className="block h-full w-full rounded-[18px]" />
        </div>
      ) : (
        <canvas ref={canvasRef} aria-label={`${mod.id} gameplay`} className="absolute inset-0 block h-full w-full touch-none" />
      )}

      {/* Screen-reader summary of live state; the canvas itself is opaque to AT. */}
      <p className="sr-only" aria-live="polite">
        {screen === "racing" ? liveSummary(hud) : ""}
      </p>

      <mod.Hud
        hud={hud}
        visible={hudVisible}
        onChoose={(optionId) => chooseRef.current?.(optionId)}
        onContinue={() => continueRef.current?.()}
      />
      {input && hudVisible && mod.TouchControls && <mod.TouchControls input={input} />}

      {/* ---------------- top-right chrome ---------------- */}
      {screen === "racing" && !checkpoint && (
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
          <IconButton label="Pause" onClick={pauseRace}>
            <Pause className="size-4" />
          </IconButton>
          <IconButton label={prefs.audio ? "Mute" : "Unmute"} onClick={() => updatePrefs({ audio: !prefs.audio })}>
            {prefs.audio ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </IconButton>
        </div>
      )}

      {/* ---------------- notices ---------------- */}
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={systemReduced ? fade : spring.snappy}
            className="pointer-events-none absolute left-1/2 top-40 z-30 -translate-x-1/2 rounded-full bg-[rgba(12,14,24,0.82)] px-4 py-2 t-footnote font-semibold text-white backdrop-blur-md"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>

      {offline && (
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[rgba(255,159,10,0.9)] px-3 py-1.5 t-caption font-semibold text-[#2a1800]">
          <WifiOff className="size-3.5" /> Offline — questions paused, driving continues
        </div>
      )}

      {/* ---------------- checkpoint ---------------- */}
      <AnimatePresence>
        {checkpoint && (
          <CheckpointCard
            key={checkpoint.question.id}
            question={checkpoint.question}
            offered={checkpoint.req.offered}
            settled={settled}
            submitting={submitting}
            hint={hint}
            hintBusy={hintBusy}
            error={cardError}
            recoveryBusy={recoveryBusy}
            conceptNote={conceptNotes[checkpoint.question.conceptId]}
            selected={selected}
            onSelect={setSelected}
            onSubmit={submitAnswer}
            onHint={takeHint}
            onRecover={takeRecovery}
            onContinue={closeCheckpoint}
          />
        )}
      </AnimatePresence>

      {/* ---- explanation after a second miss, for in-world questions ---- */}
      <AnimatePresence>
        {inGameResult && (
          <Overlay>
            <div className="w-full max-w-lg rounded-[1.75rem] bg-surface p-5">
              <p className="t-caption font-semibold uppercase tracking-wider text-tint">
                {inGameResult.question.conceptTitle}
              </p>
              <h2 className="mb-2 t-title3 text-ink">Here&apos;s what was going on</h2>
              {inGameResult.misconception && (
                <p className="mb-2 t-subhead text-ink">
                  <span className="font-semibold">{inGameResult.misconception.misconception}: </span>
                  {inGameResult.misconception.feedback}
                </p>
              )}
              <p className="t-subhead text-muted">{inGameResult.explanation}</p>
              <div className="mt-4 flex justify-end">
                <Button
                  size="lg"
                  onClick={() => {
                    setInGameResult(null);
                    directorRef.current?.close();
                  }}
                >
                  Next question
                </Button>
              </div>
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ---------------- ready ---------------- */}
      <AnimatePresence>
        {screen === "ready" && (
          <Overlay>
            <ReadyCard
              name={mod.id}
              tagline={mod.tagline}
              rewardLine={mod.rewardLine}
              controls={mod.controls}
              touchHint={mod.touchHint}
              title={initial.quest.title}
              questions={initial.session.playLength}
              onStart={startRace}
              onBack={() => router.push(`/quest/${initial.quest.id}`)}
            />
          </Overlay>
        )}
      </AnimatePresence>

      {/* ---------------- paused ---------------- */}
      <AnimatePresence>
        {screen === "paused" && (
          <Overlay>
            <div className="w-full max-w-sm rounded-[1.75rem] bg-surface p-5">
              <h2 className="mb-1 t-title2 text-ink">Paused</h2>
              <p className="mb-4 t-footnote text-muted">
                {progressLine(hud)}
              </p>
              {showSettings ? (
                <SettingsPanel prefs={prefs} onChange={updatePrefs} onBack={() => setShowSettings(false)} />
              ) : (
                <div className="grid gap-2">
                  <Button size="lg" onClick={resumeRace}>
                    <Play /> Resume
                  </Button>
                  <Button variant="secondary" onClick={() => setShowSettings(true)}>
                    <Settings2 /> Settings
                  </Button>
                  <Button variant="secondary" onClick={quitRace}>
                    <RotateCcw /> End run and see results
                  </Button>
                  <Button variant="ghost" onClick={() => router.push(`/quest/${initial.quest.id}`)}>
                    <ArrowLeft /> Leave
                  </Button>
                </div>
              )}
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ---------------- finished ---------------- */}
      <AnimatePresence>
        {screen === "finished" && summary && (
          <Overlay>
            <RunSummaryCard
              summary={summary}
              questTitle={initial.quest.title}
              onSeeLearning={() => router.push(`/quest/${initial.quest.id}/results?session=${initial.session.id}`)}
              onAgain={() => router.push(`/quest/${initial.quest.id}`)}
            />
          </Overlay>
        )}
      </AnimatePresence>

      {/* ---------------- fatal ---------------- */}
      {fatal && (
        <Overlay>
          <div className="w-full max-w-sm rounded-[1.75rem] bg-surface p-5">
            <h2 className="mb-1 t-title3 text-ink">The game couldn&apos;t run here</h2>
            <p className="mb-4 t-subhead text-muted">{fatal}</p>
            <p className="mb-4 t-footnote text-faint">
              Your progress is safe — you can play this quest with just the question cards instead.
            </p>
            <Button size="lg" className="w-full" onClick={() => router.push(`/quest/${initial.quest.id}?world=classic`)}>
              Play without 3D
            </Button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */

/**
 * A screen-reader line describing play. HUD shapes differ per game, so this
 * reads only the learning fields every game is required to publish.
 */
/** Pause-menu progress line, again using only the shared learning fields. */
function progressLine(hud: unknown): string {
  const h = (hud ?? {}) as { conceptsLearned?: number; conceptsMet?: number };
  return `${h.conceptsLearned ?? 0} of ${h.conceptsMet ?? 0} questions correct so far`;
}

function liveSummary(hud: unknown): string {
  const h = (hud ?? {}) as { sessionIntent?: string; conceptsLearned?: number; conceptsMet?: number };
  if (!h.sessionIntent) return "";
  return `${h.sessionIntent}. ${h.conceptsLearned ?? 0} of ${h.conceptsMet ?? 0} questions correct so far.`;
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[rgba(4,6,14,0.78)] p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
    >
      {children}
    </motion.div>
  );
}

function IconButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pressable flex size-10 items-center justify-center rounded-full bg-[rgba(12,14,24,0.6)] text-white ring-1 ring-white/14 backdrop-blur-md"
    >
      {children}
    </button>
  );
}

function ReadyCard({
  name,
  tagline,
  rewardLine,
  controls,
  touchHint,
  title,
  questions,
  onStart,
  onBack,
}: {
  name: string;
  tagline: string;
  rewardLine: string;
  controls: { keys: string; action: string }[];
  touchHint?: string;
  title: string;
  questions: number;
  onStart: () => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-[1.75rem] bg-surface p-5 sm:p-6">
      <p className="t-caption font-semibold uppercase tracking-wider text-tint">{name.replace(/-/g, " ")}</p>
      <h2 className="mb-1 t-title1 text-ink">{title}</h2>
      <p className="mb-4 t-subhead text-muted">
        {tagline}
      </p>

      {/* The objective, stated before anything else. A student should never
          have to guess what a run is for or when it ends. */}
      <div className="mb-4 rounded-2xl bg-tint/10 p-3.5 ring-1 ring-tint/25">
        <h3 className="mb-1 flex items-center gap-1.5 t-headline text-ink">
          <Target className="size-4 text-tint" /> Your goal
        </h3>
        <p className="t-subhead text-ink">
          Answer <span className="font-semibold">{questions} questions</span> about this chapter. A question appears every few
          seconds — play pauses completely each time, so you never read while moving.
        </p>
        <p className="mt-1.5 t-footnote text-muted">{rewardLine} The run ends when you have answered all {questions}.</p>
      </div>

      <div className="mb-4 space-y-2 rounded-2xl bg-surface-2 p-3.5">
        <h3 className="t-headline text-ink">Controls</h3>
        <dl className="grid gap-1.5 t-footnote">
          {controls.map((c) => (
            <ControlRow key={c.keys} keys={c.keys} action={c.action} />
          ))}
        </dl>
        {touchHint && <p className="t-caption text-faint lg:hidden">On a phone: {touchHint}</p>}
      </div>

      <p className="mb-4 flex items-start gap-2 t-footnote text-muted">
        <Gauge className="mt-0.5 size-3.5 shrink-0 text-tint" />
        Skill and learning are scored separately — mistakes in play never affect your mastery, and a wrong answer never ends your run.
      </p>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button size="lg" className="flex-1" onClick={onStart} data-autofocus>
          <Play /> Start race
        </Button>
      </div>
    </div>
  );
}

function ControlRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="min-w-20 shrink-0">
        <kbd className="rounded-md bg-fill-3 px-1.5 py-0.5 font-rounded text-[0.7rem] font-semibold text-ink">{keys}</kbd>
      </dt>
      <dd className="text-muted">{action}</dd>
    </div>
  );
}

function SettingsPanel({
  prefs,
  onChange,
  onBack,
}: {
  prefs: StoredGamePrefs;
  onChange: (p: Partial<StoredGamePrefs>) => void;
  onBack: () => void;
}) {
  const tiers: (QualityTier | "auto")[] = ["auto", "low", "medium", "high"];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 t-headline text-ink">Graphics</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {tiers.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ tier: t })}
              className={cn(
                "pressable rounded-xl px-2 py-2 t-caption font-semibold capitalize",
                prefs.tier === t ? "bg-tint text-on-tint" : "bg-surface-2 text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-1.5 t-caption text-faint">Auto drops detail if the frame rate dips, and raises it again when there&apos;s headroom.</p>
      </div>

      <Toggle label="Sound" checked={prefs.audio} onChange={(v) => onChange({ audio: v })} />
      <Toggle label="Camera shake" checked={prefs.cameraShake} onChange={(v) => onChange({ cameraShake: v })} />
      <Toggle label="Speed effects" checked={prefs.speedEffects} onChange={(v) => onChange({ speedEffects: v })} />

      <Button variant="secondary" className="w-full" onClick={onBack}>
        Done
      </Button>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="t-subhead text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-success-fill" : "bg-fill")}
      >
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}
