/**
 * `ScenePlayer` state machine.
 *
 * Runs in `environment: "node"` with no DOM and no audio: the clock is a
 * plain number and the audio sink is a fake that reports fixed durations.
 * That is the point of the player being framework-agnostic — every rule about
 * cue advance, checkpoint pausing, branching and seeking is checkable here.
 */
import { describe, expect, it, vi } from "vitest";
import { attachNarration } from "../generation";
import { ScenePlayer, createSilentSceneAudio, type ScenePlayerAudio, type ScenePlayerEvent } from "../player";
import { defineScene, type NarratedScene } from "../types";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function fixture(): NarratedScene {
  return defineScene({
    id: "scene__test",
    title: "Test scene",
    origin: "template",
    visual: { kind: "momentum-bars", items: [{ label: "p", value: 1 }] },
    cues: [
      { kind: "narration", id: "a", text: "First line.", readMs: 1000, conceptId: "c1", conceptTitle: "One" },
      { kind: "narration", id: "b", text: "Second line.", readMs: 2000, conceptId: "c1", conceptTitle: "One" },
      {
        kind: "checkpoint",
        id: "q",
        text: "Your turn.",
        conceptId: "c2",
        conceptTitle: "Two",
        prompt: {
          questionId: "qq",
          text: "Which way does the pair end up moving?",
          options: [
            { id: "A", text: "Left" },
            { id: "B", text: "Right" },
          ],
        },
        branch: { correct: "good", wrong: "fix" },
      },
      { kind: "narration", id: "good", text: "Main path.", readMs: 1000, conceptId: "c2", conceptTitle: "Two", terminal: true },
      { kind: "narration", id: "fix", text: "Remedial line.", readMs: 1000, conceptId: "c2", conceptTitle: "Two", remedial: true, goto: "good" },
    ],
  });
}

const settled = (correct: boolean) => ({
  correct,
  selectedOptionId: correct ? "B" : "A",
  correctOptionId: "B",
  explanation: "Momentum keeps the sign.",
});

interface FakeAudio extends ScenePlayerAudio {
  readonly played: { cueId: string; offsetMs: number; rate: number }[];
  readonly stops: { count: number };
  readonly preloaded: string[];
}

function fakeAudio(durations: Record<string, number> = {}): FakeAudio {
  const played: { cueId: string; offsetMs: number; rate: number }[] = [];
  const stops = { count: 0 };
  const preloaded: string[] = [];
  return {
    played,
    stops,
    preloaded,
    durationOf: (id) => durations[id] ?? null,
    play: (cueId, { rate, offsetMs }) => played.push({ cueId, rate, offsetMs }),
    stop: () => {
      stops.count++;
    },
    setRate: () => {},
    preload: (ids) => preloaded.push(...ids),
  };
}

/** Steps the clock in <= MAX_TICK_MS slices, so nothing is clamped away. */
function clock(player: ScenePlayer) {
  let t = 0;
  return {
    advance(ms: number, step = 100) {
      player.tick(t); // priming tick; a no-op once primed (delta 0)
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + step);
        player.tick(t);
      }
    },
    jump(ms: number) {
      player.tick(t);
      t += ms;
      player.tick(t);
    },
  };
}

/* ------------------------------------------------------------------ */

describe("ScenePlayer — starting state", () => {
  it("starts idle on the first cue and has touched no audio", () => {
    const audio = fakeAudio();
    const p = new ScenePlayer(fixture(), { audio });
    const s = p.getSnapshot();
    expect(s.status).toBe("idle");
    expect(s.cueIndex).toBe(0);
    expect(s.caption).toBe("First line.");
    expect(audio.played).toHaveLength(0);
  });

  it("returns a referentially stable snapshot until something changes", () => {
    const p = new ScenePlayer(fixture());
    const first = p.getSnapshot();
    expect(p.getSnapshot()).toBe(first);
    p.play();
    expect(p.getSnapshot()).not.toBe(first);
  });

  it("can start at a chapter deep link", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "b" });
    expect(p.getSnapshot().cueIndex).toBe(1);
  });

  it("never plays audio without the gesture flag, even with clips present", () => {
    const audio = fakeAudio({ a: 2 });
    const scene = attachNarration(fixture(), {
      sceneId: "scene__test",
      status: "ready",
      clips: [{ cueId: "a", assetId: "n1", url: "/a.wav", status: "ready" }],
    });
    const p = new ScenePlayer(scene, { audio });
    p.play();
    expect(p.getSnapshot().status).toBe("playing");
    expect(p.getSnapshot().audioAllowed).toBe(false);
    expect(audio.played).toHaveLength(0);
  });
});

