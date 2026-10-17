"use client";

/**
 * Spider Climb — the adapter.
 *
 * All the artwork, physics and animation live in `engine.js`, ported verbatim
 * from the original Spider-Climb.html. This file is the thin layer that lets
 * that engine run inside the app:
 *
 *   - it feeds the engine questions from the student's own chapter rather
 *     than the original's hard-coded Physics bank,
 *   - it forwards the student's chosen anchor to the host for *server-side*
 *     scoring, then hands the verdict back so the rope holds or snaps,
 *   - it republishes the engine's state as our HUD shape.
 *
 * The engine never learns the answer key, which is the one invariant every
 * game in this app has to honour.
 */
import type {
  CheckpointOutcome,
  GameHostContext,
  GameQuestion,
  GameRunSummary,
  LearningGame,
  MotionPreferences,
  PauseReason,
  QualitySettings,
} from "@/lib/game/types";
// Ported JS with `@ts-nocheck`; the shape we rely on is declared below.
import { SpiderEngine } from "./engine.js";

/** The slice of the ported engine this adapter actually uses. */
interface Engine {
  mount(): void;
  unmount(): void;
  resolveChoice(ok: boolean): void;
  choose(k: number): void;
  start(ci: number): void;
  /** Dismisses the engine's feedback panel and re-arms the question. */
  feedbackAction(): void;
  setState(v: Partial<EngineState>): void;
  state: EngineState;
  /** The original's attract-mode flag. */
  demo: boolean;
  C: { q: unknown[] }[];
  timeScale: number;
}

export interface SpiderHud {
  /** Subject · chapter, shown as the eyebrow. */
  intent: string;
  conceptTitle: string;
  question: GameQuestion | null;
  /** Indexes already tried and ruled out on this question. */
  tried: number[];
  selected: number;
  phase: string;
  hearts: number;
  score: number;
  streak: number;
  bestStreak: number;
  firstTry: number;
  answered: number;
  total: number;
  /** The engine's banner (correct / snapped), already written for a student. */
  banner: { color: string; title: string; text: string } | null;
  /**
   * Shown after a wrong anchor: the named misconception and a hint. The
   * answer itself is NOT revealed — the student gets to think again.
   */
  miss: { misconception?: string; feedback?: string; hint?: string } | null;
  /** True while the engine is waiting for the student to try again. */
  awaitingRetry: boolean;
  toast: { text: string; color: string } | null;
  hintKey: string;
}

interface EngineState {
  screen: string;
  feedback: { ok: boolean; dead: boolean } | null;
  qi: number;
  phase: string;
  hearts: number;
  score: number;
  streak: number;
  bestStreak: number;
  firstTry: number;
  tried: number[];
  selected: number;
  banner: SpiderHud["banner"];
  toast: SpiderHud["toast"];
  hintKey: string;
}

export class SpiderClimbGame implements LearningGame<SpiderHud> {
  readonly id = "spider-climb" as const;

  private host!: GameHostContext<SpiderHud>;
  private engine!: Engine;
  private motion!: MotionPreferences;
  private quality!: QualitySettings;

  private question: GameQuestion | null = null;
  private answered = 0;
  private finished = false;
  private started = false;
  private disposed = false;
  private learning = { intent: "", learned: 0, met: 0 };
  private readonly total: number;

  private readonly hud: SpiderHud = {
    intent: "", conceptTitle: "", question: null, tried: [], selected: -1, phase: "move",
    hearts: 3, score: 0, streak: 0, bestStreak: 0, firstTry: 0, answered: 0, total: 8,
    banner: null, toast: null, hintKey: "run", miss: null, awaitingRetry: false,
  };

  private miss: SpiderHud["miss"] = null;

  constructor(opts: { learningCheckpoints: number }) {
    this.total = Math.max(4, opts.learningCheckpoints);
    this.hud.total = this.total;
  }

  mount(host: GameHostContext<SpiderHud>) {
    this.host = host;
    this.quality = host.quality;
    this.motion = host.motion;

    // One chapter with `total` placeholder gaps. Each is filled in with the
    // real question as it arrives, so the world is built at the right length
    // without the engine ever holding a bank of its own.
    const placeholder = Array.from({ length: this.total }, () => ({
      question: "",
      options: ["", "", "", ""],
      correct: -1,
      explain: "",
    }));

    this.engine = new SpiderEngine({
      canvas: host.canvas,
      chapters: [{ cls: "", title: "", color: "#ffd23f", q: placeholder }],
      onState: (s: EngineState) => this.publish(s),
      onChoose: (k: number) => this.onChoose(k),
    }) as Engine;
    this.engine.mount();
    // `start` is the original's real entry point: it builds the play world,
    // leaves demo mode and resets the run. Poking state instead left the
    // attract-mode world in place and the hero never reached a gap.
    this.engine.start(0);
  }

  start() {
    if (this.started || this.disposed) return;
    this.started = true;
  }

  pause(_r: PauseReason) {
    this.engine.timeScale = 0;
  }

  resume() {
    if (!this.disposed && !this.finished) this.engine.timeScale = 1;
  }

