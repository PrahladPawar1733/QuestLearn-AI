/** Mixer graph, preferences and lifecycle, against the fake AudioContext. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUS_NAMES,
  __resetAudioForTests,
  dispose,
  getBus,
  getRuntime,
  isAudioReady,
  mute,
  setBusVolume,
  setEnabled,
  setMasterVolume,
  snapshot,
  state,
  subscribe,
  suspend,
  unlock,
  unmute,
} from "../context";
import { FakeAudioContext, FakeNode, ctx, fakeLocalStorage, installFakeAudio, uninstallFakeAudio } from "./fake-audio";

const asNode = (n: unknown) => n as unknown as FakeNode;

beforeEach(() => {
  installFakeAudio();
  __resetAudioForTests();
});

afterEach(() => {
  __resetAudioForTests();
  uninstallFakeAudio();
});

describe("audio context creation", () => {
  it("does not create a context until something asks for one", () => {
    installFakeAudio();
    __resetAudioForTests();
    expect(FakeAudioContext.last).toBeNull();
    getRuntime();
    expect(FakeAudioContext.last).not.toBeNull();
  });

  it("reuses the single shared context", () => {
    const a = getRuntime();
    const b = getRuntime();
    expect(a).toBe(b);
    expect(ctx().counts.compressor).toBe(1);
  });

  it("asks for interactive latency", () => {
    getRuntime();
    expect(ctx().options?.latencyHint).toBe("interactive");
  });

  it("wires master -> limiter -> destination", () => {
    const rt = getRuntime();
    expect(rt).not.toBeNull();
    const c = ctx();
    expect(asNode(rt?.master).outputs).toContain(asNode(rt?.limiter));
    expect(asNode(rt?.limiter).outputs).toContain(asNode(c.destination));
    // A soft safety limiter, not a loudness maximiser.
    expect(rt?.limiter.threshold.value).toBeLessThan(0);
    expect(rt?.limiter.ratio.value).toBeGreaterThan(1);
  });

  it("creates all five named sub-buses, each feeding the master", () => {
    const rt = getRuntime();
    expect(BUS_NAMES).toEqual(["engine", "sfx", "ui", "music", "ambience"]);
    for (const name of BUS_NAMES) {
      const bus = rt?.buses[name];
      expect(bus).toBeDefined();
      expect(asNode(bus).outputs).toContain(asNode(rt?.master));
      expect(bus?.gain.value).toBeGreaterThan(0);
    }
    expect(getBus("engine")).toBe(rt?.buses.engine);
  });

  it("starts suspended and only resumes on an explicit unlock", async () => {
    getRuntime();
    expect(state()).toBe("suspended");
    expect(await unlock()).toBe(true);
    expect(state()).toBe("running");
  });
});

describe("mixing and preferences", () => {
  it("ramps bus volume instead of stepping it", () => {
    const rt = getRuntime();
    const before = asNode(rt?.buses.sfx).directSets();
    setBusVolume("sfx", 0.25);
    const param = rt?.buses.sfx.gain;
    expect(param?.value).toBeCloseTo(0.25);
    expect(asNode(rt?.buses.sfx).directSets()).toBe(before);
    const calls = (param as unknown as { calls: { method: string }[] }).calls.map((c) => c.method);
    expect(calls).toContain("linearRampToValueAtTime");
  });

  it("clamps volumes to 0..1", () => {
    setMasterVolume(9);
    expect(snapshot().master).toBe(1);
    setMasterVolume(-1);
    expect(snapshot().master).toBe(0);
  });

  it("mute collapses the master without losing the stored volume", () => {
    const rt = getRuntime();
    setMasterVolume(0.7);
    mute();
    expect(rt?.master.gain.value).toBe(0);
    expect(snapshot().master).toBe(0.7);
    expect(snapshot().muted).toBe(true);
    unmute();
    expect(rt?.master.gain.value).toBeCloseTo(0.7);
  });

  it("the global enabled flag silences output and makes audio not-ready", () => {
    const rt = getRuntime();
    setEnabled(false);
    expect(rt?.master.gain.value).toBe(0);
    expect(isAudioReady()).toBe(false);
    setEnabled(true);
    expect(isAudioReady()).toBe(true);
  });

  it("persists preferences across a reset", () => {
    setMasterVolume(0.33);
    setBusVolume("music", 0.11);
    mute();
    expect(fakeLocalStorage.size).toBe(1);
    __resetAudioForTests();
    const snap = snapshot();
    expect(snap.master).toBeCloseTo(0.33);
    expect(snap.buses.music).toBeCloseTo(0.11);
    expect(snap.muted).toBe(true);
    // ...and the restored values are applied to the new graph.
    const rt = getRuntime();
    expect(rt?.buses.music.gain.value).toBeCloseTo(0.11);
    expect(rt?.master.gain.value).toBe(0);
  });

  it("survives localStorage being unavailable or poisoned", () => {
    uninstallFakeAudio();
    installFakeAudio({ localStorage: false });
    __resetAudioForTests();
    expect(() => setMasterVolume(0.4)).not.toThrow();
    expect(snapshot().master).toBeCloseTo(0.4);

    uninstallFakeAudio();
    installFakeAudio();
    fakeLocalStorage.setItem("ql.audio.prefs.v1", "{not json");
    __resetAudioForTests();
    expect(snapshot().master).toBeCloseTo(0.8); // falls back to defaults
  });

  it("notifies subscribers and survives a throwing subscriber", () => {
    const seen: number[] = [];
    const off = subscribe((s) => seen.push(s.master));
    const offBad = subscribe(() => {
      throw new Error("bad subscriber");
    });
    expect(() => setMasterVolume(0.5)).not.toThrow();
    expect(seen).toEqual([0.5]);
    off();
    offBad();
    setMasterVolume(0.6);
    expect(seen).toEqual([0.5]);
  });
});

describe("lifecycle", () => {
  it("suspends and resumes", async () => {
    await unlock();
    await suspend();
    expect(state()).toBe("suspended");
    await unlock();
    expect(state()).toBe("running");
  });

  it("dispose closes the context and is safe to repeat", () => {
    getRuntime();
    const c = ctx();
    dispose();
    expect(c.closed).toBe(true);
    expect(state()).toBeNull();
    expect(() => dispose()).not.toThrow();
  });
});

describe("missing Web Audio (SSR or an unsupported browser)", () => {
  it("returns null everywhere and never throws", async () => {
    uninstallFakeAudio();
    __resetAudioForTests();
    expect(getRuntime()).toBeNull();
    expect(getBus("engine")).toBeNull();
    expect(isAudioReady()).toBe(false);
    expect(state()).toBeNull();
    expect(await unlock()).toBe(false);
    expect(() => {
      setMasterVolume(0.5);
      setBusVolume("ui", 0.5);
      mute();
      unmute();
      dispose();
    }).not.toThrow();
    expect(snapshot().available).toBe(false);
  });

  it("does not retry a failing constructor on every call", () => {
    uninstallFakeAudio();
    __resetAudioForTests();
    let attempts = 0;
    (globalThis as unknown as { window?: unknown }).window = {
      get AudioContext() {
        attempts++;
        throw new Error("blocked");
      },
    };
    expect(getRuntime()).toBeNull();
    expect(getRuntime()).toBeNull();
    expect(getRuntime()).toBeNull();
    expect(attempts).toBe(1);
  });
});
