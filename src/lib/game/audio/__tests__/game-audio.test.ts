/** The one-reference facade a game holds. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameAudio, gameAudio } from "../index";
import { __resetAudioForTests, getRuntime } from "../context";
import { FakeAudioContext, FakeNode, ctx, installFakeAudio, uninstallFakeAudio } from "./fake-audio";

const asNode = (n: unknown) => n as unknown as FakeNode;

let audio: GameAudio;

beforeEach(() => {
  installFakeAudio();
  __resetAudioForTests();
  audio = new GameAudio();
});

afterEach(() => {
  audio.dispose();
  __resetAudioForTests();
  uninstallFakeAudio();
});

describe("GameAudio facade", () => {
  it("exposes a shared instance", () => {
    expect(gameAudio).toBeInstanceOf(GameAudio);
  });

  it("unlocks the context from a gesture", async () => {
    expect(audio.state).toBeNull();
    expect(await audio.unlock()).toBe(true);
    expect(audio.state).toBe("running");
    expect(audio.ready).toBe(true);
  });

  it("builds the engine voice lazily, on the first start", () => {
    expect(audio.engine).toBeNull();
    expect(FakeAudioContext.last).toBeNull(); // not even a context yet
    audio.startEngine();
    expect(audio.engine?.isRunning).toBe(true);
    expect(ctx().counts.oscillator).toBe(7);
  });

  it("drives the engine per frame with no further allocation", () => {
    audio.startEngine();
    const c = ctx();
    const created = c.totalCreations;
    for (let i = 0; i < 240; i++) {
      c.currentTime += 1 / 60;
      audio.updateEngine({ rpm: 1000 + i * 25, load: (i % 30) / 30, speed: i, gear: 1 + (i % 5), dtMs: 16.7 });
    }
    expect(c.totalCreations).toBe(created);
  });

  it("updateEngine before startEngine is a silent no-op", () => {
    getRuntime();
    const created = ctx().totalCreations;
    expect(() => audio.updateEngine({ rpm: 5000, load: 1 })).not.toThrow();
    expect(ctx().totalCreations).toBe(created);
  });

  it("the kill switch silences engine, music and sustained sfx together", () => {
    const rt = getRuntime();
    audio.startEngine();
    audio.startMusic();
    audio.sfx.tyreSkid(0.8);
    audio.setEnabled(false);
    expect(rt?.master.gain.value).toBe(0);
    expect(audio.engine?.isRunning).toBe(false);
    expect(audio.music.isRunning).toBe(false);
    expect(audio.snapshot().enabled).toBe(false);
  });

  it("reconfiguring the engine rebuilds the voice", () => {
    audio.startEngine();
    const first = audio.engine;
    audio.configureEngine({ cylinders: 8, redlineRpm: 6500 });
    expect(audio.engine).toBeNull();
    audio.startEngine();
    expect(audio.engine).not.toBe(first);
    // A V8 fires twice as often as a four: same rpm, an octave up.
    const c = ctx();
    c.currentTime += 1;
    audio.updateEngine({ rpm: 3000, load: 0.5, dtMs: 16.7 });
    const live = c.nodes.filter((n) => n.kind === "oscillator" && n.stoppedAt === null);
    expect(live[1].params[0].value).toBeCloseTo(200, 0);
  });

  it("routes the mixer controls through to the graph", () => {
    const rt = getRuntime();
    audio.setMasterVolume(0.5);
    audio.setBusVolume("engine", 0.2);
    expect(rt?.master.gain.value).toBeCloseTo(0.5);
    expect(rt?.buses.engine.gain.value).toBeCloseTo(0.2);
    audio.mute();
    expect(rt?.master.gain.value).toBe(0);
    audio.unmute();
    expect(rt?.master.gain.value).toBeCloseTo(0.5);
  });

  it("suspends and resumes", async () => {
    await audio.unlock();
    await audio.suspend();
    expect(audio.state).toBe("suspended");
    expect(await audio.resume()).toBe(true);
  });

  it("dispose tears the whole graph down and is safe to repeat", () => {
    audio.startEngine();
    audio.startMusic();
    const c = ctx();
    audio.dispose();
    expect(c.closed).toBe(true);
    expect(audio.engine).toBeNull();
    expect(asNode(c.destination).inputs.length).toBe(0);
    expect(() => audio.dispose()).not.toThrow();
  });

  it("works end-to-end with no Web Audio at all (SSR)", () => {
    uninstallFakeAudio();
    __resetAudioForTests();
    const headless = new GameAudio();
    expect(headless.ready).toBe(false);
    expect(() => {
      headless.startEngine();
      headless.updateEngine({ rpm: 4000, load: 0.5, dtMs: 16.7 });
      headless.startMusic();
      headless.setMusicIntensity(0.8);
      headless.sfx.collision(1);
      headless.sfx.answerCorrect();
      headless.setMasterVolume(0.3);
      headless.setEnabled(false);
      headless.stopEngine();
      headless.stopMusic();
      headless.dispose();
    }).not.toThrow();
    expect(headless.engine).toBeNull();
    installFakeAudio();
  });
});
