/**
 * `ScenePlayer` — the state machine behind a narrated scene.
 *
 * Framework-agnostic and DOM-free on purpose: no React, no `window`, no
 * timers of its own. The host drives it with `tick(nowMs)` from a
 * `requestAnimationFrame` loop, and a test drives it with a plain number, so
 * cue advance, checkpoint pausing, seeking and branching are all testable
 * without a browser.
 *
 * ### How cue timing works
 *
 * Each cue has a duration in *media* milliseconds:
 *
 *  - **With audio**: the real `AudioBuffer.duration` reported by the audio
 *    sink (`ScenePlayerAudio.durationOf`), converted to ms. Nothing is ever
 *    estimated when a decoded clip exists — the visual advances on a true
 *    clip boundary, which is the whole reason narration is generated one
 *    clip per cue (`docs/audio-and-video-lessons.md:120`).
 *  - **Without audio**: the authored `readMs`.
 *
 * `tick` advances media time by `wallDelta × rate`, so a 1.5× speed setting
 * finishes a 6 s clip in 4 s of wall time and the caption changes with it.
 *
 * ### Who decides to keep going
 *
 * When a cue's time is up the player either advances (auto) or parks in
 * `"waiting"` until the host calls `next()`. Audio-driven cues always
 * auto-advance — stopping between clips would sound broken. Silent cues
 * auto-advance only when `autoAdvanceWithoutAudio` is on, and that flag is
 * forced **off** under `prefers-reduced-motion`, so a reduced-motion student
 * never has content move under them without a press.
 *
 * ### No audio without a gesture
 *
 * `audioAllowed` starts `false`. Until the host flips it (after `unlock()`
 * resolves from a real user gesture), the sink is never asked to play, so the
 * player cannot be the thing that trips an autoplay policy. The lesson is
 * fully functional in that state: captions, visuals, transport.
 */
import {
  branchTarget,
  cueIndex,
  nextCueIndex,
  sceneTimeline,
  timelineSeek,
  type Timeline,
} from "./scene";
import {
  hasPlayableAudio,
  isCheckpointCue,
  type CheckpointCue,
  type CheckpointSettlement,
  type NarratedScene,
  type SceneCue,
} from "./types";

/* ------------------------------------------------------------------ */
/* The audio seam                                                      */
/* ------------------------------------------------------------------ */

/**
 * Everything the player needs from an audio engine, and nothing more.
 *
 * Implemented for real by `createWebAudioSceneAudio()` (`audio-sink.ts`) and
 * by `createSilentSceneAudio()` for the caption-only path. Every method must
 * be guarded and must never throw: a broken clip is a quiet lesson, never a
 * broken one.
 */
export interface ScenePlayerAudio {
  /**
   * Decoded clip length in **seconds**, or `null` when there is no buffer for
   * this cue yet. Must be synchronous — the player asks it inside a frame.
   */
  durationOf(cueId: string): number | null;
  /** Start (or restart) a cue's clip. `offsetMs` supports mid-cue seeking. */
  play(cueId: string, opts: { rate: number; offsetMs: number }): void;
  /** Stop immediately. Called on pause, seek, checkpoint and dispose. */
  stop(): void;
  /** Playback rate changed while a clip is running. */
  setRate(rate: number): void;
  /** Optional: begin fetching/decoding the clips the player will want next. */
  preload?(cueIds: string[]): void;
}

/** The caption-only sink. Also the default, so audio is strictly opt-in. */
export function createSilentSceneAudio(): ScenePlayerAudio {
  return {
    durationOf: () => null,
    play: () => {},
    stop: () => {},
    setRate: () => {},
  };
}

/* ------------------------------------------------------------------ */
/* Public state                                                        */
/* ------------------------------------------------------------------ */