describe("ScenePlayer — cue advance without audio", () => {
  it("advances on the authored readMs when auto-advance is on", () => {
    const p = new ScenePlayer(fixture());
    const c = clock(p);
    p.play();
    c.advance(900);
    expect(p.getSnapshot().cueIndex).toBe(0);
    c.advance(200);
    expect(p.getSnapshot().cueIndex).toBe(1);
    expect(p.getSnapshot().caption).toBe("Second line.");
  });

  it("carries the overshoot into the next cue, so cues are gapless", () => {
    const p = new ScenePlayer(fixture());
    const c = clock(p);
    p.play();
    // 240 ms frames, so the boundary is crossed mid-frame: 1200 ms of media
    // time lands 200 ms into cue b rather than resetting it to zero.
    c.advance(1200, 240);
    const s = p.getSnapshot();
    expect(s.cueIndex).toBe(1);
    expect(s.elapsedInCueMs).toBeCloseTo(200, 0);
  });

  it("parks in `waiting` instead of advancing when auto-advance is off", () => {
    const p = new ScenePlayer(fixture(), { autoAdvanceWithoutAudio: false });
    const c = clock(p);
    p.play();
    c.advance(1500);
    const s = p.getSnapshot();
    expect(s.status).toBe("waiting");
    expect(s.cueIndex).toBe(0);
    expect(s.cueProgress).toBe(1);
    p.next();
    expect(p.getSnapshot().cueIndex).toBe(1);
    expect(p.getSnapshot().status).toBe("playing");
  });

  it("honours prefers-reduced-motion by refusing silent auto-advance", () => {
    const p = new ScenePlayer(fixture(), { reducedMotion: true, autoAdvanceWithoutAudio: true });
    expect(p.getSnapshot().autoAdvanceWithoutAudio).toBe(false);
    const c = clock(p);
    p.play();
    c.advance(5000);
    expect(p.getSnapshot().cueIndex).toBe(0);
    expect(p.getSnapshot().status).toBe("waiting");
    // And it cannot be switched back on while reduced motion is set.
    p.setAutoAdvanceWithoutAudio(true);
    expect(p.getSnapshot().autoAdvanceWithoutAudio).toBe(false);
    p.setReducedMotion(false);
    p.setAutoAdvanceWithoutAudio(true);
    expect(p.getSnapshot().autoAdvanceWithoutAudio).toBe(true);
  });

  it("applies the speed control to media time", () => {
    const p = new ScenePlayer(fixture(), { rate: 2 });
    const c = clock(p);
    p.play();
    c.advance(600);
    // 600 ms of wall time is 1200 ms of media time at 2x, so cue 0 (1000 ms)
    // is already finished.
    expect(p.getSnapshot().cueIndex).toBe(1);
  });

  it("clamps a long frame gap so a backgrounded tab cannot skip the lesson", () => {
    const p = new ScenePlayer(fixture());
    const c = clock(p);
    p.play();
    c.jump(60_000);
    // One 60 s gap is worth at most MAX_TICK_MS of media time.
    expect(p.getSnapshot().cueIndex).toBe(0);
    expect(p.getSnapshot().elapsedInCueMs).toBeLessThanOrEqual(250);
  });

  it("pause stops the clock and the sink; play resumes where it stopped", () => {
    const audio = fakeAudio();
    const p = new ScenePlayer(fixture(), { audio });
    const c = clock(p);
    p.play();
    c.advance(500);
    p.pause();
    const stopsAtPause = audio.stops.count;
    expect(stopsAtPause).toBeGreaterThan(0);
    c.advance(5000);
    expect(p.getSnapshot().cueIndex).toBe(0);
    expect(p.getSnapshot().elapsedInCueMs).toBeCloseTo(500, 0);
    p.play();
    c.advance(600);
    expect(p.getSnapshot().cueIndex).toBe(1);
  });
});

