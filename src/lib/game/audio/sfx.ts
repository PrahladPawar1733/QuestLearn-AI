"use client";

/**
 * Fully synthesised one-shots. No audio assets ship with the app, so every
 * sound here is built from oscillators and the cached noise buffers.
 *
 * Two rules shape the API:
 *  - Nothing throws. These are called from collision handlers and game loops.
 *  - Nothing unbounded. Every one-shot is voice-limited, so a pile-up of
 *    collisions in one frame cannot spawn fifty graphs or clip the master.
 */
import { getBus, getRuntime, isEnabled, type BusName } from "./context";
import { createNoiseSource, type NoiseKind } from "./noise";
import { clamp, clamp01, expMap, lerp, midiToFreq, rampParam, smoothParam } from "./util";

/** Max simultaneous instances per sound. Tuned by how often each can fire. */
const CAPS: Record<string, number> = {
  collision: 3,
  collectible: 5,
  checkpoint: 2,
  countdown: 1,
  raceStart: 1,
  nitro: 1,
  whoosh: 4,
  ropeAttach: 3,
  land: 3,
  answer: 1,
  levelUp: 1,
  ui: 4,
};

const DEFAULT_CAP = 3;

const active = new Map<string, number>();

function voiceCount(name: string): number {
  return active.get(name) ?? 0;
}

function claim(name: string, holdMs: number): boolean {
  const cap = CAPS[name] ?? DEFAULT_CAP;
  const n = voiceCount(name);
  if (n >= cap) return false;
  active.set(name, n + 1);
  // Released on a timer rather than `onended`: several of these sounds have no
  // single terminal node, and a timer cannot leak a slot if a node is GC'd.
  const release = () => active.set(name, Math.max(0, voiceCount(name) - 1));
  if (typeof setTimeout === "function") setTimeout(release, Math.max(holdMs, 1));
  else release();
  return true;
}

/**
 * Shared entry guard: resolves the bus, enforces the voice cap, and swallows
 * anything the graph throws. `holdMs` should match the sound's own length.
 */
function play(
  name: string,
  bus: BusName,
  holdMs: number,
  build: (ctx: AudioContext, dest: AudioNode, now: number) => void,
): void {
  if (!isEnabled()) return;
  const rt = getRuntime();
  if (!rt) return;
  const dest = getBus(bus);
  if (!dest) return;
  if (!claim(name, holdMs)) return;
  try {
    build(rt.ctx, dest, rt.ctx.currentTime);
  } catch {
    /* a failed sound must never reach the game loop */
  }
}

interface ToneSpec {
  type?: OscillatorType;
  /** Start frequency, and optional glide target. */
  f0: number;
  f1?: number;
  t0?: number;
  dur: number;
  peak: number;
  attack?: number;
  detune?: number;
  /** Optional low-pass to take the edge off; 0 = none. */
  lp?: number;
}

/** One enveloped oscillator, self-terminating. */
function tone(ctx: AudioContext, dest: AudioNode, now: number, s: ToneSpec): void {
  const t0 = now + (s.t0 ?? 0);
  const osc = ctx.createOscillator();
  osc.type = s.type ?? "triangle";
  osc.frequency.setValueAtTime(s.f0, t0);
  if (s.f1 !== undefined && s.f1 !== s.f0) {
    // Exponential: pitch glides are heard in ratios, and a linear sweep to a
    // low target sounds like it slows down at the end.
    osc.frequency.exponentialRampToValueAtTime(Math.max(s.f1, 1), t0 + s.dur);
  }
  if (s.detune) osc.detune.value = s.detune;
  const g = ctx.createGain();
  const a = s.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(s.peak, t0 + a);
  // Exponential decay to near-zero, never to 0 (illegal for exponential ramps).
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);
  if (s.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = s.lp;
    osc.connect(lp);
    lp.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + s.dur + 0.02);
}

interface BurstSpec {
  kind?: NoiseKind;
  filter?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  t0?: number;
  dur: number;
  peak: number;
  attack?: number;
}

