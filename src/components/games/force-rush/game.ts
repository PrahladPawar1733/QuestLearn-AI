"use client";

/**
 * Force Rush — the adapter.
 *
 * Every pixel, every particle and all of the physics live in `engine.js`,
 * ported verbatim from the author's original "Force Rush.html". This file is
 * the thin layer that lets that engine run inside the app:
 *
 *   - it builds ONE chapter of empty obstacles at mount and fills each one in
 *     with the student's real question as it arrives, so the engine never
 *     holds a question bank of its own,
 *   - it forwards the chosen option to the host for *server-side* scoring and
 *     hands the verdict back, so the gate opens or the engine stalls,
 *   - it republishes the engine's own `renderVals()` as our HUD shape, which
 *     is how the author's colours, warning copy and tier labels survive the
 *     port unchanged.
 *
 * The engine is never told which option is right until after the server has
 * scored it. That is the one invariant every game in this app has to honour.
 */
import type {
  CheckpointOutcome,
  GameHostContext,
  GameQuestion,
  LearningGame,
  MotionPreferences,
  PauseReason,
  QualitySettings,
} from "@/lib/game/types";
// Ported JS with `@ts-nocheck`; the slice we rely on is declared below.
import { ForceRushEngine } from "./engine.js";

/**
 * The five obstacle kinds the author wrote, in the order of their own comment
 * at the top of `chapters()`. Injected questions cycle through them, so a run
 * shows the lock gate, the ramp over the pit, the drawbridge, the spike strip
 * and the closing door rather than the same prop eight times.
 */
const OBSTACLE_KINDS = ["gate", "jump", "bridge", "trap", "door"] as const;

/**
 * The author's chapter tiers are 1 = untimed, 2 = 20s per question, 3 = 12s.
 * We run untimed: the server owns scoring, and a question that times out is
 * never submitted, so a clock would cost health for an answer nobody graded.
 * The whole timer path is still in the engine and the HUD renders it the
 * moment a chapter is injected with a higher tier.
 */
const TIER = 1;

/** How often the speed and timer readouts are republished, in ms. */
const TICK_MS = 125;

/* ------------------------------------------------------------------ */
/* the slice of the ported engine this adapter uses                    */
/* ------------------------------------------------------------------ */

interface EngineObstacle {
  type: string;
  question: string;
  options: string[];
  correct: number;
  explain: string;
  pad: number;
  x: number;
  solved: boolean;
  doorH: number;
  ang: number;
  spikeH: number;
  bumped: boolean;
  locked?: boolean;
  plank?: boolean;
  launched?: boolean;
  hold?: number;
  slipT?: number;
  result?: boolean;
  wrong?: Record<number, boolean>;
}

interface EngineCard {
  color: string;
  title: string;
  text: string;
  explain: string;
  button: string;
  /** Set by the engine on the "you cleared it" card: dismissing drives on. */
  pass?: boolean;
  /** Set when health ran out: dismissing restarts the chapter. */
  dead?: boolean;
  /** Only the chapter-cleared card carries this, so it identifies the end. */
  next?: boolean;
}

interface EngineState {
  screen: string;
  ci: number;
  oi: number;
  phase: string;
  hearts: number;
  wrongs?: number;
  verdict: { ok: boolean; title: string; sub: string } | null;
  card: EngineCard | null;
}

interface EngineVals {
  speed: string;
  qLeft: number;
  tierLabel: string;
  tierColor: string;
  stars: string;
  playing: boolean;
  showMenu: boolean;
  classLabel: string;
  chapterTitle: string;
  dots: { color: string }[];
  hearts: { color: string }[];
  obstacleWarning: string;
  timed: boolean;
  question: string;
  options: { label: string; bg: string; fg: string; cursor: string; deco: string }[];
  showQuestion: boolean;
  showVerdict: boolean;
  verdictBg: string;
  verdictTitle: string;
  verdictSub: string;
  showCard: boolean;
  cardColor: string;
  cardTitle: string;
  cardText: string;
  cardExplain: string;
  cardHasExplain: boolean;
  cardButton: string;
  cardAction: () => void;
}

interface Engine {
  mount(): void;
  unmount(): void;
  loadChapter(ci: number, play: boolean): void;
  choose(k: number): void;
  resolveChoice(ok: boolean): void;
  continueAfterFail(): void;
  groundAt(x: number): number | null;
  setState(v: Partial<EngineState>): void;
  renderVals(): EngineVals;
  state: EngineState;
  C: { cls: string; title: string; tier: number; obs: EngineObstacle[] }[];
  obs: EngineObstacle[];
  car: { x: number; y: number; s: number; vx: number; vy: number; air: boolean; angle: number; angVel: number; wobble: number };
  sim: { target: number; t: number; ok: boolean | null; respawn: boolean; done: boolean; timer: number; qTime?: number; chosen?: number };
  timeScale: number;
  speed: string;
  qLeft: number;
}

