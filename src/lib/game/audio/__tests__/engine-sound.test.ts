/** The per-frame contract: correct graph, no allocations, no abrupt jumps. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetAudioForTests, getRuntime, setEnabled } from "../context";
import { DEFAULT_ENGINE, EngineSound } from "../engine-sound";
import { FakeAudioContext, FakeAudioParam, FakeNode, ctx, installFakeAudio, uninstallFakeAudio } from "./fake-audio";

const asNode = (n: unknown) => n as unknown as FakeNode;
const asParam = (p: unknown) => p as unknown as FakeAudioParam;

function nodesOf(kind: string): FakeNode[] {
  return ctx().nodes.filter((n) => n.kind === kind);
}

/** out -> shift -> pan -> engine bus, so the chain can be walked from the panner. */
function chain() {
  const pan = nodesOf("stereoPanner")[0];
  const shift = pan.inputs[0];
  const out = shift.inputs[0];
  const rumbleCut = out.inputs[0];
  const tone = rumbleCut.inputs[0];
  const flutterDepth = ctx().paramConnections.find((pc) => pc.to === (out as unknown as { gain: FakeAudioParam }).gain)?.from;
  return { pan, shift, out, rumbleCut, tone, flutterDepth };
}

function allParams(): FakeAudioParam[] {
  const out: FakeAudioParam[] = [];
  for (const n of ctx().nodes) out.push(...n.params);
  return out;
}

function totalDirectSets(): number {
  let n = 0;
  for (const p of allParams()) n += p.directSets;
  return n;
}

function totalParamCalls(): number {
  let n = 0;
  for (const p of allParams()) n += p.calls.length;
  return n;
}

let engine: EngineSound;

beforeEach(() => {
  installFakeAudio();
  __resetAudioForTests();
  engine = new EngineSound();
  engine.start();
});

afterEach(() => {
  engine.dispose();
  __resetAudioForTests();
  uninstallFakeAudio();
});

describe("engine graph", () => {
  it("builds the voice and routes it to the engine bus", () => {
    const rt = getRuntime();
    expect(engine.ok).toBe(true);
    expect(engine.isRunning).toBe(true);
    const { pan } = chain();
    expect(pan.outputs).toContain(asNode(rt?.buses.engine));
    // ...and nothing bypasses the bus straight to the destination.
    expect(asNode(ctx().destination).inputs.map((n) => n.kind)).toEqual(["compressor"]);
  });

  it("voices six detuned harmonic partials plus a rev-limiter LFO", () => {
    const oscs = nodesOf("oscillator");
    expect(oscs.length).toBe(7);
    const detunes = oscs.map((o) => (o as unknown as { detune: FakeAudioParam }).detune.value);
    // Perfectly in-tune partials sound synthetic; real cylinders scatter.
    expect(detunes.filter((d) => d !== 0).length).toBeGreaterThanOrEqual(5);
    const { flutterDepth } = chain();
    expect(flutterDepth).toBeDefined();
    expect(asParam((flutterDepth as unknown as { gain: FakeAudioParam }).gain).value).toBe(0);
  });

  it("adds induction (white) and exhaust (brown) noise layers through a soft clipper", () => {
    expect(nodesOf("bufferSource").length).toBe(2);
    expect(nodesOf("waveShaper").length).toBe(1);
    const shaper = nodesOf("waveShaper")[0] as unknown as { curve: Float32Array | null };
    expect(shaper.curve?.length).toBe(1024);
    const { tone } = chain();
    expect(tone.inputs[0].kind).toBe("waveShaper");
  });

  it("generates each noise buffer exactly once and caches it", () => {
    const before = ctx().counts.buffer;
    expect(before).toBe(2); // white + brown
    engine.stop(0);
    engine.start();
    const second = new EngineSound();
    second.start();
    expect(ctx().counts.buffer).toBe(2);
    second.dispose();
  });
});