/** One enveloped, filtered noise burst, self-terminating. */
function burst(ctx: AudioContext, dest: AudioNode, now: number, s: BurstSpec): void {
  const src = createNoiseSource(s.kind ?? "white");
  if (!src) return;
  const t0 = now + (s.t0 ?? 0);
  const f = ctx.createBiquadFilter();
  f.type = s.filter ?? "bandpass";
  f.frequency.setValueAtTime(s.f0, t0);
  if (s.f1 !== undefined && s.f1 !== s.f0) f.frequency.exponentialRampToValueAtTime(Math.max(s.f1, 20), t0 + s.dur);
  f.Q.value = s.q ?? 1;
  const g = ctx.createGain();
  const a = s.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(s.peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + s.dur + 0.02);
}

/* ------------------------------------------------------------------ *
 * Sustained sources (skid, wind): held while the state is true, so the
 * intensity setter is safe to call every frame — it only writes params.
 * ------------------------------------------------------------------ */

class SustainedNoise {
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private ctx: AudioContext | null = null;
  private lastGain = Number.NaN;
  private lastFreq = Number.NaN;

  constructor(
    private readonly bus: BusName,
    private readonly kind: NoiseKind,
    private readonly filterType: BiquadFilterType,
    private readonly q: number,
  ) {}

  private ensure(): boolean {
    if (this.gain) return true;
    if (!isEnabled()) return false;
    const rt = getRuntime();
    const dest = getBus(this.bus);
    if (!rt || !dest) return false;
    try {
      const src = createNoiseSource(this.kind);
      if (!src) return false;
      const filter = rt.ctx.createBiquadFilter();
      filter.type = this.filterType;
      filter.frequency.value = 1200;
      filter.Q.value = this.q;
      const gain = rt.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      src.start(rt.ctx.currentTime);
      this.ctx = rt.ctx;
      this.src = src;
      this.filter = filter;
      this.gain = gain;
      return true;
    } catch {
      return false;
    }
  }

  /** `level` 0..1 gain, `freq` Hz for the filter. Allocation-free once warm. */
  set(level: number, freq: number): void {
    if (level <= 0.001 && !this.gain) return;
    if (!this.ensure()) return;
    const ctx = this.ctx as AudioContext;
    const now = ctx.currentTime;
    if (this.lastGain !== level) {
      this.lastGain = level;
      smoothParam((this.gain as GainNode).gain, level, 0.05, now);
    }
    if (this.lastFreq !== freq) {
      this.lastFreq = freq;
      smoothParam((this.filter as BiquadFilterNode).frequency, freq, 0.05, now);
    }
  }

  stop(fade = 0.12): void {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    this.lastGain = Number.NaN;
    rampParam(this.gain.gain, 0, fade, ctx.currentTime);
  }

  dispose(): void {
    try {
      this.src?.stop();
      this.gain?.disconnect();
      this.filter?.disconnect();
    } catch {
      /* ignore */
    }
    this.src = null;
    this.gain = null;
    this.filter = null;
    this.ctx = null;
    this.lastGain = Number.NaN;
    this.lastFreq = Number.NaN;
  }
}

const skidVoice = new SustainedNoise("sfx", "white", "bandpass", 2.4);
const windVoice = new SustainedNoise("ambience", "pink", "lowpass", 0.7);

/**
 * Tyre scrub, held while the car is sliding. Call with the slip amount every
 * frame and with 0 (or `stopTyreSkid`) when grip returns.
 */
export function tyreSkid(intensity: number): void {
  const i = clamp01(intensity);
  if (i <= 0.001) {
    skidVoice.stop();
    return;
  }
  // Harder slides squeal higher as well as louder, which is what makes the
  // sound track the physics rather than just following a volume slider.
  skidVoice.set(0.07 + 0.38 * i, expMap(i, 900, 2600));
}

export function stopTyreSkid(): void {
  skidVoice.stop();
}

/** Airflow bed for City Swing; drive it from the swing speed. */
export function wind(intensity: number): void {
  const i = clamp01(intensity);
  if (i <= 0.001) {
    windVoice.stop();
    return;
  }
  windVoice.set(0.05 + 0.3 * i, expMap(i, 300, 2200));
}

export function stopWind(): void {
  windVoice.stop();
}

/* ------------------------------- one-shots ------------------------------- */