/* ------------------------------------------------------------------ */
/* the HUD shape                                                       */
/* ------------------------------------------------------------------ */

/**
 * What the page renders. Almost all of it is the engine's own `renderVals()`,
 * so the colours and the warning copy are the author's, not ours. The typed
 * `question` is ours, because the HUD renders maths with `RichText` and needs
 * the option ids the server scores against.
 */
export interface ForceRushHud {
  /* read by the host's screen-reader live region */
  sessionIntent: string;
  conceptsLearned: number;
  conceptsMet: number;

  classLabel: string;
  chapterTitle: string;
  conceptTitle: string;
  tierLabel: string;
  tierColor: string;
  dots: { color: string }[];
  hearts: { color: string }[];
  speed: string;
  qLeft: number;
  timed: boolean;
  obstacleWarning: string;
  phase: string;

  question: GameQuestion | null;
  /** One per option: the id the server scores, plus the engine's own styling. */
  options: { id: string; text: string; bg: string; fg: string; cursor: string; deco: string; out: boolean }[];
  showQuestion: boolean;

  showVerdict: boolean;
  verdictBg: string;
  verdictTitle: string;
  verdictSub: string;

  showCard: boolean;
  cardColor: string;
  cardTitle: string;
  cardText: string;
  cardExplain: string;
  cardHasExplain: boolean;
  cardButton: string;
  /** The engine's own card action: drive on, try again, restart the chapter. */
  advance: (() => void) | null;
  /** True when dismissing this card must also close the host's question. */
  cardCloses: boolean;

  answered: number;
  total: number;
}

export const EMPTY_FORCE_RUSH_HUD: ForceRushHud = {
  sessionIntent: "",
  conceptsLearned: 0,
  conceptsMet: 0,
  classLabel: "FORCE RUSH",
  chapterTitle: "",
  conceptTitle: "",
  tierLabel: "EASY",
  tierColor: "#7dff9a",
  dots: [],
  hearts: [{ color: "#ff3fa0" }, { color: "#ff3fa0" }, { color: "#ff3fa0" }],
  speed: "0.0",
  qLeft: 0,
  timed: false,
  obstacleWarning: "",
  phase: "drive",
  question: null,
  options: [],
  showQuestion: false,
  showVerdict: false,
  verdictBg: "#ff3fa0",
  verdictTitle: "",
  verdictSub: "",
  showCard: false,
  cardColor: "#ff3fa0",
  cardTitle: "",
  cardText: "",
  cardExplain: "",
  cardHasExplain: false,
  cardButton: "",
  advance: null,
  cardCloses: false,
  answered: 0,
  total: 0,
};

/* ------------------------------------------------------------------ */
/* the game                                                            */
/* ------------------------------------------------------------------ */


/**
 * Misconceptions are stored as machine keys ("thickness-blocks-everything")
 * so the engine can track them across attempts. A student should read a
 * phrase, not a slug.
 */
