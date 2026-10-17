/**
 * The duck table and the hold.
 *
 * No `AudioContext` anywhere: the applier is injected, which is exactly how
 * the real one will arrive once `setBusDuck` lands in
 * `src/lib/game/audio/context.ts` (the required patch is documented at the
 * top of `../ducking.ts`).
 */
import { describe, expect, it, vi } from "vitest";
import { DUCK_BUSES, DUCK_RELEASE_HOLD_MS, NARRATION_DUCK, NarrationDucker, type DuckBus } from "../ducking";

interface Write {
  bus: DuckBus;
  factor: number;
  seconds: number;
}

function recorder() {
  const writes: Write[] = [];
  return {
    writes,
    applier: { setBusDuck: (bus: DuckBus, factor: number, seconds: number) => writes.push({ bus, factor, seconds }) },
  };
}

/** A hand-cranked scheduler, so the hold is tested without real time. */
function fakeTimers() {
  let next = 1;
  const jobs = new Map<number, () => void>();
  return {
    options: {
      schedule: (fn: () => void) => {
        const id = next++;
        jobs.set(id, fn);
        return id;
      },
      cancel: (handle: unknown) => {
        jobs.delete(handle as number);
      },
    },
    get pending() {
      return jobs.size;
    },
    flush() {
      const run = [...jobs.values()];
      jobs.clear();
      for (const fn of run) fn();
    },
  };
}

describe("the duck table", () => {
  it("never drops the engine below half, because it is the speed cue", () => {
    // Silencing the engine note is a gameplay change, not a mix change.
    expect(NARRATION_DUCK.engine.factor).toBeGreaterThanOrEqual(0.5);
  });

  it("only trims sfx, so a collision stays legible under the voice", () => {
    expect(NARRATION_DUCK.sfx.factor).toBeGreaterThan(0.7);
  });

  it("never ducks ui, because taps are feedback for the student's own finger", () => {
    expect(NARRATION_DUCK.ui.factor).toBe(1);
  });

  it("loses the music bed the most", () => {
    expect(NARRATION_DUCK.music.factor).toBeLessThan(NARRATION_DUCK.ambience.factor);
  });

  it("attacks faster than it releases on every bus it touches", () => {
    for (const bus of DUCK_BUSES) {
      const d = NARRATION_DUCK[bus];
      if (d.factor === 1) continue;
      expect(d.attack, bus).toBeLessThan(d.release);
    }
  });

  it("documents the reason next to every number", () => {
    for (const bus of DUCK_BUSES) expect(NARRATION_DUCK[bus].reason.length).toBeGreaterThan(20);
  });
});

describe("NarrationDucker", () => {
  it("writes every ducked bus once on engage, with its own attack time", () => {
    const { writes, applier } = recorder();
    const d = new NarrationDucker(applier);
    d.engage();
    expect(d.ducked).toBe(true);
    expect(writes.map((w) => w.bus).sort()).toEqual(["ambience", "engine", "music", "sfx"]);
    for (const w of writes) {
      expect(w.factor).toBe(NARRATION_DUCK[w.bus].factor);
      expect(w.seconds).toBe(NARRATION_DUCK[w.bus].attack);
    }
  });

  it("never writes the ui bus", () => {
    const { writes, applier } = recorder();
    const d = new NarrationDucker(applier);
    d.engage();
    d.releaseNow();
    expect(writes.some((w) => w.bus === "ui")).toBe(false);
  });

  it("ducks once for a three-cue scene, not three times", () => {
    const timers = fakeTimers();
    const { writes, applier } = recorder();
    const d = new NarrationDucker(applier, timers.options);

    d.engage(); // cue 1
    const afterFirst = writes.length;
    d.release(); // cue 1 ends
    d.engage(); // cue 2 starts inside the hold
    d.release();
    d.engage(); // cue 3
    expect(writes.length).toBe(afterFirst);
    expect(timers.pending).toBe(0); // the pending release was cancelled
    expect(d.ducked).toBe(true);

    d.release();
    expect(d.ducked).toBe(true); // still held
    timers.flush();
    expect(d.ducked).toBe(false);
    expect(writes.slice(afterFirst).every((w) => w.factor === 1)).toBe(true);
  });

  it("restores exactly 1 on release, with the release ramp", () => {
    const timers = fakeTimers();
    const { writes, applier } = recorder();
    const d = new NarrationDucker(applier, timers.options);
    d.engage();
    writes.length = 0;
    d.release();
    timers.flush();
    expect(writes).toHaveLength(4);
    for (const w of writes) {
      expect(w.factor).toBe(1);
      expect(w.seconds).toBe(NARRATION_DUCK[w.bus].release);
    }
  });

  it("releases immediately when a checkpoint opens", () => {
    const timers = fakeTimers();
    const { applier } = recorder();
    const d = new NarrationDucker(applier, timers.options);
    d.engage();
    d.releaseNow();
    expect(d.ducked).toBe(false);
    expect(timers.pending).toBe(0);
  });

  it("release() on an un-ducked mixer does nothing", () => {
    const { writes, applier } = recorder();
    const d = new NarrationDucker(applier);
    d.release();
    d.releaseNow();
    expect(writes).toHaveLength(0);
  });

  it("is a silent no-op with no applier — which is today's state", () => {
    const d = new NarrationDucker(null);
    expect(() => {
      d.engage();
      d.release();
      d.releaseNow();
      d.dispose();
    }).not.toThrow();
  });

  it("re-asserts the duck when the mixer arrives mid-scene", () => {
    const { writes, applier } = recorder();
    const d = new NarrationDucker(null);
    d.engage();
    expect(writes).toHaveLength(0);
    d.setApplier(applier);
    expect(writes).toHaveLength(4);
  });

  it("survives a mixer that throws", () => {
    const d = new NarrationDucker({
      setBusDuck: () => {
        throw new Error("no runtime");
      },
    });
    expect(() => d.engage()).not.toThrow();
    expect(d.ducked).toBe(true);
  });

  it("defaults to the documented 250 ms hold", () => {
    expect(DUCK_RELEASE_HOLD_MS).toBe(250);
    const schedule = vi.fn(() => 1);
    const d = new NarrationDucker(recorder().applier, { schedule, cancel: () => {} });
    d.engage();
    d.release();
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 250);
  });
});
