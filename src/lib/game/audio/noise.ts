"use client";

/**
 * Noise sources. Noise is the backbone of nearly every sound here (tyres,
 * exhaust roughness, wind, impacts), so the buffers are generated once per
 * AudioContext and shared: allocating a 2 s Float32Array inside a 60 fps loop
 * would cost ~350 KB and a GC pause per call.
 */
import { getRuntime } from "./context";
import { mulberry32 } from "./util";

export type NoiseKind = "white" | "pink" | "brown";

/** Long enough that looping is not perceptible, short enough to stay cheap. */
const DEFAULT_SECONDS = 2;

/** Normalise to a predictable peak so downstream gains mean the same thing. */
const TARGET_PEAK = 0.8;

export function fillWhite(out: Float32Array, rand: () => number = Math.random): Float32Array {
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1;
  return out;
}

/**
 * Pink noise (-3 dB/octave) via **Paul Kellett's refined "economy" method**: a
 * cascade of seven one-pole low-pass filters summed with hand-tuned
 * coefficients, accurate to about ±0.05 dB from 10 Hz to 20 kHz. Chosen over
 * Voss-McCartney because it is a straight-line IIR (no octave counters, no
 * branch per sample), which keeps generation fast even for long buffers.
 */
export function fillPink(out: Float32Array, rand: () => number = Math.random): Float32Array {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return normalize(out);
}

/**
 * Brown / red noise (-6 dB/octave): a leaky integrator over white noise. The
 * leak (0.998) keeps the random walk from drifting into DC offset, which would
 * otherwise eat headroom and thump on loop points.
 */
export function fillBrown(out: Float32Array, rand: () => number = Math.random): Float32Array {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    last = 0.998 * last + (rand() * 2 - 1) * 0.04;
    out[i] = last;
  }
  return normalize(out);
}

/** Peak-normalise in place; also removes the DC the integrators accumulate. */
export function normalize(out: Float32Array, peak = TARGET_PEAK): Float32Array {
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i];
  mean /= out.length || 1;
  let max = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    const a = Math.abs(out[i]);
    if (a > max) max = a;
  }
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

const FILLERS: Record<NoiseKind, (out: Float32Array, rand?: () => number) => Float32Array> = {
  white: fillWhite,
  pink: fillPink,
  brown: fillBrown,
};

/** One cache per context, so `dispose()` + a new context cannot reuse stale buffers. */
const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

export function getNoiseBuffer(kind: NoiseKind, seconds = DEFAULT_SECONDS): AudioBuffer | null {
  const rt = getRuntime();
  if (!rt) return null;
  const { ctx } = rt;
  let perCtx = cache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    cache.set(ctx, perCtx);
  }
  const key = `${kind}:${seconds}`;
  const hit = perCtx.get(key);
  if (hit) return hit;
  try {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    // Mono: stereo noise doubles memory for an effect we get more cheaply by
    // panning or by detuning two players of the same buffer.
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    FILLERS[kind](buffer.getChannelData(0));
    perCtx.set(key, buffer);
    return buffer;
  } catch {
    return null;
  }
}

/**
 * A looping noise player. Created once and kept (see EngineSound / sustained
 * SFX); `playbackRate` is the cheap way to shift noise character without
 * generating a second buffer.
 */
export function createNoiseSource(kind: NoiseKind, seconds?: number): AudioBufferSourceNode | null {
  const rt = getRuntime();
  const buffer = getNoiseBuffer(kind, seconds);
  if (!rt || !buffer) return null;
  try {
    const src = rt.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  } catch {
    return null;
  }
}

/** Deterministic buffers for tests/benchmarks. */
export function generateNoise(kind: NoiseKind, length: number, seed = 1): Float32Array {
  return FILLERS[kind](new Float32Array(length), mulberry32(seed));
}

/** Test seam: how many buffers a context has cached. */
export function __noiseCacheSize(ctx: BaseAudioContext): number {
  return cache.get(ctx)?.size ?? 0;
}