describe("update() is allocation-free", () => {
  it("creates zero nodes or buffers across 600 frames", () => {
    const c = ctx();
    const created = c.totalCreations;
    const nodeCount = c.nodes.length;
    for (let i = 0; i < 600; i++) {
      c.currentTime += 1 / 60;
      engine.update({
        rpm: 850 + ((i * 97) % 6900),
        load: (i % 60) / 60,
        speed: (i % 240) + 1,
        gear: 1 + (i % 6),
        dtMs: 16.7,
      });
    }
    expect(c.totalCreations).toBe(created);
    expect(c.nodes.length).toBe(nodeCount);
  });

  it("only schedules ramps; never assigns param.value directly", () => {
    const c = ctx();
    const sets = totalDirectSets();
    for (let i = 0; i < 120; i++) {
      c.currentTime += 1 / 60;
      engine.update({ rpm: 1000 + i * 50, load: i / 120, dtMs: 16.7 });
    }
    expect(totalDirectSets()).toBe(sets);
    const { out, tone } = chain();
    const outGain = asParam((out as unknown as { gain: FakeAudioParam }).gain);
    const cutoff = asParam((tone as unknown as { frequency: FakeAudioParam }).frequency);
    expect(outGain.countOf("setTargetAtTime")).toBeGreaterThan(50);
    expect(cutoff.countOf("setTargetAtTime")).toBeGreaterThan(50);
  });

  it("skips redundant scheduling when nothing moved", () => {
    const c = ctx();
    engine.update({ rpm: 3000, load: 0.5, dtMs: 16.7 });
    const before = totalParamCalls();
    for (let i = 0; i < 50; i++) {
      c.currentTime += 1 / 60;
      engine.update({ rpm: 3000, load: 0.5, dtMs: 16.7 });
    }
    expect(totalParamCalls()).toBe(before);
  });

  it("no-ops when stopped or disabled", () => {
    const c = ctx();
    engine.setEnabled(false);
    const before = totalParamCalls();
    c.currentTime += 1;
    engine.update({ rpm: 7000, load: 1 });
    expect(totalParamCalls()).toBe(before);
    // stop() itself schedules a fade; after that, update must add nothing.
    engine.stop(0);
    const afterStop = totalParamCalls();
    c.currentTime += 1;
    engine.update({ rpm: 7000, load: 1 });
    expect(totalParamCalls()).toBe(afterStop);
  });
});