describe("ScenePlayer — cue advance driven by real audio duration", () => {
  const withClips = () =>
    attachNarration(fixture(), {
      sceneId: "scene__test",
      status: "ready",
      clips: [
        { cueId: "a", assetId: "n1", url: "/a.wav", status: "ready", durationMs: 9999 },
        { cueId: "b", assetId: "n2", url: "/b.wav", status: "ready" },
      ],
    });

  it("uses AudioBuffer.duration, not readMs and not the manifest hint", () => {
    // The clip is 0.4 s; readMs says 1000 and the manifest hint says 9999.
    const audio = fakeAudio({ a: 0.4 });
    const p = new ScenePlayer(withClips(), { audio, audioAllowed: true });
    expect(p.getSnapshot().cueDurationMs).toBe(400);
    const c = clock(p);
    p.play();
    expect(audio.played[0]).toEqual({ cueId: "a", rate: 1, offsetMs: 0 });
    c.advance(300);
    expect(p.getSnapshot().cueIndex).toBe(0);
    c.advance(200);
    expect(p.getSnapshot().cueIndex).toBe(1);
  });

  it("falls back to the manifest hint while a clip is still decoding", () => {
    const audio = fakeAudio(); // nothing decoded yet
    const p = new ScenePlayer(withClips(), { audio, audioAllowed: true });
    expect(p.getSnapshot().cueDurationMs).toBe(9999);
    // Cue "b" has a clip but no hint, so it falls all the way back to readMs.
    p.seekToCue("b");
    expect(p.getSnapshot().cueDurationMs).toBe(2000);
  });

  it("paces by readMs when audio exists but is not allowed to play", () => {
    const audio = fakeAudio({ a: 0.4 });
    const p = new ScenePlayer(withClips(), { audio });
    expect(p.getSnapshot().hasAudio).toBe(true);
    expect(p.getSnapshot().audioDriven).toBe(false);
    expect(p.getSnapshot().cueDurationMs).toBe(1000);
    p.setAudioAllowed(true);
    expect(p.getSnapshot().cueDurationMs).toBe(400);
  });

  it("auto-advances an audio cue even when silent auto-advance is off", () => {
    const audio = fakeAudio({ a: 0.4 });
    const p = new ScenePlayer(withClips(), { audio, audioAllowed: true, autoAdvanceWithoutAudio: false });
    const c = clock(p);
    p.play();
    c.advance(500);
    // Stopping between two clips would sound broken, so audio always advances.
    expect(p.getSnapshot().cueIndex).toBe(1);
  });

  it("asks the sink to preload the current cue and what comes next", () => {
    const audio = fakeAudio({ a: 0.4 });
    const p = new ScenePlayer(withClips(), { audio, audioAllowed: true });
    p.play();
    expect(audio.preloaded).toContain("a");
    expect(audio.preloaded).toContain("b");
  });
});

