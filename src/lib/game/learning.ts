"use client";

/**
 * LearningDirector — the single bridge between a real-time game and the
 * learning engine. Every game uses this one class, which is what makes the
 * "same validated question format" promise real rather than aspirational.
 *
 * Why a one-question lookahead and not a prefetched batch:
 * the server picks each question *from the outcomes so far*
 * (`pickNextQuestion` + `nextTargetDifficulty` in src/lib/services/play.ts)
 * and refuses an answer for anything that is not the open question. Pulling
 * ten questions up front would therefore either break the protocol or
 * freeze adaptivity for ten questions. Instead we fetch the next question
 * *while the student is still driving*, so by the time they reach a
 * checkpoint it is already in memory. No request ever happens inside a frame.
 */

import { api, ApiError } from "@/lib/api-client";
import type { AnswerResult, SessionView } from "@/lib/services/play";
import type { PublicQuestion } from "@/lib/types";
import type { CheckpointReward, GameQuestion } from "./types";

export type DirectorStatus =
  /** No question buffered and none requested yet. */
  | "idle"
  /** Fetching the next question in the background. */
  | "prefetching"
  /** A question is buffered and a checkpoint can be opened. */
  | "ready"
  /** A question is open and awaiting the student's answer. */
  | "open"
  /** The answer is being scored by the server. */
  | "scoring"
  /** The result is on screen (explanation / recovery offer). */
  | "settled"
  /** The session is finished; no more questions will come. */
  | "exhausted"
  /** The last fetch failed. Gameplay continues; we retry later. */
  | "error";

export interface SettledAnswer {
  question: GameQuestion;
  correct: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  /** The full worked explanation. */
  explanation: string;
  steps: string[];
  /** Why this specific wrong option is tempting — the misconception, named. */
  misconception?: { misconception: string; feedback: string };
  xpAwarded: number;
  mastery: AnswerResult["mastery"];
  achievements: AnswerResult["newAchievements"];
  /** True when a recovery question on the same concept can be requested. */
  canRecover: boolean;
  reward: CheckpointReward;
}

export interface DirectorCallbacks {
  onStatus?: (status: DirectorStatus) => void;
  /** Session totals changed (xp, streak) — the HUD mirrors these. */
  onSession?: (session: SessionView["session"]) => void;
  /** The quest ran out of questions; the game should head for the finish line. */
  onExhausted?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * Minimum gameplay time between two teaching moments.
 *
 * This started at 18s to avoid "repetitive interruptions". That was the wrong
 * reading: students reported playing for a minute without being asked
 * anything and not knowing what they were supposed to be learning. For a
 * LEARNING app the failure mode is too few questions, not too many — 7
 * seconds is enough to re-engage with the game and still get through ten
 * questions in a few minutes.
 */
const MIN_CHECKPOINT_GAP_MS = 7_000;

export class LearningDirector {
  private buffered: GameQuestion | null = null;
  private inflight: Promise<void> | null = null;
  private status: DirectorStatus = "idle";
  private lastSettledAt = 0;
  private openQuestion: GameQuestion | null = null;
  private failures = 0;

  /** Counters for the run summary. Kept separate from any game score. */
  readonly tally = { answered: 0, correct: 0, recoveriesFixed: 0, hintsUsed: 0 };

  constructor(
    private readonly sessionId: string,
    private readonly questId: string,
    private session: SessionView["session"],
    private readonly cb: DirectorCallbacks = {},
  ) {}

  get currentStatus() {
    return this.status;
  }

  get sessionState() {
    return this.session;
  }

  /** How many main questions the session still expects. */
  get remaining() {
    return Math.max(0, this.session.playLength - this.session.answered);
  }

  /**
   * True when a checkpoint may be opened: a question is in hand and enough
   * gameplay has happened since the last one.
   */
  canAskNow(nowMs: number): boolean {
    if (this.status !== "ready" || !this.buffered) return false;
    // A game where answering IS the move has no "gameplay" to return to, so
    // a cooling-off gap just leaves the student staring at an empty screen.
    if (this.noGap) return true;
    return nowMs - this.lastSettledAt >= MIN_CHECKPOINT_GAP_MS;
  }

  /** Set by the host for answer-as-action games: ask again immediately. */
  noGap = false;

  /** Seed the first question before the race starts, from the server-rendered view. */
  seed(current: PublicQuestion | null, reason?: string) {
    if (!current) return;
    this.buffered = toGameQuestion(current, { isRecovery: false, reason });
    this.setStatus("ready");
  }

