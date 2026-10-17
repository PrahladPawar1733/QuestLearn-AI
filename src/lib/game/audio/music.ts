"use client";

/**
 * Generative race music: a four-bar loop in A minor, assembled from layers
 * that arrive as the race heats up.
 *
 * Scheduling follows the standard Web Audio pattern (Wilson, "A Tale of Two
 * Clocks"): a coarse timer only *wakes* the scheduler, while every note time
 * comes from the AudioContext clock and is scheduled a lookahead window ahead.
 * A `setInterval` of note events would drift and jitter with the main thread —
 * fatal when the main thread is also running a 3D game.
 */
import { getBus, getRuntime, isEnabled } from "./context";
import { createNoiseSource } from "./noise";
import { clamp01, midiToFreq, rampParam } from "./util";

const BPM = 124;
const STEPS_PER_BEAT = 4; // 16th notes
const STEPS_PER_BAR = 16;
const BARS = 4;
const LOOP_STEPS = STEPS_PER_BAR * BARS;

/** Schedule this far ahead; long enough to survive a GC pause, short enough that intensity changes feel immediate. */
const LOOKAHEAD = 0.22;
const TICK_MS = 45;

/**
 * i - VI - III - VII in A minor: the modern, slightly heroic loop that teenage
 * players read as "driving" without it feeling like a cartoon.
 */
const PROGRESSION: readonly (readonly number[])[] = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];

/** A minor pentatonic, for the arpeggio layer. */
const ARP = [57, 60, 62, 64, 67, 69];

/** Pure: the AudioContext time of a given 16th-note step. */
export function stepTime(startTime: number, step: number, bpm = BPM, stepsPerBeat = STEPS_PER_BEAT): number {
  return startTime + (step * 60) / (bpm * stepsPerBeat);
}

/**
 * Pure: the first step index that is *not* yet due, given the window
 * [now, now + lookahead). The scheduler loops from `fromStep` up to this.
 */
export function stepsDueBefore(
  startTime: number,
  now: number,
  lookahead = LOOKAHEAD,
  bpm = BPM,
  stepsPerBeat = STEPS_PER_BEAT,
): number {
  const horizon = now + lookahead - startTime;
  if (horizon <= 0) return 0;
  return Math.ceil((horizon * bpm * stepsPerBeat) / 60);
}

export class GenerativeMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private nextStep = 0;
  private intensity = 0.35;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  private ensure(): boolean {
    if (this.out) return true;
    if (!isEnabled()) return false;
    const rt = getRuntime();
    const dest = getBus("music");
    if (!rt || !dest) return false;
    try {
      const out = rt.ctx.createGain();
      out.gain.value = 0;
      // One shared tone control: intensity opens the loop up instead of just
      // making it louder, which is how the mix stays out of the engine's way.
      const lowpass = rt.ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1200;
      lowpass.Q.value = 0.4;
      out.connect(lowpass);
      lowpass.connect(dest);
      this.ctx = rt.ctx;
      this.out = out;
      this.lowpass = lowpass;
      return true;
    } catch {
      return false;
    }
  }

  start(fade = 1.2): void {
    if (this.running || !this.ensure()) return;
    const ctx = this.ctx as AudioContext;
    this.running = true;
    // Align the loop to "now" so the first bar starts immediately but still
    // lands on a grid the lookahead maths can reason about.
    this.startTime = ctx.currentTime + 0.08;
    this.nextStep = 0;
    rampParam((this.out as GainNode).gain, 1, fade, ctx.currentTime);
    this.applyIntensity();
    this.tick();
  }

  stop(fade = 0.8): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    rampParam(this.out.gain, 0, fade, ctx.currentTime);
  }

  /** 0 = just a pad, 1 = everything. Safe to call from UI or game events. */
  setIntensity(v: number): void {
    this.intensity = clamp01(v);
    this.applyIntensity();
  }

  private applyIntensity(): void {
    const ctx = this.ctx;
    if (!ctx || !this.lowpass) return;
    rampParam(this.lowpass.frequency, 700 + 5200 * this.intensity, 0.6, ctx.currentTime);
  }

  private readonly tick = (): void => {
    if (!this.running) return;
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    try {
      const until = stepsDueBefore(this.startTime, ctx.currentTime);
      while (this.nextStep < until) {
        this.scheduleStep(ctx, out, this.nextStep, stepTime(this.startTime, this.nextStep));
        this.nextStep++;
      }
    } catch {
      /* never let a scheduling error kill the loop */
    }
    this.timer = setTimeout(this.tick, TICK_MS);
  };

  private scheduleStep(ctx: AudioContext, dest: AudioNode, step: number, at: number): void {
    const inLoop = step % LOOP_STEPS;
    const bar = Math.floor(inLoop / STEPS_PER_BAR);
    const inBar = inLoop % STEPS_PER_BAR;
    const chord = PROGRESSION[bar];
    const i = this.intensity;

    // Pad: always present, one sustained voicing per bar.
    if (inBar === 0) {
      for (let v = 0; v < chord.length; v++) {
        this.note(ctx, dest, at, midiToFreq(chord[v] + 12), 1.85, 0.075, "triangle", 0.35);
      }
    }

    // Bass pulse from 0.2: the first thing that makes it feel like a race.
    if (i >= 0.2 && (inBar === 0 || inBar === 6 || inBar === 8 || inBar === 14)) {
      this.note(ctx, dest, at, midiToFreq(chord[0] - 12), 0.26, 0.17, "sawtooth", 0.006);
    }

    // Arpeggio from 0.5, 8ths; doubles to 16ths at full intensity.
    if (i >= 0.5 && (inBar % 2 === 0 || i >= 0.85)) {
      const n = ARP[(step * 3 + bar) % ARP.length] + 12;
      this.note(ctx, dest, at, midiToFreq(n), 0.16, 0.05 + 0.05 * i, "square", 0.004);
    }

    // Percussion from 0.7: kick on the beat, closed hat on the offbeat.
    if (i >= 0.7) {
      if (inBar % 8 === 0) this.kick(ctx, dest, at);
      if (inBar % 4 === 2) this.hat(ctx, dest, at, 0.05 + 0.05 * i);
    }
  }

  private note(
    ctx: AudioContext,
    dest: AudioNode,
    at: number,
    freq: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    attack: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private kick(ctx: AudioContext, dest: AudioNode, at: number): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + 0.24);
  }

  private hat(ctx: AudioContext, dest: AudioNode, at: number, peak: number): void {
    const src = createNoiseSource("white");
    if (!src) return;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(dest);
    src.start(at);
    src.stop(at + 0.07);
  }

  dispose(): void {
    this.stop(0.05);
    try {
      this.out?.disconnect();
      this.lowpass?.disconnect();
    } catch {
      /* ignore */
    }
    this.out = null;
    this.lowpass = null;
    this.ctx = null;
  }

  /** Test seam: drive the scheduler without waiting on timers. */
  __tickOnce(): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!this.running || !ctx || !out) return;
    const until = stepsDueBefore(this.startTime, ctx.currentTime);
    while (this.nextStep < until) {
      this.scheduleStep(ctx, out, this.nextStep, stepTime(this.startTime, this.nextStep));
      this.nextStep++;
    }
  }
}

export const music = new GenerativeMusic();