describe("ScenePlayer — checkpoints", () => {
  it("stops playback dead on reaching a checkpoint", () => {
    const audio = fakeAudio();
    const p = new ScenePlayer(fixture(), { audio });
    const events: ScenePlayerEvent[] = [];
    p.subscribe((e) => events.push(e));
    const c = clock(p);
    p.play();
    c.advance(3100); // past cue a (1000) and cue b (2000)
    const s = p.getSnapshot();
    expect(s.status).toBe("checkpoint");
    expect(s.cueIndex).toBe(2);
    expect(s.checkpoint?.prompt.questionId).toBe("qq");
    expect(events.some((e) => e.type === "checkpoint")).toBe(true);
    expect(audio.stops.count).toBeGreaterThan(0);
  });

  it("refuses next() and play() while a checkpoint is open", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "q" });
    expect(p.getSnapshot().status).toBe("checkpoint");
    p.next();
    p.play();
    expect(p.getSnapshot().cueIndex).toBe(2);
    expect(p.getSnapshot().status).toBe("checkpoint");
    expect(p.getSnapshot().canNext).toBe(false);
  });

  it("takes the correct branch on a settled correct answer", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "q" });
    const events: ScenePlayerEvent[] = [];
    p.subscribe((e) => events.push(e));
    p.resolveCheckpoint(settled(true));
    const s = p.getSnapshot();
    expect(s.cue.id).toBe("good");
    expect(s.status).toBe("playing");
    expect(s.answers).toEqual([{ cueId: "q", questionId: "qq", outcome: "correct" }]);
    expect(events.find((e) => e.type === "branch")).toMatchObject({ from: "q", to: "good", outcome: "correct" });
  });

  it("takes the remedial branch on a wrong answer and re-converges", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "q" });
    p.resolveCheckpoint(settled(false));
    expect(p.getSnapshot().cue.id).toBe("fix");
    expect(p.getSnapshot().answers[0].outcome).toBe("wrong");
    const c = clock(p);
    c.advance(1100);
    // `fix` has goto: "good" — a wrong answer costs a detour, not an exit.
    expect(p.getSnapshot().cue.id).toBe("good");
  });

  it("follows the main path on a skip, and records it as skipped", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "q" });
    p.skipCheckpoint();
    expect(p.getSnapshot().cue.id).toBe("good");
    expect(p.getSnapshot().answers[0].outcome).toBe("skipped");
  });

  it("ignores a settlement when no checkpoint is open", () => {
    const p = new ScenePlayer(fixture());
    p.resolveCheckpoint(settled(true));
    expect(p.getSnapshot().cueIndex).toBe(0);
    expect(p.getSnapshot().answers).toHaveLength(0);
  });
});

describe("ScenePlayer — seeking", () => {
  it("seeks by cue id and by index", () => {
    const p = new ScenePlayer(fixture());
    p.seekToCue("b");
    expect(p.getSnapshot().cueIndex).toBe(1);
    p.seekToCue(0);
    expect(p.getSnapshot().cueIndex).toBe(0);
  });

  it("ignores an unknown cue id", () => {
    const p = new ScenePlayer(fixture());
    p.seekToCue("nope");
    expect(p.getSnapshot().cueIndex).toBe(0);
  });

  it("seeking into a checkpoint opens it", () => {
    const p = new ScenePlayer(fixture());
    p.seekToCue("q");
    expect(p.getSnapshot().status).toBe("checkpoint");
  });

  it("scrubs on the main-path timeline and excludes remedial cues", () => {
    const p = new ScenePlayer(fixture());
    // Main path: a (1000) + b (2000) + checkpoint (0) + good (1000) = 4000.
    expect(p.getSnapshot().timelineTotalMs).toBe(4000);
    expect(p.timeline().entries.map((e) => e.cueId)).toEqual(["a", "b", "q", "good"]);
    p.seekToTime(1500);
    expect(p.getSnapshot().cue.id).toBe("b");
    expect(p.getSnapshot().elapsedInCueMs).toBe(500);
    p.scrub(1);
    expect(p.getSnapshot().cue.id).toBe("good");
  });

  it("restarts a clip from the seek offset", () => {
    const audio = fakeAudio({ b: 2 });
    const scene = attachNarration(fixture(), {
      sceneId: "scene__test",
      status: "ready",
      clips: [{ cueId: "b", assetId: "n2", url: "/b.wav", status: "ready" }],
    });
    const p = new ScenePlayer(scene, { audio, audioAllowed: true });
    p.play();
    p.seekToCue("b", 750);
    expect(audio.played.at(-1)).toEqual({ cueId: "b", rate: 1, offsetMs: 750 });
  });
});

