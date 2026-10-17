/**
 * Small maths + AudioParam helpers shared by the whole audio engine.
 *
 * These are deliberately pure and dependency-free so the DSP maths can be
 * unit-tested without a DOM, and so the per-frame paths never allocate.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  // Guards NaN too: NaN fails both comparisons, so fall through to 0.
  return v > 1 ? 1 : v > 0 ? v : 0;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Geometric (log) interpolation. Pitch, filter cutoff and playback rate are all
 * perceived logarithmically, so a linear ramp between 300 Hz and 7 kHz spends
 * almost all of its travel in a range the ear hears as "bright". Always map
 * frequency-like quantities with this, never with `lerp`.
 */
export function expMap(t: number, a: number, b: number): number {
  return a * Math.pow(b / a, clamp01(t));
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Equal temperament, A4 = 440 Hz = MIDI 69. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Exponential approach toward `target` with time constant `tau` (seconds).
 * `setTargetAtTime` is the only smoothing primitive that is safe to call every
 * frame: it replaces the previous target instead of queueing a new ramp, so a
 * 60 fps caller cannot build up a timeline of fighting events.
 */
export function smoothParam(p: AudioParam, target: number, tau: number, now: number): void {
  p.setTargetAtTime(target, now, tau > 0.001 ? tau : 0.001);
}

/** Linear ramp, for deliberate gestures (fades, blips) rather than tracking. */
export function rampParam(p: AudioParam, target: number, seconds: number, now: number): void {
  // Anchor the ramp at the current value, otherwise it starts from whatever
  // value the last scheduled event left behind and jumps.
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(target, now + Math.max(seconds, 0.001));
}

/**
 * A fixed soft-clip curve for a WaveShaper, generated once. `tanh`-style
 * saturation is what gives a synthesised engine its "pressure": the harmonics
 * it folds back are the ones a bare oscillator stack is missing.
 */
export function softClipCurve(drive = 2.2, length = 1024) {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

/** Deterministic PRNG (mulberry32) so noise statistics are testable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