  /**
   * Fetch the next question in the background. Safe to call every few
   * seconds from gameplay: it de-duplicates in-flight requests and returns
   * immediately when a question is already buffered.
   */
  prefetch(): Promise<void> {
    if (this.buffered || this.inflight || this.status === "exhausted" || this.status === "open" || this.status === "scoring") {
      return this.inflight ?? Promise.resolve();
    }
    this.setStatus("prefetching");
    this.inflight = (async () => {
      try {
        const v = await api<SessionView & { completed: boolean }>(`/api/sessions/${this.sessionId}/next`, { method: "POST" });
        this.session = v.session;
        this.cb.onSession?.(v.session);
        if (v.completed || !v.current) {
          this.setStatus("exhausted");
          this.cb.onExhausted?.();
          return;
        }
        this.buffered = toGameQuestion(v.current, {
          isRecovery: v.currentIsFollowUp,
          reason: v.session.lastAdaptation?.reason,
        });
        this.failures = 0;
        this.setStatus("ready");
      } catch (e) {
        this.failures++;
        const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't load the next question.", 0, true);
        // A failed prefetch must never interrupt play. The game keeps driving
        // and simply gets no checkpoint until a later attempt succeeds.
        this.setStatus("error");
        this.cb.onError?.(err);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Hand the buffered question to the host and mark the checkpoint open. */
  open(): GameQuestion | null {
    if (!this.buffered) return null;
    this.openQuestion = this.buffered;
    this.buffered = null;
    this.setStatus("open");
    return this.openQuestion;
  }

  /** Reveal the stored hint. Costs XP server-side; never changes the key. */
  async hint(): Promise<string> {
    if (!this.openQuestion) throw new ApiError("NO_QUESTION", "No question is open.", 409, false);
    const r = await api<{ hint: string }>(`/api/quests/${this.questId}/hint`, {
      method: "POST",
      json: { sessionId: this.sessionId, questionId: this.openQuestion.id },
    });
    this.tally.hintsUsed++;
    return r.hint;
  }

  /**
   * Submit the student's choice. The server scores against the stored key —
   * the game is never told the answer beforehand.
   */
  async answer(selectedOptionId: string, offered: CheckpointReward): Promise<SettledAnswer> {
    const q = this.openQuestion;
    if (!q) throw new ApiError("NO_QUESTION", "No question is open.", 409, false);
    this.setStatus("scoring");
    try {
      const r = await api<AnswerResult>(`/api/quests/${this.questId}/answer`, {
        method: "POST",
        json: { sessionId: this.sessionId, questionId: q.id, selectedOptionId },
      });
      this.session = r.session;
      this.cb.onSession?.(r.session);

      this.tally.answered++;
      if (r.isCorrect) this.tally.correct++;
      if (r.isCorrect && q.isRecovery) this.tally.recoveriesFixed++;

      this.lastSettledAt = perfNow();
      this.setStatus("settled");

      return {
        question: q,
        correct: r.isCorrect,
        selectedOptionId: r.selectedOptionId,
        correctOptionId: r.correctOptionId,
        explanation: r.explanation,
        steps: r.steps,
        misconception: r.selectedFeedback,
        xpAwarded: r.xpAwarded,
        mastery: r.mastery,
        achievements: r.newAchievements,
        // A recovery is offered only for a first miss, never for a missed
        // recovery — that would trap a struggling student in a loop.
        canRecover: !r.isCorrect && !r.isFollowUp,
        reward: r.isCorrect ? offered : { kind: "none" },
      };
    } catch (e) {
      this.setStatus("open");
      throw e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't check your answer.", 0, true);
    }
  }

  /**
   * Ask for a second chance on the concept just missed: a new question, same
   * concept, new numbers/context, at an equal-or-easier difficulty. Buffers
   * it so the game can present it at the *next* safe moment rather than
   * immediately, which keeps the pacing of a race intact.
   */
  async requestRecovery(conceptId: string, questionId: string): Promise<GameQuestion> {
    const r = await api<{ question: PublicQuestion; difficulty: string; reason: string; note?: string }>(
      `/api/concepts/${encodeURIComponent(conceptId)}/follow-up`,
      { method: "POST", json: { sessionId: this.sessionId, questionId } },
    );
    const q = toGameQuestion(r.question, { isRecovery: true, reason: r.reason });
    this.buffered = q;
    this.setStatus("ready");
    return q;
  }

  /**
   * Close the checkpoint without a recovery. Resets the gap timer so the
   * student gets real gameplay before the next question.
   */
  close() {
    this.openQuestion = null;
    this.lastSettledAt = perfNow();
    if (this.status !== "exhausted") this.setStatus(this.buffered ? "ready" : "idle");
    // Warm the next question during the drive back up to speed.
    if (!this.buffered && this.status !== "exhausted") void this.prefetch();
  }

  /** Exponential backoff so a persistent outage does not hammer the API. */
  retryDelayMs(): number {
    return Math.min(30_000, 2000 * 2 ** Math.max(0, this.failures - 1));
  }

  private setStatus(s: DirectorStatus) {
    if (this.status === s) return;
    this.status = s;
    this.cb.onStatus?.(s);
  }
}

/** Narrow a server question into the flat view a game HUD renders. */
export function toGameQuestion(q: PublicQuestion, extra: { isRecovery: boolean; reason?: string }): GameQuestion {
  return {
    id: q.id,
    conceptId: q.conceptId,
    conceptTitle: q.conceptTitle,
    text: q.text,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    difficulty: q.difficulty,
    origin: q.origin,
    hasHint: q.hasHint,
    visual: q.visual,
    isRecovery: extra.isRecovery,
    reason: extra.reason,
  };
}

function perfNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