export type ScenePlayerStatus =
  /** Nothing has started. Audio has never been touched. */
  | "idle"
  /** Media time is advancing. */
  | "playing"
  /** The student paused, or the host did. */
  | "paused"
  /** The cue is finished and will not advance until `next()`. */
  | "waiting"
  /** A checkpoint is open. Playback is stopped dead until it settles. */
  | "checkpoint"
  /** The scene reached a terminal cue. */
  | "ended";

export interface CheckpointRecord {
  cueId: string;
  questionId: string;
  outcome: "correct" | "wrong" | "skipped";
}

export interface ScenePlayerSnapshot {
  status: ScenePlayerStatus;
  cueIndex: number;
  cue: SceneCue;
  /** The caption for the current cue. Always present, never a toggle. */
  caption: string;
  elapsedInCueMs: number;
  cueDurationMs: number;
  /** 0..1 inside the current cue. */
  cueProgress: number;
  /** Position on the scrub bar, ms. */
  timelineMs: number;
  timelineTotalMs: number;
  rate: number;
  /** This cue claims a playable clip (`audio.status === "ready"`). */
  hasAudio: boolean;
  /** A clip is carrying this cue: it exists and audio has been unlocked. */
  audioDriven: boolean;
  /** This cue will advance on its own when its time is up. */
  autoAdvance: boolean;
  autoAdvanceWithoutAudio: boolean;
  reducedMotion: boolean;
  audioAllowed: boolean;
  /** The open checkpoint, or null. */
  checkpoint: CheckpointCue | null;
  /** How each checkpoint settled, in the order they were answered. */
  answers: readonly CheckpointRecord[];
  canNext: boolean;
  canPrevious: boolean;
  /** Cue ids visited this run, for the chapter list's progress ticks. */
  visited: readonly string[];
}

export type ScenePlayerEvent =
  /** Any observable state changed. The React layer only needs this one. */
  | { type: "snapshot"; snapshot: ScenePlayerSnapshot }
  | { type: "cueenter"; cue: SceneCue; index: number; reason: CueChangeReason }
  | { type: "checkpoint"; cue: CheckpointCue }
  | { type: "branch"; from: string; to: string; outcome: CheckpointRecord["outcome"] }
  | { type: "ended" };

export type CueChangeReason = "start" | "auto" | "next" | "previous" | "seek" | "branch";

export interface ScenePlayerOptions {
  audio?: ScenePlayerAudio | null;
  /**
   * Whether a silent cue advances on its own when `readMs` elapses.
   * Defaults to `true` so `play()` behaves like a player. Forced off by
   * `reducedMotion`. `docs/audio-and-video-lessons.md:617` prefers Next-only
   * for silent scenes; pass `false` to get exactly that.
   */
  autoAdvanceWithoutAudio?: boolean;
  /** `prefers-reduced-motion`. Disables silent auto-advance. */
  reducedMotion?: boolean;
  rate?: number;
  /** Flip to true only after a user gesture has unlocked output. */
  audioAllowed?: boolean;
  /** Start somewhere other than the first cue (e.g. a chapter deep link). */
  startCueId?: string;
}

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;
/** Frame deltas are clamped: a backgrounded tab must not skip five cues. */
const MAX_TICK_MS = 250;
/** `previous()` restarts the current cue if you are already this far into it. */
const RESTART_THRESHOLD_MS = 1500;

function clampRate(r: number): number {
  if (!Number.isFinite(r)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, r));
}

/* ------------------------------------------------------------------ */
/* The player                                                          */
/* ------------------------------------------------------------------ */

export class ScenePlayer {
  readonly scene: NarratedScene;

  private audio: ScenePlayerAudio;
  private status: ScenePlayerStatus = "idle";
  private index = 0;
  private elapsed = 0;
  private rate: number;
  private autoSilent: boolean;
  private reduced: boolean;
  private allowAudio: boolean;
  private history: number[] = [];
  private visited: string[] = [];
  private answers: CheckpointRecord[] = [];
  private lastTick: number | null = null;
  private listeners = new Set<(e: ScenePlayerEvent) => void>();
  private cached: ScenePlayerSnapshot | null = null;
  private cachedTimeline: Timeline | null = null;
  private disposed = false;

