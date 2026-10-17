"use client";

/**
 * A `ScenePlayerAudio` backed by Web Audio.
 *
 * The signal chain is the one `docs/audio-and-video-lessons.md:351` specifies:
 *
 * ```
 * AudioBufferSourceNode → GainNode (20 ms in / 40 ms out) → destination
 * ```
 *
 * The short fades are not a stylistic choice: a generated WAV starts and ends
 * on a non-zero sample, and starting a buffer cold produces an audible click
 * on every cue.
 *
 * **Nothing here reaches into `src/lib/game/audio/`.** The context and the
 * destination node are injected, so this file compiles today — before the
 * `voice` bus exists — and the lead wires it with one call:
 *
 * ```ts
 * import { getRuntime, getBus } from "@/lib/game/audio";
 * const rt = getRuntime();
 * const sink = rt && createWebAudioSceneAudio({
 *   ctx: rt.ctx,
 *   destination: getBus("voice")!,   // after "voice" is added to BusName
 *   clipUrl: (cueId) => manifestUrlFor(cueId),
 *   ducker,                          // see ducking.ts
 * });
 * ```
 *
 * Exactly one narration voice exists at a time, matching the `answer: 1` /
 * `nitro: 1` caps in `sfx.ts`: a second `play()` cross-fades the first out
 * over 80 ms rather than stacking two voices.
 */
import type { NarrationDucker } from "./ducking";
import type { ScenePlayerAudio } from "./player";

const FADE_IN = 0.02;
const FADE_OUT = 0.04;
const CROSSFADE = 0.08;

export interface WebAudioSceneAudioOptions {
  ctx: BaseAudioContext;
  /** Where the voice goes — the `voice` bus once it exists. */
  destination: AudioNode;
  /** Resolve a cue id to a clip URL. Return null for "this cue is silent". */
  clipUrl: (cueId: string) => string | null;
  /** Ducks the gameplay buses while a clip runs. Optional. */
  ducker?: NarrationDucker | null;
  /** Injected for tests; defaults to `fetch`. */
  fetchImpl?: typeof fetch;
  /** Called when a clip finishes decoding, so the host can refresh timings. */
  onDecoded?: (cueId: string, durationSeconds: number) => void;
}

/**
 * Creates the sink. Every method is guarded and never throws: a clip that
 * fails to fetch or decode leaves the cue caption-only, which is the normal
 * degraded state and has no error UI.
 */
export function createWebAudioSceneAudio(options: WebAudioSceneAudioOptions): ScenePlayerAudio {
  const { ctx, destination, clipUrl, ducker = null, onDecoded } = options;
  const doFetch = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  const buffers = new Map<string, AudioBuffer>();
  const inflight = new Map<string, Promise<void>>();
  /** Cues that failed; never retried in this session, never surfaced. */
  const failed = new Set<string>();

  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;

  function decode(cueId: string): Promise<void> {
    const existing = inflight.get(cueId);
    if (existing) return existing;
    if (buffers.has(cueId) || failed.has(cueId)) return Promise.resolve();
    const url = clipUrl(cueId);
    if (!url) {
      failed.add(cueId);
      return Promise.resolve();
    }
    const job = (async () => {
      try {
        const res = await doFetch(url);
        if (!res.ok) {
          // 404 (blob missing) is treated exactly like `unavailable`.
          failed.add(cueId);
          return;
        }
        const bytes = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        buffers.set(cueId, buffer);
        onDecoded?.(cueId, buffer.duration);
      } catch {
        failed.add(cueId);
      } finally {
        inflight.delete(cueId);
      }
    })();
    inflight.set(cueId, job);
    return job;
  }

  function fadeOutAndStop(seconds: number): void {
    const s = source;
    const g = gain;
    source = null;
    gain = null;
    if (!s || !g) return;
    const now = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + seconds);
      s.stop(now + seconds + 0.01);
    } catch {
      /* already stopped */
    }
    try {
      s.onended = null;
    } catch {
      /* ignore */
    }
  }

  return {
    durationOf(cueId) {
      const buffer = buffers.get(cueId);
      return buffer ? buffer.duration : null;
    },

    play(cueId, { rate, offsetMs }) {
      const buffer = buffers.get(cueId);
      if (!buffer) {
        // Not decoded yet: the clip is dropped, not awaited. Audio never
        // delays the lesson — the caption is already on screen.
        void decode(cueId);
        return;
      }
      fadeOutAndStop(source ? CROSSFADE : FADE_OUT);
      try {
        const s = ctx.createBufferSource();
        const g = ctx.createGain();
        s.buffer = buffer;
        s.playbackRate.value = rate;
        s.connect(g);
        g.connect(destination);
        const now = ctx.currentTime;
        const offset = Math.max(0, Math.min(offsetMs / 1000, buffer.duration - 0.01));
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(1, now + FADE_IN);
        s.start(now, offset);
        source = s;
        gain = g;
        ducker?.engage();
        s.onended = () => {
          if (source === s) {
            source = null;
            gain = null;
            ducker?.release();
          }
        };
      } catch {
        source = null;
        gain = null;
      }
    },

    stop() {
      fadeOutAndStop(FADE_OUT);
      ducker?.release();
    },

    setRate(rate) {
      try {
        if (source) source.playbackRate.value = rate;
      } catch {
        /* ignore */
      }
    },

    preload(cueIds) {
      for (const id of cueIds) void decode(id);
    },
  };
}
