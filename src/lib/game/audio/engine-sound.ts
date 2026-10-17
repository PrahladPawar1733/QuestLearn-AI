"use client";

/**
 * Real-time synthesised car engine, driven from the game loop.
 *
 * The model is a harmonic stack over the engine's *firing frequency* plus two
 * noise layers (induction and exhaust), pushed through a soft-clipper and a
 * tracking low-pass. That is the smallest arrangement that still reads as a
 * real engine: the harmonics give pitch and the sense of mechanical order, the
 * noise gives air and grit, and the clipper supplies the harmonics an
 * oscillator stack cannot (pressure, "load").
 *
 * CRITICAL CONTRACT: every node exists before the first frame. `update()` only
 * writes AudioParams, so the per-frame path allocates nothing and can safely be
 * called at 60-120 fps for the whole race.
 */
import { getBus, getRuntime, isEnabled } from "./context";
import { createNoiseSource } from "./noise";
import { clamp, clamp01, expMap, lerp, rampParam, smoothParam, softClipCurve } from "./util";

export interface EngineConfig {
  cylinders: number;
  /** Four-stroke engines fire once per cylinder every two revolutions. */
  strokes: 2 | 4;
  idleRpm: number;
  redlineRpm: number;
  /** RPM at which the ECU starts cutting fuel (the flutter). */
  limiterRpm: number;
  /** Overall voice level before the engine bus. */
  level: number;
}

export const DEFAULT_ENGINE: EngineConfig = {
  cylinders: 4,
  strokes: 4,
  idleRpm: 850,
  redlineRpm: 7600,
  limiterRpm: 7200,
  level: 0.9,
};

export interface EngineParams {
  rpm: number;
  /** Throttle/torque demand, 0..1. Below ~0.12 we voice engine braking. */
  load: number;
  /** Road speed in km/h; only widens the stereo image and lifts brightness. */
  speed?: number;
  gear?: number;
  /** Frame delta; a long gap means the tab was away, so snap instead of sweep. */
  dtMs?: number;
}

/**
 * Firing frequency in Hz — the physical note of an engine.
 *
 *   f = (rpm / 60) * cylinders / (strokes / 2)
 *
 * A 4-cylinder 4-stroke fires twice per revolution, so idle (850 rpm) lands at
 * ~28 Hz and the 7600 rpm redline at ~253 Hz. We voice that fundamental plus
 * harmonics up to 6x, which puts the audible energy between ~28 Hz and ~1.5 kHz
 * — exactly where real engine recordings sit, and it means a gear change moves
 * the pitch by a musically correct ratio for free.
 */
export function firingFrequency(rpm: number, cylinders = 4, strokes: 2 | 4 = 4): number {
  const revsPerSecond = Math.max(rpm, 0) / 60;
  return revsPerSecond * cylinders * (strokes === 4 ? 0.5 : 1);
}

export function rpmNorm(rpm: number, idleRpm: number, redlineRpm: number): number {
  return clamp01((rpm - idleRpm) / Math.max(redlineRpm - idleRpm, 1));
}

/**
 * Brightness -> low-pass cutoff. Load dominates (an engine on throttle opens
 * up far more than one merely spinning fast), rpm and speed add the rest.
 * Mapped geometrically because cutoff is heard logarithmically.
 */
export function engineCutoff(norm: number, load: number, speedNorm = 0): number {
  const brightness = clamp01(0.28 * norm + 0.58 * clamp01(load) + 0.14 * clamp01(speedNorm));
  return expMap(brightness, 320, 7200);
}

/** Overall voice gain. Idle is audible but small; full load is the loudest thing. */
export function engineGain(norm: number, load: number): number {
  const l = clamp01(load);
  const onThrottle = 0.2 + 0.52 * l + 0.28 * norm;
  // Off throttle the engine is being driven by the wheels: much quieter and
  // duller, which is what makes lifting the throttle legible to the player.
  const offThrottle = (0.16 + 0.3 * norm) * 0.75;
  return lerp(offThrottle, onThrottle, clamp01(l / 0.12));
}

interface Partials {
  mult: number;
  gain: number;
  /** Cents of detune: real cylinders never fire perfectly evenly. */
  detune: number;
  type: OscillatorType;
}