  constructor(scene: NarratedScene, options: ScenePlayerOptions = {}) {
    this.scene = scene;
    this.audio = options.audio ?? createSilentSceneAudio();
    this.rate = clampRate(options.rate ?? 1);
    this.reduced = options.reducedMotion ?? false;
    this.autoSilent = (options.autoAdvanceWithoutAudio ?? true) && !this.reduced;
    this.allowAudio = options.audioAllowed ?? false;
    if (options.startCueId) {
      const i = cueIndex(scene, options.startCueId);
      if (i >= 0) this.index = i;
    }
    this.visited.push(this.cue().id);
    if (isCheckpointCue(this.cue())) this.status = "checkpoint";
  }

  /* ---------------- reads ---------------- */

  /** Stable between changes, so `useSyncExternalStore` will not spin. */
  getSnapshot(): ScenePlayerSnapshot {
    if (this.cached) return this.cached;
    const cue = this.cue();
    const duration = this.cueDurationMs(this.index);
    const timeline = this.timeline();
    const entry = timeline.entries.find((e) => e.index === this.index);
    const audioDriven = this.isAudioDriven(this.index);
    this.cached = {
      status: this.status,
      cueIndex: this.index,
      cue,
      caption: cue.text,
      elapsedInCueMs: this.elapsed,
      cueDurationMs: duration,
      cueProgress: duration > 0 ? Math.min(1, this.elapsed / duration) : 1,
      timelineMs: (entry?.startMs ?? 0) + (entry ? Math.min(this.elapsed, entry.durationMs) : 0),
      timelineTotalMs: timeline.totalMs,
      rate: this.rate,
      hasAudio: this.hasClip(this.index),
      audioDriven,
      autoAdvance: this.autoAdvances(this.index),
      autoAdvanceWithoutAudio: this.autoSilent,
      reducedMotion: this.reduced,
      audioAllowed: this.allowAudio,
      checkpoint: this.status === "checkpoint" && isCheckpointCue(cue) ? cue : null,
      answers: this.answers,
      canNext: this.status !== "checkpoint" && nextCueIndex(this.scene, this.index) !== null,
      canPrevious: this.history.length > 0 || this.elapsed > RESTART_THRESHOLD_MS,
      visited: this.visited,
    };
    return this.cached;
  }

  cue(): SceneCue {
    return this.scene.cues[this.index];
  }

  /**
   * The scrub bar's coordinate space, using live clip durations.
   *
   * Memoised, because `getSnapshot()` runs every frame. Clip durations only
   * change when a clip finishes decoding, which the host announces with
   * {@link invalidateTimeline}.
   */
  timeline(): Timeline {
    if (!this.cachedTimeline) this.cachedTimeline = sceneTimeline(this.scene, (cue) => this.durationOfCue(cue));
    return this.cachedTimeline;
  }

  /**
   * Call when clip durations may have changed — a clip just decoded, or the
   * manifest arrived. Cheap; recomputes the timeline on the next read.
   */
  invalidateTimeline(): void {
    this.cachedTimeline = null;
    this.changed();
  }