/** Rising whoosh into a short bright thrust. */
export function nitroBoost(duration = 1.5): void {
  play("nitro", "sfx", duration * 1000 + 200, (ctx, dest, now) => {
    burst(ctx, dest, now, { kind: "white", filter: "bandpass", f0: 260, f1: 5200, q: 1.4, dur: 0.45, peak: 0.5 });
    // Thrust: noise bed plus a detuned saw pair, both decaying together.
    burst(ctx, dest, now, { kind: "pink", filter: "highpass", f0: 1400, dur: duration, peak: 0.26, t0: 0.12, attack: 0.08 });
    tone(ctx, dest, now, { type: "sawtooth", f0: 110, f1: 190, dur: duration, peak: 0.1, t0: 0.1, attack: 0.1, lp: 2600 });
    tone(ctx, dest, now, { type: "sawtooth", f0: 110, f1: 190, dur: duration, peak: 0.1, t0: 0.1, attack: 0.1, detune: 14, lp: 2600 });
  });
}

/** Crunch + thud. `severity` 0..1 moves it from a scrape to a heavy hit. */
export function collision(severity = 0.5): void {
  const s = clamp01(severity);
  play("collision", "sfx", 700, (ctx, dest, now) => {
    const dur = lerp(0.14, 0.5, s);
    // Heavier impacts are *lower*: big panels resonate low, scrapes are bright.
    burst(ctx, dest, now, {
      kind: "white",
      filter: "bandpass",
      f0: lerp(2600, 700, s),
      f1: lerp(900, 180, s),
      q: lerp(0.8, 1.8, s),
      dur,
      peak: lerp(0.18, 0.55, s),
      attack: 0.002,
    });
    tone(ctx, dest, now, { type: "sine", f0: lerp(110, 62, s), f1: lerp(60, 34, s), dur: lerp(0.18, 0.45, s), peak: lerp(0.2, 0.6, s), attack: 0.003 });
  });
}

/** Landing after a swing or a jump. Softer and shorter than a collision. */
export function land(severity = 0.5): void {
  const s = clamp01(severity);
  play("land", "sfx", 450, (ctx, dest, now) => {
    tone(ctx, dest, now, { type: "sine", f0: lerp(90, 55, s), f1: 36, dur: lerp(0.14, 0.3, s), peak: lerp(0.18, 0.45, s), attack: 0.004 });
    burst(ctx, dest, now, { kind: "brown", filter: "lowpass", f0: lerp(500, 1100, s), dur: 0.12, peak: 0.1 + 0.2 * s });
  });
}

/** Checkpoint gate: a clean fifth, confident but not a fanfare. */
export function checkpoint(): void {
  play("checkpoint", "ui", 600, (ctx, dest, now) => {
    tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(81), dur: 0.16, peak: 0.26 });
    tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(88), dur: 0.3, peak: 0.2, t0: 0.08 });
  });
}

/** 3-2-1 countdown. `n <= 0` is the green light. */
export function countdownBeep(n: number): void {
  if (n <= 0) {
    raceStart();
    return;
  }
  play("countdown", "ui", 400, (ctx, dest, now) => {
    const midi = 69 + (3 - clamp(n, 1, 3)) * 2;
    tone(ctx, dest, now, { type: "square", f0: midiToFreq(midi), dur: 0.16, peak: 0.2, lp: 3200 });
  });
}

export function raceStart(): void {
  play("raceStart", "ui", 1200, (ctx, dest, now) => {
    // Octave above the last countdown beep, plus a swell, so the start reads as
    // a release of tension rather than a fourth beep.
    tone(ctx, dest, now, { type: "square", f0: midiToFreq(85), dur: 0.5, peak: 0.24, lp: 5200 });
    tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(73), dur: 0.5, peak: 0.18 });
    burst(ctx, dest, now, { kind: "white", filter: "highpass", f0: 400, f1: 4000, dur: 0.35, peak: 0.16, attack: 0.12 });
  });
}

/** Major pentatonic, so any combo length stays consonant. */
const PENTATONIC = [0, 2, 4, 7, 9];