describe("ScenePlayer — previous()", () => {
  it("steps back through history, including out of a branch", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "q" });
    p.resolveCheckpoint(settled(false));
    expect(p.getSnapshot().cue.id).toBe("fix");
    p.previous();
    // Back to the checkpoint we came through, not to index-1.
    expect(p.getSnapshot().cue.id).toBe("q");
    expect(p.getSnapshot().status).toBe("checkpoint");
  });

  it("restarts the current cue when you are already well into it", () => {
    const p = new ScenePlayer(fixture());
    const c = clock(p);
    p.play();
    c.advance(1000); // -> cue b
    c.advance(1600); // 1600 ms into cue b (> 1500 ms threshold)
    expect(p.getSnapshot().cue.id).toBe("b");
    p.previous();
    expect(p.getSnapshot().cue.id).toBe("b");
    expect(p.getSnapshot().elapsedInCueMs).toBe(0);
    p.previous();
    expect(p.getSnapshot().cue.id).toBe("a");
  });
});

describe("ScenePlayer — the end", () => {
  it("ends on a terminal cue and emits once", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "good" });
    const events: ScenePlayerEvent[] = [];
    p.subscribe((e) => events.push(e));
    const c = clock(p);
    p.play();
    c.advance(1200);
    expect(p.getSnapshot().status).toBe("ended");
    expect(events.filter((e) => e.type === "ended")).toHaveLength(1);
  });

  it("does not fall through a terminal cue into the remedial block", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "good" });
    p.next();
    expect(p.getSnapshot().status).toBe("ended");
    expect(p.getSnapshot().cue.id).toBe("good");
  });

  it("play() after the end restarts from the top", () => {
    const p = new ScenePlayer(fixture(), { startCueId: "good" });
    p.next();
    expect(p.getSnapshot().status).toBe("ended");
    p.play();
    expect(p.getSnapshot().cueIndex).toBe(0);
    expect(p.getSnapshot().status).toBe("playing");
  });
});

describe("ScenePlayer — hygiene", () => {
  it("records every cue visited, once", () => {
    const p = new ScenePlayer(fixture());
    p.seekToCue("b");
    p.seekToCue("a");
    p.seekToCue("b");
    expect(p.getSnapshot().visited).toEqual(["a", "b"]);
  });

  it("survives a subscriber that throws", () => {
    const p = new ScenePlayer(fixture());
    p.subscribe(() => {
      throw new Error("broken listener");
    });
    expect(() => p.play()).not.toThrow();
    expect(p.getSnapshot().status).toBe("playing");
  });

  it("unsubscribes cleanly and stops after dispose", () => {
    const p = new ScenePlayer(fixture());
    const seen = vi.fn();
    const off = p.subscribe(seen);
    p.play();
    expect(seen).toHaveBeenCalled();
    off();
    const before = seen.mock.calls.length;
    p.pause();
    expect(seen.mock.calls.length).toBe(before);
    p.dispose();
    p.play();
    expect(p.getSnapshot().status).toBe("paused");
  });

  it("clamps the rate to a sane range", () => {
    const p = new ScenePlayer(fixture());
    p.setRate(99);
    expect(p.getSnapshot().rate).toBe(2);
    p.setRate(0.01);
    expect(p.getSnapshot().rate).toBe(0.5);
    p.setRate(Number.NaN);
    expect(p.getSnapshot().rate).toBe(1);
  });

  it("the silent sink is a complete no-op", () => {
    const sink = createSilentSceneAudio();
    expect(sink.durationOf("a")).toBeNull();
    expect(() => {
      sink.play("a", { rate: 1, offsetMs: 0 });
      sink.stop();
      sink.setRate(2);
    }).not.toThrow();
  });
});