  subscribe(listener: (e: ScenePlayerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* ---------------- transport ---------------- */

  /**
   * Start or resume. Must be called from a user gesture if audio is wanted —
   * the player itself never starts playback on construction.
   */
  play(): void {
    if (this.disposed) return;
    if (this.status === "checkpoint" || this.status === "playing") return;
    if (this.status === "ended") {
      this.restart();
      // A scene whose first cue is a checkpoint opens straight into it.
      if (isCheckpointCue(this.cue())) return;
    } else if (this.status === "waiting" && this.elapsed >= this.cueDurationMs(this.index)) {
      // Nothing left in this cue; "play" from a finished cue means "continue".
      this.next();
      return;
    }
    this.status = "playing";
    this.lastTick = null;
    this.startAudioForCurrentCue();
    this.preloadAhead();
    this.changed();
  }

  pause(): void {
    if (this.disposed || this.status !== "playing") return;
    this.status = "paused";
    this.lastTick = null;
    this.audio.stop();
    this.changed();
  }

  toggle(): void {
    if (this.status === "playing") this.pause();
    else this.play();
  }

  /** Back to the first cue, stopped. */
  restart(): void {
    this.audio.stop();
    this.history = [];
    this.answers = [];
    this.visited = [];
    this.index = 0;
    this.elapsed = 0;
    this.lastTick = null;
    this.status = isCheckpointCue(this.cue()) ? "checkpoint" : "paused";
    this.visited.push(this.cue().id);
    this.emit({ type: "cueenter", cue: this.cue(), index: this.index, reason: "start" });
    this.changed();
  }

  /**
   * Advance one cue. Refused while a checkpoint is open: the question is the
   * priority and skipping it is `skipCheckpoint()`, which is explicit.
   */
  next(): void {
    if (this.disposed || this.status === "checkpoint") return;
    const target = nextCueIndex(this.scene, this.index);
    if (target === null) {
      this.finish();
      return;
    }
    this.history.push(this.index);
    this.enterCue(target, "next", this.status === "playing" || this.status === "waiting");
  }

  /**
   * Back one step. Within the first {@link RESTART_THRESHOLD_MS} of a cue it
   * goes to the previous cue; after that it restarts the current one, which is
   * what every media player does and what "I missed that" means.
   *
   * History is a stack, not `index - 1`, so stepping back out of a remedial
   * branch returns you to the checkpoint you came through.
   */
  previous(): void {
    if (this.disposed) return;
    const wasPlaying = this.status === "playing" || this.status === "waiting";
    if (this.status !== "checkpoint" && this.elapsed > RESTART_THRESHOLD_MS) {
      this.enterCue(this.index, "previous", wasPlaying);
      return;
    }
    const target = this.history.pop();
    if (target === undefined) {
      this.enterCue(this.index, "previous", wasPlaying);
      return;
    }
    this.enterCue(target, "previous", wasPlaying);
  }

  /** Jump to a cue by id or index — chapter list, transcript click, scrub. */
  seekToCue(target: string | number, offsetMs = 0): void {
    if (this.disposed) return;
    const i = typeof target === "number" ? target : cueIndex(this.scene, target);
    if (i < 0 || i >= this.scene.cues.length) return;
    const wasPlaying = this.status === "playing" || this.status === "waiting";
    if (i !== this.index) this.history.push(this.index);
    this.enterCue(i, "seek", wasPlaying, offsetMs);
  }

  /** Scrub to an absolute position on the timeline, in ms. */
  seekToTime(ms: number): void {
    const hit = timelineSeek(this.timeline(), ms);
    if (!hit) return;
    this.seekToCue(hit.index, hit.offsetMs);
  }

  /** Scrub by fraction (0..1) of the whole scene. */
  scrub(progress: number): void {
    const total = this.timeline().totalMs;
    this.seekToTime(Math.max(0, Math.min(1, progress)) * total);
  }

  /* ---------------- settings ---------------- */

  setRate(rate: number): void {
    const next = clampRate(rate);
    if (next === this.rate) return;
    this.rate = next;
    this.audio.setRate(next);
    this.changed();
  }

  /** Call after `unlock()` resolves true, or with `false` on mute. */
  setAudioAllowed(allowed: boolean): void {
    if (allowed === this.allowAudio) return;
    this.allowAudio = allowed;
    this.cachedTimeline = null;
    if (!allowed) this.audio.stop();
    else if (this.status === "playing") this.startAudioForCurrentCue();
    this.changed();
  }

  setAutoAdvanceWithoutAudio(on: boolean): void {
    const next = on && !this.reduced;
    if (next === this.autoSilent) return;
    this.autoSilent = next;
    // A cue parked in "waiting" should start moving the moment the student
    // opts in, rather than needing one more press.
    if (this.autoSilent && this.status === "waiting") {
      this.status = "playing";
      this.lastTick = null;
    }
    this.changed();
  }

  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    if (reduced) this.autoSilent = false;
    this.changed();
  }

  /** Swap the audio sink (e.g. once the narration manifest has loaded). */
  setAudio(audio: ScenePlayerAudio | null): void {
    this.audio.stop();
    this.audio = audio ?? createSilentSceneAudio();
    this.cachedTimeline = null;
    if (this.status === "playing") this.startAudioForCurrentCue();
    this.changed();
  }

  /* ---------------- checkpoints ---------------- */

  /**
   * Resolve the open checkpoint with a **server-settled** result and follow
   * the matching branch. The player never inspects an answer key; it only
   * reads `settlement.correct`.
   */
  resolveCheckpoint(settlement: CheckpointSettlement): void {
    if (this.disposed) return;
    const cue = this.cue();
    if (this.status !== "checkpoint" || !isCheckpointCue(cue)) return;
    this.applyBranch(cue, settlement.correct ? "correct" : "wrong");
  }

  /**
   * Continue past the open checkpoint without answering. Follows the
   * `correct` branch — i.e. the main path — because a skip must not drop the
   * student into remedial material they did not earn.
   */
  skipCheckpoint(): void {
    if (this.disposed) return;
    const cue = this.cue();
    if (this.status !== "checkpoint" || !isCheckpointCue(cue)) return;
    this.applyBranch(cue, "skipped");
  }

  private applyBranch(cue: CheckpointCue, outcome: CheckpointRecord["outcome"]): void {
    const correctPath = outcome !== "wrong";
    const target = branchTarget(this.scene, this.index, correctPath);
    this.answers = [...this.answers, { cueId: cue.id, questionId: cue.prompt.questionId, outcome }];
    if (target === null) {
      // A validated scene cannot reach here (`validateScene` rejects a missing
      // branch target), but a hand-edited one could: end rather than hang.
      this.finish();
      return;
    }
    this.history.push(this.index);
    this.emit({ type: "branch", from: cue.id, to: this.scene.cues[target].id, outcome });
    this.enterCue(target, "branch", true);
  }

  /* ---------------- the clock ---------------- */

  /**
   * Advance media time. Call once per animation frame with a monotonic ms
   * clock (`performance.now()`), or with any increasing number in a test.
   */
  tick(nowMs: number): void {
    if (this.disposed || this.status !== "playing") {
      this.lastTick = null;
      return;
    }
    if (this.lastTick === null) {
      this.lastTick = nowMs;
      return;
    }
    const delta = Math.min(Math.max(0, nowMs - this.lastTick), MAX_TICK_MS);
    this.lastTick = nowMs;
    if (delta === 0) return;
    this.elapsed += delta * this.rate;

    // Loop, because one long frame can span a short cue entirely.
    let guard = 0;
    while (this.status === "playing" && guard++ < 64) {
      const duration = this.cueDurationMs(this.index);
      if (this.elapsed < duration) break;
      if (!this.autoAdvances(this.index)) {
        this.elapsed = duration;
        this.status = "waiting";
        break;
      }
      const carry = this.elapsed - duration;
      const target = nextCueIndex(this.scene, this.index);
      if (target === null) {
        this.finish();
        return;
      }
      this.history.push(this.index);
      this.enterCue(target, "auto", true, carry);
    }
    this.changed();
  }

  dispose(): void {
    this.disposed = true;
    this.audio.stop();
    this.listeners.clear();
    this.cached = null;
  }

  /* ---------------- internals ---------------- */

  private enterCue(index: number, reason: CueChangeReason, resumePlaying: boolean, offsetMs = 0): void {
    this.audio.stop();
    this.index = index;
    const cue = this.cue();
    this.elapsed = Math.max(0, Math.min(offsetMs, this.cueDurationMs(index)));
    if (!this.visited.includes(cue.id)) this.visited.push(cue.id);
    this.lastTick = null;

    if (isCheckpointCue(cue)) {
      // A checkpoint stops playback dead. Narration is cut mid-word if need
      // be — the caption stays on screen, so nothing is lost.
      this.status = "checkpoint";
      this.emit({ type: "cueenter", cue, index, reason });
      this.emit({ type: "checkpoint", cue });
      this.changed();
      return;
    }

    this.status = resumePlaying ? "playing" : this.status === "idle" ? "idle" : "paused";
    if (this.status === "playing") this.startAudioForCurrentCue();
    this.preloadAhead();
    this.emit({ type: "cueenter", cue, index, reason });
    this.changed();
  }

  private finish(): void {
    this.audio.stop();
    this.status = "ended";
    this.elapsed = this.cueDurationMs(this.index);
    this.lastTick = null;
    this.emit({ type: "ended" });
    this.changed();
  }

  private startAudioForCurrentCue(): void {
    if (!this.isAudioDriven(this.index)) return;
    this.audio.play(this.cue().id, { rate: this.rate, offsetMs: this.elapsed });
  }

  private preloadAhead(): void {
    if (!this.audio.preload) return;
    const ids: string[] = [this.cue().id];
    let at: number | null = this.index;
    for (let i = 0; i < 3 && at !== null; i++) {
      at = nextCueIndex(this.scene, at);
      if (at !== null) ids.push(this.scene.cues[at].id);
    }
    if (ids.length) this.audio.preload(ids);
  }

  /** This cue claims a clip worth playing (regardless of permission). */
  private hasClip(index: number): boolean {
    const cue = this.scene.cues[index];
    return !!cue && hasPlayableAudio(cue);
  }

  /**
   * A clip will actually carry this cue. Note this is true *before* the
   * buffer has decoded: `play()` then kicks off the fetch and returns, the
   * cue is paced by the manifest hint or `readMs` meanwhile, and the clip is
   * dropped rather than awaited. Audio never delays the lesson.
   */
  private isAudioDriven(index: number): boolean {
    return this.allowAudio && this.hasClip(index);
  }

  /**
   * Media duration of one cue, in ms.
   *
   * When a clip is actually driving the cue, the live `AudioBuffer.duration`
   * wins, then the manifest's `durationMs` hint (the clip has not decoded
   * yet — it is dropped, not awaited), so the visual advances on the true
   * clip boundary. When audio is not driving this cue — muted, blocked, or
   * no clip at all — the cue is paced by the authored `readMs`, because that
   * is a reading time and a clip length is not.
   */
  private durationOfCue(cue: SceneCue): number {
    if (isCheckpointCue(cue)) return 0;
    if (this.allowAudio && hasPlayableAudio(cue)) {
      const seconds = this.audio.durationOf(cue.id);
      if (seconds !== null && Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
      if (cue.audio?.durationMs) return cue.audio.durationMs;
    }
    return cue.readMs;
  }

  private cueDurationMs(index: number): number {
    const cue = this.scene.cues[index];
    return cue ? this.durationOfCue(cue) : 0;
  }

  private autoAdvances(index: number): boolean {
    const cue = this.scene.cues[index];
    if (!cue || isCheckpointCue(cue)) return false;
    // A running clip must not be followed by silence waiting for a press.
    return this.isAudioDriven(index) ? true : this.autoSilent;
  }

  private changed(): void {
    this.cached = null;
    this.emit({ type: "snapshot", snapshot: this.getSnapshot() });
  }

  private emit(event: ScenePlayerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* a broken subscriber must not break playback */
      }
    }
  }
}