const PARTIALS: readonly Partials[] = [
  { mult: 0.5, gain: 0.5, detune: -7, type: "sine" }, // half-order rumble
  { mult: 1, gain: 1, detune: 0, type: "sawtooth" },
  { mult: 2, gain: 0.46, detune: 8, type: "sawtooth" },
  { mult: 3, gain: 0.26, detune: -11, type: "square" },
  { mult: 4, gain: 0.17, detune: 13, type: "sawtooth" },
  { mult: 6, gain: 0.09, detune: 17, type: "square" },
];

/** Param slots for the change-filter; indexes into `last`. */
const S_OSC = 0; // 0..5 frequency, 8..13 gain
const S_OSC_GAIN = 8;
const S_TONE = 16;
const S_IND_F = 17;
const S_IND_G = 18;
const S_EXH_F = 19;
const S_EXH_G = 20;
const S_OUT = 21;
const S_FLUTTER = 22;
const S_PAN = 23;
const S_IND_Q = 24;
const LAST_SLOTS = 25;

interface Nodes {
  mix: GainNode;
  drive: WaveShaperNode;
  tone: BiquadFilterNode;
  rumbleCut: BiquadFilterNode;
  out: GainNode;
  shift: GainNode;
  pan: StereoPannerNode;
  oscGains: GainNode[];
  inductionBand: BiquadFilterNode;
  inductionGain: GainNode;
  exhaustLp: BiquadFilterNode;
  exhaustGain: GainNode;
  flutterDepth: GainNode;
}

interface Sources {
  oscs: OscillatorNode[];
  induction: AudioBufferSourceNode;
  exhaust: AudioBufferSourceNode;
  flutter: OscillatorNode;
}

export class EngineSound {
  private readonly cfg: EngineConfig;
  private readonly ctx: AudioContext | null;
  private nodes: Nodes | null = null;
  private sources: Sources | null = null;
  private running = false;
  private enabled = true;
  private lastGear = -1;
  /** Previous targets, so we only schedule a ramp when something moved. */
  private readonly last = new Float64Array(LAST_SLOTS).fill(Number.NaN);

  constructor(config: Partial<EngineConfig> = {}) {
    this.cfg = { ...DEFAULT_ENGINE, ...config };
    const rt = getRuntime();
    this.ctx = rt ? rt.ctx : null;
    if (!rt) return;
    try {
      this.nodes = this.buildChain(rt.ctx, getBus("engine") ?? rt.master);
    } catch {
      this.nodes = null;
    }
  }