  /** The engine measures the canvas itself every frame, so this is a no-op. */
  resize(_w: number, _h: number) {}

  setQuality(q: QualitySettings) { this.quality = q; }
  setMotionPreferences(p: MotionPreferences) { this.motion = p; }
  get inputManager() { return null as never; }
  get fps() { return 60; }

  setQuestionArmed(armed: boolean) {
    if (!armed || this.question || this.finished) return;
    this.host.onCheckpoint({ checkpointId: `gap-${this.answered}`, offered: { kind: "none" } });
  }

  setQuestionsRemain(remain: boolean) {
    if (!remain && this.answered > 0) this.finish("finished");
  }

  setLearningState(s: { intent: string; learned: number; met: number; nextConcept: string | null }) {
    this.learning = { intent: s.intent, learned: s.learned, met: s.met };
  }

  /**
   * A gap is reached. Write the question into the engine's current slot and
   * let it put one option on each anchor spire.
   */
  presentQuestion(q: GameQuestion) {
    this.question = q;
    const slot = Math.min(this.total - 1, this.engine.state.qi);
    this.engine.C[0].q[slot] = {
      question: q.text,
      options: q.options.slice(0, 4).map((o) => o.text),
      // The engine must not know which is right; it is told after scoring.
      correct: -1,
      explain: "",
    };
    this.engine.setState({ phase: "question", tried: [], selected: -1 });
  }

  /** The student webbed onto an anchor. Ask the host to score it. */
  private onChoose(k: number) {
    const opt = this.question?.options[k];
    if (!opt) return;
    this.host.onAnswerChosen?.(opt.id);
  }

  /**
   * Entry point for a click on one of the HUD's answer buttons.
   *
   * It must go through the ENGINE's `choose`, not straight to the host: that
   * is what records the pending anchor, plays the thwip and puts the hero
   * into the shoot pose. Scoring then comes back round through
   * `settleQuestion` -> `resolveChoice`. Calling the host directly skipped
   * all of that and the click appeared to do nothing.
   */
  presentChoice(optionId: string) {
    const k = this.question?.options.findIndex((o) => o.id === optionId) ?? -1;
    if (k < 0) return;
    this.engine.choose(k);
  }

  /** The server has scored it: the rope holds, or it snaps. */
  settleQuestion(correct: boolean, correctOptionId: string) {
    const q = this.question;
    if (q) {
      // Give the engine the text it needs for its own banner copy.
      const idx = q.options.findIndex((o) => o.id === correctOptionId);
      const slot = Math.min(this.total - 1, this.engine.state.qi);
      const entry = this.engine.C[0].q[slot] as { correct: number; explain: string };
      entry.correct = idx;
      entry.explain = this.pendingExplain;
    }
    if (correct) {
      this.answered++;
      this.question = null;
    }
    this.engine.resolveChoice(correct);
  }

  private pendingExplain = "";
  /**
   * Called on a wrong anchor with the server's targeted feedback, so the
   * student is told WHY that option was tempting rather than just "no".
   */
  setMiss(m: { misconception?: string; feedback?: string; hint?: string } | null) {
    this.miss = m;
  }

  /** The student pressed "try again": clear the panel and re-arm the gap. */
  retry() {
    this.miss = null;
    this.engine.feedbackAction();
  }

  /** The host passes the worked explanation so the engine can show it. */
  setReveal(r: { explanation?: string } | null) {
    this.pendingExplain = r?.explanation ?? "";
    if (r) {
      this.answered++;
      this.question = null;
    }
  }

  applyCheckpointOutcome(_o: CheckpointOutcome) { /* handled in settleQuestion */ }

  quit() { this.finish("quit"); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.engine?.unmount();
  }

  private publish(s: EngineState) {
    const h = this.hud;
    h.intent = this.learning.intent;
    h.conceptTitle = this.question?.conceptTitle ?? "";
    h.question = this.question;
    h.tried = s.tried ?? [];
    h.selected = s.selected ?? -1;
    h.phase = s.phase;
    h.hearts = s.hearts;
    h.score = s.score;
    h.streak = s.streak;
    h.bestStreak = s.bestStreak;
    h.firstTry = s.firstTry;
    h.answered = this.answered;
    h.banner = s.banner;
    h.miss = this.miss;
    h.awaitingRetry = s.phase === "feedback" && !s.feedback?.dead;
    h.toast = s.toast;
    h.hintKey = s.hintKey;
    this.host.onHud({ ...h });
  }

  private finish(outcome: "finished" | "quit") {
    if (this.finished) return;
    this.finished = true;
    const s = this.engine?.state;
    this.host.onFinish({
      gameId: "spider-climb",
      outcome,
      game: {
        durationSec: 0,
        distanceM: 0,
        topSpeedKph: 0,
        checkpointsPassed: this.answered,
        checkpointsTotal: this.total,
        crashes: Math.max(0, 3 - (s?.hearts ?? 3)),
        score: s?.score ?? 0,
        extras: { firstTry: s?.firstTry ?? 0, bestStreak: s?.bestStreak ?? 0 },
      },
      learning: { answered: 0, correct: 0, recoveriesFixed: 0 },
    });
  }
}
