/** Pure DSP maths: no DOM, no AudioContext. */
import { describe, expect, it } from "vitest";
import { engineCutoff, engineGain, firingFrequency, rpmNorm } from "../engine-sound";
import { stepTime, stepsDueBefore } from "../music";
import { generateNoise } from "../noise";
import { clamp, clamp01, dbToGain, expMap, lerp, midiToFreq, mulberry32, semitonesToRatio, softClipCurve } from "../util";

describe("util maths", () => {
  it("clamps and guards NaN", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(0.42)).toBeCloseTo(0.42);
  });

  it("maps frequencies geometrically, not linearly", () => {
    // The midpoint of a log map is the geometric mean, which is what the ear
    // hears as "halfway" between two cutoffs.
    expect(expMap(0.5, 100, 10000)).toBeCloseTo(1000, 5);
    expect(lerp(100, 10000, 0.5)).toBeCloseTo(5050);
    expect(expMap(0, 320, 7200)).toBeCloseTo(320);
    expect(expMap(1, 320, 7200)).toBeCloseTo(7200);
  });

  it("converts dB, semitones and MIDI", () => {
    expect(dbToGain(0)).toBeCloseTo(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(semitonesToRatio(12)).toBeCloseTo(2);
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it("builds a monotonic, bounded soft-clip curve", () => {
    const curve = softClipCurve(2.4, 512);
    expect(curve.length).toBe(512);
    expect(curve[0]).toBeCloseTo(-1, 5);
    expect(curve[511]).toBeCloseTo(1, 5);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    // Saturating: small inputs get more gain than large ones.
    const mid = curve[256] - curve[255];
    const edge = curve[511] - curve[510];
    expect(mid).toBeGreaterThan(edge);
  });

  it("mulberry32 is deterministic and uniform-ish", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    const r = mulberry32(3);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += r();
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });
});