function humaniseMisconception(key: string | undefined): string | undefined {
  if (!key) return key;
  if (key.includes(" ")) return key;
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export class ForceRushGame implements LearningGame<ForceRushHud> {
  readonly id = "force-rush" as const;

  private host!: GameHostContext<ForceRushHud>;
  private engine!: Engine;
  private motion!: MotionPreferences;
  private quality!: QualitySettings;

  private question: GameQuestion | null = null;
  private miss: { misconception?: string; feedback?: string; hint?: string } | null = null;
  private reveal: { correctText?: string; explanation?: string; misconception?: string } | null = null;
  /** True once the fail card has been turned into the "here is why" card. */
  private revealed = false;

  private answered = 0;
  private topSpeed = 0;
  private finished = false;
  private started = false;
  private disposed = false;
  private learning = { intent: "", learned: 0, met: 0 };
  private askedAt = 0;
  private ticker: number | null = null;
  private savedTimeScale = 1;
  private readonly total: number;

  constructor(opts: { learningCheckpoints: number }) {
    this.total = Math.max(4, opts.learningCheckpoints);
  }

  /* ---------------- lifecycle ---------------- */

  mount(host: GameHostContext<ForceRushHud>) {
    this.host = host;
    this.quality = host.quality;
    this.motion = host.motion;

    // One chapter of empty obstacles, one per planned checkpoint. Each is
    // filled in with the real question as it arrives, so the road is built at
    // the right length without the engine ever holding a bank.
    const obs = Array.from({ length: this.total }, (_, i) => ({
      type: OBSTACLE_KINDS[i % OBSTACLE_KINDS.length],
      question: "",
      options: ["", "", "", ""],
      // The engine must not know which is right; it is told after scoring.
      correct: -1,
      explain: "",
    }));

    this.engine = new ForceRushEngine({
      canvas: host.canvas,
      chapters: [{ cls: "FORCE RUSH", title: "", tier: TIER, obs }],
      onState: () => this.publish(),
      onChoose: (k: number) => this.onChoose(k),
      // The author's hint is squeezed out of a worked solution, which we do
      // not have at that moment. The server's own targeted feedback arrives
      // through `setMiss` instead and goes in the same place on the card.
      showHintOnWrong: false,
    }) as Engine;
    this.engine.mount();
  }

  /**
   * The engine gates its render loop on its own screen flag: `frame()` runs
   * the fixed-step physics only while `state.screen === 'play'`, and draws an
   * attract-mode drive-by otherwise. `mount()` leaves it on 'menu', which is
   * the right thing while the host's ready screen is up — the student sees the
   * car roll past behind it. Pressing play calls `loadChapter(0, true)`, the
   * author's own way into a chapter, which sets 'play' and starts the run.
   */
  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    this.engine.loadChapter(0, true);
    this.ticker = window.setInterval(() => this.tick(), TICK_MS);
  }

  pause(_r: PauseReason) {
    // Saved rather than forced back to 1 on resume: the engine itself parks
    // `timeScale` at 0 while a question or a card is up, and resuming into a
    // question must not let the car drive off while it is still being read.
    if (this.engine.timeScale !== 0) this.savedTimeScale = this.engine.timeScale;
    this.engine.timeScale = 0;
  }

  resume() {
    if (this.disposed || this.finished) return;
    const phase = this.engine.state.phase;
    this.engine.timeScale = phase === "question" || phase === "card" ? 0 : this.savedTimeScale;
  }

  /** The engine measures the canvas itself every frame, so this is a no-op. */
  resize(_w: number, _h: number) {}

  setQuality(q: QualitySettings) {
    this.quality = q;
  }

  /**
   * Stored for completeness. The original has no camera shake, no motion blur
   * and no speed vignette — its only motion beyond the car is the particle
   * bursts, which are the game's feedback channel and stay.
   */
  setMotionPreferences(p: MotionPreferences) {
    this.motion = p;
  }

  get inputManager() {
    // Answering is a button press in the page, so there is no analogue input
    // to share with on-screen controls.
    return null as never;
  }

  get fps() {
    return 60;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.ticker != null) window.clearInterval(this.ticker);
    this.ticker = null;
    this.engine?.unmount();
  }

  quit() {
    this.finish("quit");
  }

  /* ---------------- the host <-> game channel ---------------- */

  setQuestionArmed(_armed: boolean) {
    // The ENGINE decides when to ask: the car reaches the checkpoint pad and
    // stops. `publish()` raises the checkpoint at that moment, so an armed
    // question waits for the pad rather than interrupting the drive.
  }

  setQuestionsRemain(remain: boolean) {
    if (!remain && this.answered > 0) this.finish("finished");
  }

  setLearningState(s: { intent: string; learned: number; met: number; nextConcept: string | null }) {
    this.learning = { intent: s.intent, learned: s.learned, met: s.met };
    // The author's HUD shows a class label and a chapter title. Our run's
    // subject and quest arrive as "Subject · Quest", so split them into the
    // same two slots.
    const chapter = this.engine?.C?.[0];
    if (chapter && s.intent) {
      const cut = s.intent.indexOf(" · ");
      chapter.cls = (cut > 0 ? s.intent.slice(0, cut) : s.intent).toUpperCase();
      chapter.title = cut > 0 ? s.intent.slice(cut + 3) : "";
    }
  }

  /**
   * The car has stopped at a checkpoint pad and a question is in hand: write
   * it into that obstacle and let the engine put the warning sign, the timer
   * and the four options up in the author's own panel.
   */
  presentQuestion(q: GameQuestion) {
    this.question = q;
    this.miss = null;
    this.reveal = null;
    this.revealed = false;
    this.writeQuestion(q);
    this.publish();
  }

  /**
   * Entry point for a click on one of the page's answer buttons. It goes
   * through the ENGINE's `choose`, not straight to the host, because that is
   * what records the pending option so the verdict banner can name it.
   */
  presentChoice(optionId: string) {
    const k = this.question?.options.findIndex((o) => o.id === optionId) ?? -1;
    if (k < 0) return;
    this.engine.choose(k);
  }

  /** The engine reports the chosen index; the server scores it. */
  private onChoose(k: number) {
    const opt = this.question?.options[k];
    if (!opt) return;
    this.host.onAnswerChosen?.(opt.id);
  }

  /**
   * The server has scored it. The engine is handed the verdict and nothing
   * else — not even the correct index, which it no longer has a use for — and
   * runs the author's animation: the gate lifts, the bridge drops, the strip
   * retracts, or the car slams into it and stalls.
   */
  settleQuestion(correct: boolean, _correctOptionId: string) {
    if (correct) {
      this.answered++;
      this.question = null;
    }
    this.engine.resolveChoice(correct);
  }

  /**
   * A first miss, with the server's targeted feedback on the option they
   * chose, and a real hint shortly after. It goes into the explanation block
   * of the author's "WRONG ANSWER" card — the place their own hint used.
   */
  setMiss(m: { misconception?: string; feedback?: string; hint?: string } | null) {
    this.miss = m;
    this.publish();
  }

  /**
   * A second miss. The thinking is done, so the run stops asking and starts
   * teaching: the card becomes "HERE IS WHY", with the correct option and the
   * worked explanation, and dismissing it opens the obstacle and drives on.
   */
  setReveal(r: { correctText?: string; explanation?: string; misconception?: string } | null) {
    this.reveal = r;
    if (r) {
      this.answered++;
      this.question = null;
    }
    this.publish();
  }

  applyCheckpointOutcome(_o: CheckpointOutcome) {
    /* handled in settleQuestion */
  }

  /* ---------------- internals ---------------- */

  /** Copy a question into the obstacle the car is standing at. */
  private writeQuestion(q: GameQuestion) {
    const ob = this.engine.obs?.[this.engine.state.oi];
    if (!ob) return;
    const opts = q.options.slice(0, 4).map((o) => o.text);
    while (opts.length < 4) opts.push("");
    ob.question = q.text;
    ob.options = opts;
    ob.correct = -1;
    ob.explain = "";
    ob.wrong = {};
  }

  /** Republish the speed and timer readouts without a state change. */
  private tick() {
    if (this.disposed) return;
    const c = this.engine.car;
    const v = c ? (c.air ? Math.hypot(c.vx, c.vy) : Math.abs(c.s)) : 0;
    if (v > this.topSpeed) this.topSpeed = v;
    this.publish();
  }

  /**
   * Turn the engine's state into our HUD.
   *
   * This is also where the two places the engine and the host have to meet
   * are handled, because both are visible in the published state: the car
   * arriving at a pad with no question in hand, and a card that needs the
   * server's feedback folded into it.
   */
  private publish() {
    if (this.disposed || !this.engine?.obs) return;
    const s = this.engine.state;

    // The run is over when the engine raises its own chapter-cleared card;
    // only that card carries `next`, so no string matching is needed.
    if (s.card && s.card.next !== undefined) {
      this.finish("finished");
      return;
    }

    if (s.screen === "play" && s.phase === "question") this.ensureQuestion();
    if (s.phase === "card" && s.card) this.dressCard(s.card);

    const v = this.engine.renderVals();
    const q = this.question;
    const out = this.engine.obs[s.oi]?.wrong ?? {};

    this.host.onHud({
      sessionIntent: this.learning.intent,
      conceptsLearned: this.learning.learned,
      conceptsMet: this.learning.met,

      classLabel: v.classLabel,
      chapterTitle: v.chapterTitle,
      conceptTitle: q?.conceptTitle ?? "",
      tierLabel: v.tierLabel,
      tierColor: v.tierColor,
      dots: v.dots,
      hearts: v.hearts,
      speed: this.engine.speed,
      qLeft: this.engine.qLeft,
      timed: v.timed,
      obstacleWarning: v.obstacleWarning,
      phase: s.phase,

      question: q,
      options: (q?.options ?? []).slice(0, 4).map((o, i) => {
        const style = v.options[i];
        return {
          id: o.id,
          text: o.text,
          bg: style?.bg ?? "#2a2b36",
          fg: style?.fg ?? "#fff",
          cursor: style?.cursor ?? "pointer",
          deco: style?.deco ?? "none",
          out: !!out[i],
        };
      }),
      showQuestion: v.showQuestion && !!q,

      showVerdict: v.showVerdict,
      verdictBg: v.verdictBg,
      verdictTitle: v.verdictTitle,
      verdictSub: v.verdictSub,

      showCard: v.showCard,
      cardColor: v.cardColor,
      cardTitle: v.cardTitle,
      cardText: v.cardText,
      cardExplain: v.cardExplain,
      cardHasExplain: v.cardHasExplain,
      cardButton: v.cardButton,
      advance: v.cardAction,
      cardCloses: this.revealed,

      answered: this.answered,
      total: this.total,
    });
  }

  /**
   * The car stops at a pad on its own, which is this game's safe teaching
   * moment. Ask the host for a question there, and keep asking slowly while
   * the car waits, because the director may still be fetching one. The same
   * path re-fills the slot after the engine restarts a chapter on zero health.
   */
  private ensureQuestion() {
    const ob = this.engine.obs[this.engine.state.oi];
    if (!ob) return;
    if (this.question) {
      if (ob.question !== this.question.text) this.writeQuestion(this.question);
      return;
    }
    if (this.finished) return;
    const now = performance.now();
    if (now - this.askedAt < 1200) return;
    this.askedAt = now;
    this.host.onCheckpoint({ checkpointId: `obstacle-${this.engine.state.oi}`, offered: { kind: "none" } });
  }

  /**
   * Fold the server's words into the author's card.
   *
   * On a first miss the explanation block carries the feedback on the option
   * they chose plus the hint. On a second miss the card becomes the reveal:
   * same card, the author's amber, and dismissing it opens the obstacle and
   * drives on instead of asking again. When health ran out the author's
   * restart card stands as written and only gains the explanation.
   */
  private dressCard(card: EngineCard) {
    if (card.pass) {
      // Nothing comes back from the server on a correct answer, so there is no
      // working to show. The author's sentence promising one is trimmed rather
      // than left pointing at an empty block.
      if (!card.explain) card.text = card.text.replace(" Here is the working:", "");
      return;
    }
    const r = this.reveal;
    if (r) {
      const explain = [humaniseMisconception(r.misconception), r.explanation].filter(Boolean).join("\n\n");
      if (!this.revealed) {
        this.revealed = true;
        if (card.dead) {
          card.explain = explain;
        } else {
          this.openObstacle();
          card.color = "#ffd166";
          card.title = "HERE IS WHY";
          card.text = r.correctText ? `The answer was ${r.correctText}.` : card.text;
          card.explain = explain;
          card.button = "DRIVE ON";
          card.pass = true;
        }
      }
      return;
    }
    const m = this.miss;
    if (!m) return;
    card.explain = [humaniseMisconception(m.misconception), m.feedback, m.hint ? `Hint: ${m.hint}` : ""]
      .filter(Boolean)
      .join("\n\n");
  }

  /**
   * Clear the way after a reveal, using the engine's own open-state fields,
   * and put the car back at the checkpoint the way the author's retry does.
   * `result` is deliberately left false, so the checkpoint dot stays pink:
   * they were shown the answer, they did not find it.
   */
  private openObstacle() {
    const ob = this.engine.obs[this.engine.state.oi];
    const c = this.engine.car;
    const s = this.engine.sim;
    if (!ob || !c || !s) return;
    ob.locked = false;
    ob.doorH = 0;
    ob.ang = 0;
    ob.spikeH = 0;
    ob.bumped = false;
    ob.hold = 0;
    ob.slipT = 0;
    ob.launched = false;
    // The author's unused plank: a board across the pit, so a jump that was
    // never made is still crossable on foot.
    ob.plank = true;
    c.x = ob.pad - 0.5;
    c.y = this.engine.groundAt(ob.pad) || 0;
    c.air = false;
    c.vx = 0;
    c.vy = 0;
    c.angle = 0;
    c.angVel = 0;
    c.s = 0;
    s.respawn = false;
    s.t = 0;
    s.ok = null;
  }

  private finish(outcome: "finished" | "quit") {
    if (this.finished) return;
    this.finished = true;
    if (this.ticker != null) window.clearInterval(this.ticker);
    this.ticker = null;
    const s = this.engine?.state;
    const hearts = s?.hearts ?? 3;
    this.host.onFinish({
      gameId: "force-rush",
      outcome,
      game: {
        durationSec: 0,
        distanceM: Math.max(0, Math.round(this.engine?.car?.x ?? 0)),
        topSpeedKph: Math.round(this.topSpeed * 3.6),
        checkpointsPassed: this.answered,
        checkpointsTotal: this.total,
        crashes: Math.max(0, 3 - hearts),
        score: 0,
        extras: { health: Math.max(0, hearts), wrongTurns: s?.wrongs ?? 0 },
      },
      // The host fills these in from the director's own tally.
      learning: { answered: 0, correct: 0, recoveriesFixed: 0 },
    });
  }
}