/** Pickup blip; `pitchIndex` is the combo counter and climbs the scale. */
export function collectible(pitchIndex = 0): void {
  play("collectible", "sfx", 320, (ctx, dest, now) => {
    const i = Math.max(0, Math.floor(pitchIndex));
    const midi = 76 + PENTATONIC[i % PENTATONIC.length] + 12 * Math.min(Math.floor(i / PENTATONIC.length), 2);
    tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(midi), dur: 0.14, peak: 0.24, attack: 0.003 });
    tone(ctx, dest, now, { type: "sine", f0: midiToFreq(midi + 12), dur: 0.1, peak: 0.1, t0: 0.012 });
  });
}

/** Air rush past the camera; `speed` 0..1. Used for swings and near-misses. */
export function whoosh(speed = 0.5): void {
  const s = clamp01(speed);
  play("whoosh", "sfx", 600, (ctx, dest, now) => {
    const dur = lerp(0.42, 0.22, s);
    burst(ctx, dest, now, {
      kind: "pink",
      filter: "bandpass",
      f0: lerp(300, 700, s),
      f1: lerp(1400, 4200, s),
      q: 0.9,
      dur,
      peak: 0.12 + 0.3 * s,
      attack: dur * 0.45,
    });
  });
}

/** Web/rope hits: a tight click with an upward chirp. */
export function ropeAttach(): void {
  play("ropeAttach", "sfx", 300, (ctx, dest, now) => {
    burst(ctx, dest, now, { kind: "white", filter: "highpass", f0: 2400, dur: 0.06, peak: 0.22, attack: 0.001 });
    tone(ctx, dest, now, { type: "triangle", f0: 420, f1: 1500, dur: 0.11, peak: 0.16, attack: 0.002 });
  });
}

/* ----------------------------- learning cues ----------------------------- */

/** Correct: a rising major third into the fifth. Warm, not triumphal. */
export function answerCorrect(): void {
  play("answer", "ui", 700, (ctx, dest, now) => {
    tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(72), dur: 0.18, peak: 0.22 });
    tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(76), dur: 0.22, peak: 0.2, t0: 0.09 });
    tone(ctx, dest, now, { type: "sine", f0: midiToFreq(79), dur: 0.34, peak: 0.14, t0: 0.18 });
  });
}

/**
 * Wrong: deliberately NOT a buzzer. A soft, low, lightly detuned pair of sine
 * tones a whole step apart, heavily low-passed — it reads as "not that one",
 * which is the most a learning app should ever say about a wrong answer.
 */
export function answerWrong(): void {
  play("answer", "ui", 600, (ctx, dest, now) => {
    tone(ctx, dest, now, { type: "sine", f0: midiToFreq(62), dur: 0.22, peak: 0.17, attack: 0.02, lp: 900 });
    tone(ctx, dest, now, { type: "sine", f0: midiToFreq(60), dur: 0.32, peak: 0.15, attack: 0.03, t0: 0.1, lp: 800 });
  });
}

/** Level up: a quick pentatonic run, the one place a flourish is earned. */
export function levelUp(): void {
  play("levelUp", "ui", 1100, (ctx, dest, now) => {
    for (let i = 0; i < 4; i++) {
      const midi = 72 + PENTATONIC[i % PENTATONIC.length] + (i >= 4 ? 12 : 0);
      tone(ctx, dest, now, { type: "triangle", f0: midiToFreq(midi), dur: 0.2, peak: 0.2, t0: i * 0.075 });
    }
    tone(ctx, dest, now, { type: "sine", f0: midiToFreq(84), dur: 0.5, peak: 0.12, t0: 0.3 });
  });
}

export function uiTap(): void {
  play("ui", "ui", 120, (ctx, dest, now) => {
    tone(ctx, dest, now, { type: "sine", f0: 980, dur: 0.045, peak: 0.12, attack: 0.002 });
  });
}

export function uiBack(): void {
  play("ui", "ui", 140, (ctx, dest, now) => {
    tone(ctx, dest, now, { type: "sine", f0: 560, f1: 420, dur: 0.07, peak: 0.11, attack: 0.002 });
  });
}

/** Release sustained voices (level teardown). One-shots expire on their own. */
export function disposeSfx(): void {
  skidVoice.dispose();
  windVoice.dispose();
  active.clear();
}

/** Test seam. */
export function __activeVoices(name: string): number {
  return voiceCount(name);
}