describe("rpm -> frequency mapping", () => {
  it("uses the four-stroke firing frequency (cylinders / 2 per revolution)", () => {
    // 4-cyl 4-stroke at 6000 rpm: 100 rev/s * 2 firings/rev = 200 Hz.
    expect(firingFrequency(6000, 4, 4)).toBeCloseTo(200);
    expect(firingFrequency(850, 4, 4)).toBeCloseTo(28.33, 2);
    expect(firingFrequency(7600, 4, 4)).toBeCloseTo(253.33, 2);
    // Cylinder count raises the note without changing rpm.
    expect(firingFrequency(6000, 8, 4)).toBeCloseTo(400);
    // A two-stroke fires every revolution.
    expect(firingFrequency(6000, 4, 2)).toBeCloseTo(400);
    expect(firingFrequency(0)).toBe(0);
    expect(firingFrequency(-100)).toBe(0);
  });

  it("doubles the pitch for double the rpm (an octave per 2x)", () => {
    expect(firingFrequency(6000) / firingFrequency(3000)).toBeCloseTo(2);
  });

  it("normalises rpm between idle and redline", () => {
    expect(rpmNorm(850, 850, 7600)).toBe(0);
    expect(rpmNorm(7600, 850, 7600)).toBe(1);
    expect(rpmNorm(4225, 850, 7600)).toBeCloseTo(0.5, 2);
    expect(rpmNorm(9000, 850, 7600)).toBe(1);
    expect(rpmNorm(0, 850, 7600)).toBe(0);
  });

  it("opens the filter with load more than with rpm", () => {
    const highRpmNoThrottle = engineCutoff(1, 0, 1);
    const lowRpmFullThrottle = engineCutoff(0, 1, 0);
    expect(lowRpmFullThrottle).toBeGreaterThan(highRpmNoThrottle);
    expect(engineCutoff(0, 0)).toBeCloseTo(320);
    expect(engineCutoff(1, 1, 1)).toBeCloseTo(7200);
    // Monotonic in rpm at a fixed load.
    let prev = 0;
    for (let n = 0; n <= 1; n += 0.1) {
      const f = engineCutoff(n, 0.5);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it("is quieter and duller off throttle than on it", () => {
    const on = engineGain(0.8, 1);
    const off = engineGain(0.8, 0);
    expect(off).toBeLessThan(on * 0.7);
    expect(engineGain(0, 0)).toBeGreaterThan(0.1); // idle is still audible
    expect(engineGain(1, 1)).toBeLessThanOrEqual(1);
  });
});

describe("noise generators", () => {
  const N = 1 << 14;

  function lag1(x: Float32Array): number {
    let num = 0;
    let den = 0;
    for (let i = 1; i < x.length; i++) {
      num += x[i] * x[i - 1];
      den += x[i - 1] * x[i - 1];
    }
    return num / den;
  }

  /** Goertzel power at a normalised frequency, averaged over probe bins. */
  function bandPower(x: Float32Array, centre: number, probes = 12): number {
    let total = 0;
    for (let p = 0; p < probes; p++) {
      const w = (2 * Math.PI * centre * (1 + (p / probes) * 0.5)) / 1;
      let s1 = 0;
      let s2 = 0;
      const coeff = 2 * Math.cos(w);
      for (let i = 0; i < x.length; i++) {
        const s0 = x[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      total += s1 * s1 + s2 * s2 - coeff * s1 * s2;
    }
    return total / probes;
  }

  it("is deterministic for a given seed", () => {
    const a = generateNoise("pink", 256, 11);
    const b = generateNoise("pink", 256, 11);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(generateNoise("pink", 256, 12))).not.toEqual(Array.from(a));
  });

  it("white noise is uncorrelated, brown strongly correlated, pink between", () => {
    const white = lag1(generateNoise("white", N, 1));
    const pink = lag1(generateNoise("pink", N, 1));
    const brown = lag1(generateNoise("brown", N, 1));
    expect(Math.abs(white)).toBeLessThan(0.05);
    expect(pink).toBeGreaterThan(white + 0.2);
    expect(brown).toBeGreaterThan(pink);
    expect(brown).toBeGreaterThan(0.95);
  });

  it("pink falls ~3 dB per octave and brown ~6 dB", () => {
    const pink = generateNoise("pink", N, 5);
    const brown = generateNoise("brown", N, 5);
    const white = generateNoise("white", N, 5);
    const ratio = (x: Float32Array) => bandPower(x, 0.02 * 2) / bandPower(x, 0.02);
    // The Goertzel probe has its own (flat) bias, so measure each slope
    // *relative to white*: -3 dB/oct is half the power per octave, -6 dB/oct a
    // quarter. Measured: pink 0.52x (-2.9 dB/oct), brown 0.27x (-5.7 dB/oct).
    const base = ratio(white);
    expect(ratio(pink) / base).toBeGreaterThan(0.35);
    expect(ratio(pink) / base).toBeLessThan(0.7);
    expect(ratio(brown) / base).toBeGreaterThan(0.15);
    expect(ratio(brown) / base).toBeLessThan(0.4);
  });

  it("normalises pink and brown to a predictable peak with no DC offset", () => {
    for (const kind of ["pink", "brown"] as const) {
      const x = generateNoise(kind, N, 9);
      let peak = 0;
      let mean = 0;
      for (let i = 0; i < x.length; i++) {
        peak = Math.max(peak, Math.abs(x[i]));
        mean += x[i];
      }
      expect(peak).toBeCloseTo(0.8, 5);
      expect(Math.abs(mean / x.length)).toBeLessThan(1e-6);
    }
  });
});

describe("music scheduler maths", () => {
  it("places 16th notes on the AudioContext clock", () => {
    // 124 bpm -> 0.483871 s per beat -> 0.120968 s per 16th.
    expect(stepTime(0, 0)).toBe(0);
    expect(stepTime(0, 1)).toBeCloseTo(60 / (124 * 4), 6);
    expect(stepTime(10, 16)).toBeCloseTo(10 + (16 * 60) / (124 * 4), 6);
    // One bar of 16 steps is four beats.
    expect(stepTime(0, 16) - stepTime(0, 0)).toBeCloseTo((4 * 60) / 124, 6);
  });

  it("reports exactly the steps inside the lookahead window", () => {
    const step = 60 / (124 * 4);
    expect(stepsDueBefore(0, 0, 0)).toBe(0);
    // A window of 3.5 steps covers steps 0..3, so the next unscheduled step is 4.
    expect(stepsDueBefore(0, 0, step * 3.5)).toBe(4);
    expect(stepsDueBefore(0, 0, step * 4)).toBe(4);
    // Nothing is due before the loop start time.
    expect(stepsDueBefore(100, 0, 0.22)).toBe(0);
    // The window advances with the clock, never backwards.
    const a = stepsDueBefore(0, 1, 0.22);
    const b = stepsDueBefore(0, 2, 0.22);
    expect(b).toBeGreaterThan(a);
  });

  it("scales with bpm", () => {
    expect(stepTime(0, 4, 120, 4)).toBeCloseTo(0.5, 6);
    expect(stepsDueBefore(0, 0, 1, 120, 4)).toBe(8);
  });
});