  /** True when there is a live graph; false on the server or without Web Audio. */
  get ok(): boolean {
    return this.nodes !== null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private buildChain(ctx: AudioContext, dest: AudioNode): Nodes {
    const mix = ctx.createGain();
    mix.gain.value = 0.22; // headroom: six partials plus noise sum well above 1

    const drive = ctx.createWaveShaper();
    drive.curve = softClipCurve(2.4);
    drive.oversample = "2x";

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = engineCutoff(0, 0);
    tone.Q.value = 0.9;

    // Phones and laptop speakers cannot reproduce the 14 Hz half-order content;
    // removing it stops it from stealing headroom from the limiter.
    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = "highpass";
    rumbleCut.frequency.value = 34;

    const out = ctx.createGain();
    out.gain.value = 0;

    const shift = ctx.createGain();
    shift.gain.value = 1;

    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;

    const oscGains: GainNode[] = [];
    for (let i = 0; i < PARTIALS.length; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(mix);
      oscGains.push(g);
    }

    const inductionBand = ctx.createBiquadFilter();
    inductionBand.type = "bandpass";
    inductionBand.frequency.value = 900;
    inductionBand.Q.value = 1.1;
    const inductionGain = ctx.createGain();
    inductionGain.gain.value = 0;
    inductionBand.connect(inductionGain);
    inductionGain.connect(mix);

    const exhaustLp = ctx.createBiquadFilter();
    exhaustLp.type = "lowpass";
    exhaustLp.frequency.value = 260;
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0;
    exhaustLp.connect(exhaustGain);
    exhaustGain.connect(mix);

    // Additive modulation of `out.gain`: flutter depth 0 means no modulation at
    // all, so the limiter effect costs nothing until the driver hits the rev cut.
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0;
    flutterDepth.connect(out.gain);

    mix.connect(drive);
    drive.connect(tone);
    tone.connect(rumbleCut);
    rumbleCut.connect(out);
    out.connect(shift);
    shift.connect(pan);
    pan.connect(dest);

    return {
      mix,
      drive,
      tone,
      rumbleCut,
      out,
      shift,
      pan,
      oscGains,
      inductionBand,
      inductionGain,
      exhaustLp,
      exhaustGain,
      flutterDepth,
    };
  }

  /**
   * Oscillators and buffer sources cannot be restarted once stopped, so they
   * are the only nodes rebuilt by `start()`. Everything they feed persists,
   * which is what keeps `update()` allocation-free.
   */
  private buildSources(ctx: AudioContext, n: Nodes): Sources | null {
    const induction = createNoiseSource("white");
    const exhaust = createNoiseSource("brown");
    if (!induction || !exhaust) return null;

    const oscs: OscillatorNode[] = [];
    const f0 = firingFrequency(this.cfg.idleRpm, this.cfg.cylinders, this.cfg.strokes);
    for (let i = 0; i < PARTIALS.length; i++) {
      const p = PARTIALS[i];
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = clamp(f0 * p.mult, 10, 18000);
      osc.detune.value = p.detune;
      osc.connect(n.oscGains[i]);
      oscs.push(osc);
    }
    induction.connect(n.inductionBand);
    exhaust.connect(n.exhaustLp);

    const flutter = ctx.createOscillator();
    flutter.type = "square";
    flutter.frequency.value = 26; // fuel-cut rate of a typical rev limiter
    flutter.connect(n.flutterDepth);

    const t = ctx.currentTime;
    for (let i = 0; i < oscs.length; i++) oscs[i].start(t);
    induction.start(t);
    exhaust.start(t);
    flutter.start(t);
    return { oscs, induction, exhaust, flutter };
  }

  start(): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n || this.running || !this.enabled || !isEnabled()) return;
    if (!this.sources) {
      this.sources = this.buildSources(ctx, n);
      if (!this.sources) return;
    }
    this.last.fill(Number.NaN);
    this.running = true;
    // Fade in from silence: starting at the idle gain clicks.
    rampParam(n.out.gain, 0.0001, 0.01, ctx.currentTime);
    this.update({ rpm: this.cfg.idleRpm, load: 0 });
  }

  /** Short fade before stopping the sources, so there is no click. */
  stop(fadeSeconds = 0.09): void {
    const ctx = this.ctx;
    const n = this.nodes;
    this.running = false;
    if (!ctx || !n) return;
    const now = ctx.currentTime;
    rampParam(n.out.gain, 0, fadeSeconds, now);
    rampParam(n.flutterDepth.gain, 0, fadeSeconds, now);
    const s = this.sources;
    this.sources = null;
    if (!s) return;
    const at = now + fadeSeconds + 0.01;
    try {
      for (let i = 0; i < s.oscs.length; i++) s.oscs[i].stop(at);
      s.induction.stop(at);
      s.exhaust.stop(at);
      s.flutter.stop(at);
    } catch {
      /* already stopped */
    }
  }

  /** Disabling stops the voice; re-enabling permits `start()` but does not resume on its own. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.stop(0.05);
  }

  /** Stereo width hint; the game can nudge it from the camera. */
  setPan(pan: number): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n) return;
    this.track(S_PAN, n.pan.pan, clamp(pan, -1, 1), 0.08, ctx.currentTime);
  }

  /**
   * Called every frame. Allocation-free: no literals, no closures, no arrays —
   * only AudioParam writes, and only when a target actually moved.
   */
  update(p: EngineParams): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n || !this.running || !this.enabled) return;

    const cfg = this.cfg;
    const now = ctx.currentTime;
    const dt = p.dtMs === undefined ? 16.7 : p.dtMs;
    // A stalled tab (or a pause menu) leaves a huge delta. Snapping avoids a
    // slow audible sweep from a state the player can no longer see.
    const tau = dt > 250 ? 0.008 : 0.035;

    const rpm = clamp(p.rpm, cfg.idleRpm * 0.7, cfg.redlineRpm * 1.08);
    const load = clamp01(p.load);
    const norm = rpmNorm(rpm, cfg.idleRpm, cfg.redlineRpm);
    const speedNorm = p.speed === undefined ? norm : clamp01(p.speed / 260);
    const f0 = firingFrequency(rpm, cfg.cylinders, cfg.strokes);

    // Harmonic stack. Higher partials lose level off throttle, which is the
    // single strongest cue for "engine braking" versus "pulling".
    const bright = 0.35 + 0.65 * load;
    for (let i = 0; i < PARTIALS.length; i++) {
      const part = PARTIALS[i];
      const f = clamp(f0 * part.mult, 8, 18000);
      this.track(S_OSC + i, this.oscFreq(i), f, tau, now);
      const tilt = part.mult <= 1 ? 1 : Math.pow(bright, (part.mult - 1) * 0.55);
      this.track(S_OSC_GAIN + i, n.oscGains[i].gain, part.gain * tilt, tau, now);
    }

    // Induction roar: tracks the firing frequency a couple of octaves up and
    // grows with throttle. Off throttle it narrows into the overrun "hiss".
    const offThrottle = load < 0.12;
    this.track(S_IND_F, n.inductionBand.frequency, clamp(f0 * 5 + 450, 120, 9000), tau, now);
    this.track(S_IND_G, n.inductionGain.gain, offThrottle ? 0.1 + 0.2 * norm : 0.16 + 0.5 * load * (0.45 + norm), tau, now);
    // Narrowing Q off throttle is what turns the roar into an overrun hiss;
    // ramped like everything else so a throttle flick cannot click.
    this.track(S_IND_Q, n.inductionBand.Q, offThrottle ? 3.2 : 1.1, tau, now);

    // Exhaust body: a brown-noise bed under everything, strongest at idle where
    // the harmonic stack is thin.
    this.track(S_EXH_F, n.exhaustLp.frequency, clamp(f0 * 2.2 + 90, 60, 1400), tau, now);
    this.track(S_EXH_G, n.exhaustGain.gain, 0.5 - 0.3 * norm + 0.12 * load, tau, now);

    this.track(S_TONE, n.tone.frequency, engineCutoff(norm, load, speedNorm), tau, now);
    this.track(S_OUT, n.out.gain, engineGain(norm, load) * cfg.level, tau, now);

    // Rev limiter: once past the cut point, chop the output at ~26 Hz. Depth
    // ramps in so it reads as the car fighting the limiter, not a glitch.
    const overLimit = clamp01((rpm - cfg.limiterRpm) / Math.max(cfg.redlineRpm - cfg.limiterRpm, 1));
    this.track(S_FLUTTER, n.flutterDepth.gain, overLimit > 0 ? overLimit * 0.4 * load : 0, 0.02, now);

    const gear = p.gear;
    if (gear !== undefined && gear !== this.lastGear) {
      if (this.lastGear >= 0 && gear > this.lastGear) this.blipShift(ctx, n, now);
      this.lastGear = gear;
    }
  }

  /** Momentary torque interruption on an upshift. Two scheduled ramps, no nodes. */
  private blipShift(ctx: AudioContext, n: Nodes, now: number): void {
    const g = n.shift.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.45, now + 0.022);
    g.linearRampToValueAtTime(1, now + 0.11);
  }

  private oscFreq(i: number): AudioParam {
    // `sources` is non-null whenever `running` is true.
    return (this.sources as Sources).oscs[i].frequency;
  }

  /**
   * Schedule a glide only if the target moved perceptibly. Saves thousands of
   * redundant timeline events per second and makes "ramps, never abrupt sets"
   * assertable in tests.
   */
  private track(slot: number, param: AudioParam, target: number, tau: number, now: number): void {
    const prev = this.last[slot];
    if (prev === target) return;
    if (!Number.isNaN(prev) && Math.abs(target - prev) < 1e-4 * (Math.abs(target) > 1 ? Math.abs(target) : 1)) return;
    this.last[slot] = target;
    smoothParam(param, target, tau, now);
  }

  dispose(): void {
    this.stop(0.02);
    const n = this.nodes;
    this.nodes = null;
    if (!n) return;
    try {
      n.pan.disconnect();
      n.out.disconnect();
      n.shift.disconnect();
      n.mix.disconnect();
      n.drive.disconnect();
      n.tone.disconnect();
      n.rumbleCut.disconnect();
      n.inductionGain.disconnect();
      n.exhaustGain.disconnect();
      n.flutterDepth.disconnect();
      for (let i = 0; i < n.oscGains.length; i++) n.oscGains[i].disconnect();
    } catch {
      /* ignore */
    }
  }
}
