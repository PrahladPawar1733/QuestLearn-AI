/** The generative layer: lookahead scheduling on the audio clock, not on a timer. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAudioForTests, getRuntime, setEnabled } from "../context";
import { GenerativeMusic, music, stepTime } from "../music";
import { FakeNode, ctx, installFakeAudio, uninstallFakeAudio } from "./fake-audio";

const asNode = (n: unknown) => n as unknown as FakeNode;

/** music out -> lowpass -> music bus; notes land on `out`. */
function musicChain() {
  const rt = getRuntime();
  const lowpass = asNode(rt?.buses.music).inputs[0];
  return { lowpass, out: lowpass.inputs[0] };
}

function noteCount(): number {
  return musicChain().out.inputs.length;
}

beforeEach(() => {
  vi.useFakeTimers();
  installFakeAudio();
  __resetAudioForTests();
  getRuntime();
});

afterEach(() => {
  music.dispose();
  __resetAudioForTests();
  uninstallFakeAudio();
  vi.useRealTimers();
});

describe("scheduling", () => {
  it("never uses setInterval", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    music.start();
    const c = ctx();
    for (let i = 0; i < 5; i++) {
      c.currentTime += 0.045;
      vi.advanceTimersByTime(45);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("only schedules notes inside the lookahead window", () => {
    const c = ctx();
    c.currentTime = 3;
    music.start();
    const horizon = c.currentTime + 0.25;
    expect(noteCount()).toBeGreaterThan(0);
    for (const n of c.nodes) {
      if (n.kind === "oscillator" && n.startedAt !== null) expect(n.startedAt).toBeLessThanOrEqual(horizon);
    }
  });

  it("keeps scheduling as the audio clock advances, in order", () => {
    const c = ctx();
    music.start();
    const first = noteCount();
    for (let i = 0; i < 20; i++) {
      c.currentTime += 0.045;
      vi.advanceTimersByTime(45);
    }
    expect(noteCount()).toBeGreaterThan(first);
    const starts = c.nodes.filter((n) => n.kind === "oscillator").map((n) => n.startedAt as number);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]);
  });

  it("places notes on the 16th-note grid of the audio clock", () => {
    const c = ctx();
    c.currentTime = 10;
    music.start();
    const step = 60 / (124 * 4);
    const starts = c.nodes.filter((n) => n.kind === "oscillator").map((n) => n.startedAt as number);
    const origin = starts[0];
    for (const t of starts) {
      const k = (t - origin) / step;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
    expect(stepTime(origin, 16) - origin).toBeCloseTo((4 * 60) / 124, 6);
  });

  it("stops the timer when stopped and does not double-start", () => {
    const c = ctx();
    music.start();
    const afterStart = noteCount();
    music.start(); // second call must be ignored
    expect(noteCount()).toBe(afterStart);
    music.stop(0.1);
    expect(music.isRunning).toBe(false);
    c.currentTime += 5;
    vi.advanceTimersByTime(500);
    expect(noteCount()).toBe(afterStart);
  });

  it("fades in and out instead of cutting", () => {
    const c = ctx();
    c.currentTime = 1;
    music.start(1.2);
    const { out } = musicChain();
    expect(out.params[0].countOf("linearRampToValueAtTime")).toBe(1);
    expect(out.params[0].value).toBe(1);
    c.currentTime += 1;
    music.stop(0.8);
    expect(out.params[0].value).toBe(0);
    expect(out.directSets()).toBe(1); // only the initial construction value
  });
});

describe("intensity", () => {
  /** Voices scheduled over ~2 bars at a fixed intensity. */
  function notesInTwoBars(intensity: number): number {
    const c = ctx();
    const before = c.nodes.filter(isVoice).length;
    const m = new GenerativeMusic();
    m.setIntensity(intensity);
    c.currentTime += 1;
    m.start();
    for (let i = 0; i < 10; i++) {
      c.currentTime += 0.4;
      m.__tickOnce();
    }
    m.dispose();
    return c.nodes.filter(isVoice).length - before;
  }

  const isVoice = (n: FakeNode) => n.kind === "oscillator" || n.kind === "bufferSource";

  it("adds layers as the race heats up", () => {
    const quiet = notesInTwoBars(0);
    const mid = notesInTwoBars(0.5);
    const loud = notesInTwoBars(1);
    // The pad is always there; bass, arpeggio and percussion arrive in turn.
    expect(quiet).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(quiet);
    expect(loud).toBeGreaterThan(mid);
  });

  it("opens the tone control with intensity, smoothly", () => {
    music.start();
    const { lowpass } = musicChain();
    const dark = lowpass.params[0].value;
    music.setIntensity(1);
    expect(lowpass.params[0].value).toBeGreaterThan(dark);
    expect(lowpass.params[0].countOf("linearRampToValueAtTime")).toBeGreaterThan(0);
    expect(lowpass.params[0].directSets).toBe(1); // only the initial construction value
  });

  it("clamps out-of-range intensity", () => {
    expect(() => {
      music.setIntensity(-3);
      music.setIntensity(42);
      music.setIntensity(Number.NaN);
    }).not.toThrow();
  });
});

describe("safety", () => {
  it("does nothing when disabled or without a context", () => {
    setEnabled(false);
    const created = ctx().totalCreations;
    music.start();
    expect(music.isRunning).toBe(false);
    expect(ctx().totalCreations).toBe(created);

    uninstallFakeAudio();
    __resetAudioForTests();
    const dead = new GenerativeMusic();
    expect(() => {
      dead.start();
      dead.setIntensity(1);
      dead.stop();
      dead.dispose();
    }).not.toThrow();
    expect(dead.isRunning).toBe(false);
    installFakeAudio();
  });

  it("a throwing scheduler tick does not kill the loop", () => {
    const c = ctx();
    music.start();
    const original = c.createOscillator.bind(c);
    let thrown = 0;
    c.createOscillator = () => {
      if (thrown++ < 1) throw new Error("boom");
      return original();
    };
    c.currentTime += 0.5;
    expect(() => vi.advanceTimersByTime(45)).not.toThrow();
    expect(music.isRunning).toBe(true);
    c.currentTime += 0.5;
    vi.advanceTimersByTime(45);
    expect(noteCount()).toBeGreaterThan(0);
  });
});
