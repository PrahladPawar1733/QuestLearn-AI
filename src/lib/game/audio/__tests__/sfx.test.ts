/** One-shots: routing, voice limiting, and never throwing. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAudioForTests, getRuntime, setEnabled } from "../context";
import { __noiseCacheSize } from "../noise";
import * as sfx from "../sfx";
import { FakeNode, ctx, installFakeAudio, uninstallFakeAudio } from "./fake-audio";

const asNode = (n: unknown) => n as unknown as FakeNode;

function busInputs(bus: "engine" | "sfx" | "ui" | "music" | "ambience"): FakeNode[] {
  const rt = getRuntime();
  return asNode(rt?.buses[bus]).inputs;
}

beforeEach(() => {
  vi.useFakeTimers();
  installFakeAudio();
  __resetAudioForTests();
  sfx.disposeSfx();
  getRuntime();
});

afterEach(() => {
  sfx.disposeSfx();
  __resetAudioForTests();
  uninstallFakeAudio();
  vi.useRealTimers();
});

describe("routing", () => {
  it("sends race sounds to the sfx bus and cues to the ui bus", () => {
    sfx.collision(0.8);
    expect(busInputs("sfx").length).toBeGreaterThan(0);
    expect(busInputs("ui").length).toBe(0);
    sfx.answerCorrect();
    sfx.uiTap();
    expect(busInputs("ui").length).toBeGreaterThan(0);
  });

  it("puts the wind bed on the ambience bus", () => {
    sfx.wind(0.6);
    expect(busInputs("ambience").length).toBe(1);
  });

  it("every one-shot schedules an envelope and self-terminates", () => {
    const c = ctx();
    c.currentTime = 5;
    sfx.collision(1);
    for (const node of c.nodes) {
      if (node.kind === "oscillator" || node.kind === "bufferSource") {
        expect(node.startedAt).not.toBeNull();
        expect(node.stoppedAt).not.toBeNull();
        expect(node.stoppedAt as number).toBeGreaterThan(node.startedAt as number);
      }
    }
    // Envelopes are scheduled, never stepped.
    const gains = c.nodes.filter((n) => n.kind === "gain");
    const envelope = gains.find((g) => g.params[0].calls.length > 0);
    expect(envelope?.params[0].countOf("linearRampToValueAtTime")).toBeGreaterThan(0);
    expect(envelope?.params[0].countOf("exponentialRampToValueAtTime")).toBeGreaterThan(0);
  });
});

describe("voice limiting", () => {
  it("caps concurrent instances of the same sound", () => {
    for (let i = 0; i < 40; i++) sfx.collision(1);
    expect(sfx.__activeVoices("collision")).toBe(3);
    const nodeCount = ctx().nodes.length;
    for (let i = 0; i < 40; i++) sfx.collision(1);
    // Over the cap, the extra calls build nothing at all.
    expect(ctx().nodes.length).toBe(nodeCount);
  });

  it("frees voices once the sound has finished", () => {
    for (let i = 0; i < 10; i++) sfx.collision(1);
    expect(sfx.__activeVoices("collision")).toBe(3);
    vi.advanceTimersByTime(1000);
    expect(sfx.__activeVoices("collision")).toBe(0);
    sfx.collision(1);
    expect(sfx.__activeVoices("collision")).toBe(1);
  });

  it("limits each sound independently", () => {
    for (let i = 0; i < 10; i++) sfx.collectible(i);
    for (let i = 0; i < 10; i++) sfx.uiTap();
    expect(sfx.__activeVoices("collectible")).toBe(5);
    expect(sfx.__activeVoices("ui")).toBe(4);
    expect(sfx.__activeVoices("collision")).toBe(0);
  });

  it("shares one slot between the two answer cues so they cannot overlap", () => {
    sfx.answerCorrect();
    sfx.answerWrong();
    expect(sfx.__activeVoices("answer")).toBe(1);
  });
});

describe("sustained voices", () => {
  it("builds the skid voice once and then only writes params", () => {
    const c = ctx();
    sfx.tyreSkid(0.2);
    const created = c.totalCreations;
    for (let i = 0; i < 300; i++) {
      c.currentTime += 1 / 60;
      sfx.tyreSkid((i % 100) / 100);
    }
    expect(c.totalCreations).toBe(created);
    expect(busInputs("sfx").length).toBe(1);
  });

  it("louder and higher-pitched with more slip", () => {
    const c = ctx();
    sfx.tyreSkid(0.1);
    const gainNode = busInputs("sfx")[0];
    const filter = gainNode.inputs[0];
    const lowGain = gainNode.params[0].value;
    const lowFreq = filter.params[0].value;
    c.currentTime += 0.5;
    sfx.tyreSkid(1);
    expect(gainNode.params[0].value).toBeGreaterThan(lowGain);
    expect(filter.params[0].value).toBeGreaterThan(lowFreq);
  });

  it("fades out at zero intensity without tearing the graph down", () => {
    const c = ctx();
    sfx.tyreSkid(0.5);
    const gainNode = busInputs("sfx")[0];
    c.currentTime += 0.5;
    sfx.tyreSkid(0);
    expect(gainNode.params[0].value).toBe(0);
    expect(gainNode.params[0].countOf("linearRampToValueAtTime")).toBeGreaterThan(0);
    expect(busInputs("sfx").length).toBe(1);
  });

  it("does not build anything when asked for silence first", () => {
    const created = ctx().totalCreations;
    sfx.tyreSkid(0);
    sfx.wind(0);
    sfx.stopTyreSkid();
    sfx.stopWind();
    expect(ctx().totalCreations).toBe(created);
  });
});

describe("noise buffer caching", () => {
  it("generates each noise kind once per context, however many sounds use it", () => {
    sfx.collision(1);
    sfx.collision(0.2);
    sfx.whoosh(1);
    sfx.nitroBoost();
    sfx.tyreSkid(0.5);
    sfx.wind(0.5);
    sfx.land(1);
    const rt = getRuntime();
    // white (collision/whoosh/skid), pink (whoosh/nitro/wind), brown (land)
    expect(__noiseCacheSize(rt?.ctx as unknown as BaseAudioContext)).toBe(3);
    expect(ctx().counts.buffer).toBe(3);
  });
});

describe("safety", () => {
  it("every sound is a no-op when audio is disabled", () => {
    setEnabled(false);
    const created = ctx().totalCreations;
    expect(() => {
      sfx.collision(1);
      sfx.nitroBoost();
      sfx.checkpoint();
      sfx.countdownBeep(3);
      sfx.countdownBeep(0);
      sfx.collectible(4);
      sfx.whoosh(1);
      sfx.ropeAttach();
      sfx.land(1);
      sfx.tyreSkid(1);
      sfx.wind(1);
      sfx.answerCorrect();
      sfx.answerWrong();
      sfx.levelUp();
      sfx.uiTap();
      sfx.uiBack();
    }).not.toThrow();
    expect(ctx().totalCreations).toBe(created);
  });

  it("every sound is a no-op with no AudioContext at all", () => {
    uninstallFakeAudio();
    __resetAudioForTests();
    expect(() => {
      sfx.collision(1);
      sfx.nitroBoost();
      sfx.checkpoint();
      sfx.countdownBeep(2);
      sfx.raceStart();
      sfx.collectible(99);
      sfx.whoosh(0.5);
      sfx.ropeAttach();
      sfx.land(0.5);
      sfx.tyreSkid(1);
      sfx.stopTyreSkid();
      sfx.wind(1);
      sfx.stopWind();
      sfx.answerCorrect();
      sfx.answerWrong();
      sfx.levelUp();
      sfx.uiTap();
      sfx.uiBack();
      sfx.disposeSfx();
    }).not.toThrow();
    installFakeAudio();
  });

  it("tolerates nonsense arguments", () => {
    expect(() => {
      sfx.collision(Number.NaN);
      sfx.collision(-5);
      sfx.collision(1000);
      sfx.collectible(-1);
      sfx.collectible(1e6);
      sfx.countdownBeep(-3);
      sfx.whoosh(Number.POSITIVE_INFINITY);
      sfx.tyreSkid(Number.NaN);
      sfx.land(Number.NaN);
    }).not.toThrow();
  });

  it("countdown 0 is the race start cue", () => {
    sfx.countdownBeep(0);
    expect(sfx.__activeVoices("raceStart")).toBe(1);
    expect(sfx.__activeVoices("countdown")).toBe(0);
  });

  it("the combo pitch rises and then plateaus", () => {
    const c = ctx();
    const pitches: number[] = [];
    for (let i = 0; i < 6; i++) {
      sfx.disposeSfx();
      const before = c.nodes.length;
      sfx.collectible(i);
      pitches.push(c.nodes[before].params[0].value);
    }
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).toBeGreaterThan(pitches[i - 1]);
  });
});