describe("engine behaviour", () => {
  function freqOfFundamental(): number {
    // Partial index 1 is the 1x firing-frequency oscillator.
    return asParam((nodesOf("oscillator")[1] as unknown as { frequency: FakeAudioParam }).frequency).value;
  }

  it("tracks rpm with the firing frequency and opens the filter", () => {
    const c = ctx();
    c.currentTime += 1;
    engine.update({ rpm: 2000, load: 0.5, dtMs: 16.7 });
    const low = freqOfFundamental();
    const lowCut = asParam((chain().tone as unknown as { frequency: FakeAudioParam }).frequency).value;
    c.currentTime += 1;
    engine.update({ rpm: 6000, load: 0.5, dtMs: 16.7 });
    expect(freqOfFundamental() / low).toBeCloseTo(3, 1);
    expect(low).toBeCloseTo(66.67, 1);
    expect(freqOfFundamental()).toBeCloseTo(200, 1);
    expect(asParam((chain().tone as unknown as { frequency: FakeAudioParam }).frequency).value).toBeGreaterThan(lowCut);
  });

  it("is quieter and darker off throttle (engine braking)", () => {
    const c = ctx();
    const { out, tone } = chain();
    const outGain = asParam((out as unknown as { gain: FakeAudioParam }).gain);
    const cutoff = asParam((tone as unknown as { frequency: FakeAudioParam }).frequency);
    c.currentTime += 1;
    engine.update({ rpm: 5000, load: 1, dtMs: 16.7 });
    const onGain = outGain.value;
    const onCut = cutoff.value;
    c.currentTime += 1;
    engine.update({ rpm: 5000, load: 0, dtMs: 16.7 });
    expect(outGain.value).toBeLessThan(onGain);
    expect(cutoff.value).toBeLessThan(onCut);
  });

  it("only flutters once past the rev limiter", () => {
    const c = ctx();
    const depth = asParam((chain().flutterDepth as unknown as { gain: FakeAudioParam }).gain);
    c.currentTime += 1;
    engine.update({ rpm: DEFAULT_ENGINE.limiterRpm - 500, load: 1, dtMs: 16.7 });
    expect(depth.value).toBe(0);
    c.currentTime += 1;
    engine.update({ rpm: DEFAULT_ENGINE.redlineRpm, load: 1, dtMs: 16.7 });
    expect(depth.value).toBeGreaterThan(0.1);
  });

  it("dips the output on an upshift only", () => {
    const c = ctx();
    const shiftGain = asParam((chain().shift as unknown as { gain: FakeAudioParam }).gain);
    c.currentTime += 1;
    engine.update({ rpm: 6000, load: 1, gear: 1, dtMs: 16.7 });
    expect(shiftGain.countOf("linearRampToValueAtTime")).toBe(0);
    c.currentTime += 1;
    engine.update({ rpm: 4000, load: 1, gear: 2, dtMs: 16.7 });
    expect(shiftGain.countOf("linearRampToValueAtTime")).toBe(2); // dip, then recover
    c.currentTime += 1;
    engine.update({ rpm: 6500, load: 0, gear: 1, dtMs: 16.7 }); // downshift: no dip
    expect(shiftGain.countOf("linearRampToValueAtTime")).toBe(2);
  });

  it("snaps instead of sweeping after a long frame gap", () => {
    const c = ctx();
    const outGain = asParam((chain().out as unknown as { gain: FakeAudioParam }).gain);
    c.currentTime += 1;
    engine.update({ rpm: 2000, load: 0.2, dtMs: 16.7 });
    const normalTau = outGain.calls[outGain.calls.length - 1].args[2];
    c.currentTime += 2;
    engine.update({ rpm: 6500, load: 0.9, dtMs: 2000 });
    const snapTau = outGain.calls[outGain.calls.length - 1].args[2];
    expect(snapTau).toBeLessThan(normalTau);
  });

  it("fades out before stopping its sources, so there is no click", () => {
    const c = ctx();
    c.currentTime = 10;
    const outGain = asParam((chain().out as unknown as { gain: FakeAudioParam }).gain);
    engine.stop(0.09);
    expect(outGain.calls.some((k) => k.method === "linearRampToValueAtTime" && k.args[0] === 0)).toBe(true);
    for (const osc of nodesOf("oscillator")) expect(osc.stoppedAt).toBeGreaterThan(10.09);
    expect(engine.isRunning).toBe(false);
  });

  it("can be restarted after stopping", () => {
    engine.stop(0);
    expect(engine.isRunning).toBe(false);
    engine.start();
    expect(engine.isRunning).toBe(true);
    const live = nodesOf("oscillator").filter((o) => o.stoppedAt === null);
    expect(live.length).toBe(7);
  });
});

describe("engine without audio", () => {
  it("constructs, updates and stops safely with no AudioContext", () => {
    engine.dispose();
    uninstallFakeAudio();
    __resetAudioForTests();
    const dead = new EngineSound();
    expect(dead.ok).toBe(false);
    expect(() => {
      dead.start();
      for (let i = 0; i < 10; i++) dead.update({ rpm: 5000, load: 1, dtMs: 16.7 });
      dead.setPan(0.5);
      dead.setEnabled(false);
      dead.stop();
      dead.dispose();
    }).not.toThrow();
    expect(dead.isRunning).toBe(false);
    installFakeAudio();
    engine = new EngineSound();
  });

  it("refuses to start while audio is globally disabled", () => {
    engine.dispose();
    setEnabled(false);
    const off = new EngineSound();
    off.start();
    expect(off.isRunning).toBe(false);
    setEnabled(true);
    off.start();
    expect(off.isRunning).toBe(true);
    off.dispose();
    engine = new EngineSound();
  });
});

describe("fake harness sanity", () => {
  it("counts every construction", () => {
    const c = new FakeAudioContext();
    expect(c.totalCreations).toBe(0);
    c.createGain();
    c.createOscillator();
    expect(c.totalCreations).toBe(2);
  });
});
