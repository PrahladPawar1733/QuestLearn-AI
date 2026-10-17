/**
 * The scene schema and its pure helpers: defaults, structural validation,
 * script tone/length linting, chapters, the scrub timeline, the transcript,
 * WebVTT, and the narration merge.
 *
 * The demo scene is checked here too, because it is the thing that ships
 * first: if the hand-authored content drifts out of spec, this fails rather
 * than a student meeting a dead transport bar.
 */
import { describe, expect, it } from "vitest";
import { DEMO_COLLISION_SCENE, DEMO_SCENES, findDemoScene } from "../demo-scene";
import { attachNarration, clipUrlResolver, detachNarration, sceneHasNarration, unavailableManifest } from "../generation";
import {
  assertValidScene,
  branchTarget,
  cueById,
  cueIndex,
  lintSceneScripts,
  nextCueIndex,
  sceneChapters,
  sceneTimeline,
  sceneToVtt,
  sceneTranscript,
  timelineSeek,
  validateScene,
  wordCount,
} from "../scene";
import { NarratedScene, defineScene, hasPlayableAudio, isCheckpointCue, parseScene, type NarratedSceneInput } from "../types";

const MINIMAL: NarratedSceneInput = {
  id: "scene__minimal",
  title: "Minimal",
  origin: "template",
  visual: { kind: "bounce", dropHeight: 2, e: 0.5 },
  cues: [{ kind: "narration", id: "only", text: "One line." }],
};

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

describe("NarratedScene schema", () => {
  it("degrades to a silent captioned slideshow: audio is never required", () => {
    const scene = defineScene(MINIMAL);
    const cue = scene.cues[0];
    expect(cue.kind).toBe("narration");
    expect(cue.text).toBe("One line.");
    expect(hasPlayableAudio(cue)).toBe(false);
    expect(sceneHasNarration(scene)).toBe(false);
  });

  it("applies the authoring defaults", () => {
    const scene = defineScene(MINIMAL);
    const cue = scene.cues[0];
    expect(cue.visual.mode).toBe("before");
    expect(scene.chapters).toEqual([]);
    if (cue.kind !== "narration") throw new Error("expected a narration cue");
    expect(cue.readMs).toBe(4200);
    expect(cue.terminal).toBe(false);
    expect(cue.remedial).toBe(false);
  });

  it("round-trips through parseScene (the generated-scene path)", () => {
    const scene = defineScene(MINIMAL);
    expect(parseScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  });

  it("rejects cue ids that are not kebab-case, so branch targets stay stable", () => {
    expect(() => defineScene({ ...MINIMAL, cues: [{ kind: "narration", id: "Not Kebab", text: "x" }] })).toThrow();
  });

  it("rejects an empty cue list and an empty caption", () => {
    expect(() => defineScene({ ...MINIMAL, cues: [] })).toThrow();
    expect(() => defineScene({ ...MINIMAL, cues: [{ kind: "narration", id: "a", text: "" }] })).toThrow();
  });

  it("reuses VisualSpec unchanged, discriminated union and all", () => {
    expect(NarratedScene.parse({ ...MINIMAL, visual: { kind: "collision-1d", m1: 1, m2: 2, u1: 3, u2: 0, e: 1 } }).visual.kind).toBe(
      "collision-1d",
    );
    expect(() => defineScene({ ...MINIMAL, visual: { kind: "nope" } as never })).toThrow();
  });

  it("has no answer key anywhere in a checkpoint prompt", () => {
    const scene = demoBranching();
    const cue = scene.cues.find(isCheckpointCue)!;
    expect(Object.keys(cue.prompt)).not.toContain("correctOptionId");
    expect(JSON.stringify(cue)).not.toMatch(/correctOption/i);
  });
});

/* ------------------------------------------------------------------ */
/* Graph traversal + validation                                        */
/* ------------------------------------------------------------------ */

function demoBranching() {
  return defineScene({
    id: "scene__branch",
    title: "Branching",
    origin: "template",
    visual: { kind: "bounce", dropHeight: 2, e: 0.5 },
    cues: [
      { kind: "narration", id: "intro", text: "Intro." },
      {
        kind: "checkpoint",
        id: "ask",
        text: "Your turn.",
        prompt: { questionId: "q1", text: "Which one?", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }] },
        branch: { correct: "yes", wrong: "no" },
      },
      { kind: "narration", id: "yes", text: "Correct path." },
      { kind: "narration", id: "end", text: "Both paths land here.", terminal: true },
      { kind: "narration", id: "no", text: "Remedial.", remedial: true, goto: "end" },
    ],
  });
}

describe("scene graph", () => {
  it("resolves successors by terminal, then goto, then array order", () => {
    const s = demoBranching();
    expect(nextCueIndex(s, 0)).toBe(1); // array order
    expect(nextCueIndex(s, 1)).toBeNull(); // a checkpoint has no linear successor
    expect(nextCueIndex(s, 3)).toBeNull(); // terminal
    expect(nextCueIndex(s, 4)).toBe(3); // goto
  });

  it("resolves both branches", () => {
    const s = demoBranching();
    expect(branchTarget(s, 1, true)).toBe(cueIndex(s, "yes"));
    expect(branchTarget(s, 1, false)).toBe(cueIndex(s, "no"));
    expect(branchTarget(s, 0, true)).toBeNull();
    expect(cueById(s, "yes")?.text).toBe("Correct path.");
    expect(cueById(s, "ghost")).toBeNull();
  });

  it("accepts a well-formed branching scene", () => {
    expect(validateScene(demoBranching())).toEqual([]);
  });

  it("catches a branch target that does not exist", () => {
    const s = demoBranching();
    const broken = { ...s, cues: s.cues.map((c) => (c.id === "ask" ? { ...c, branch: { correct: "yes", wrong: "ghost" } } : c)) };
    const codes = validateScene(broken as typeof s).map((i) => i.code);
    expect(codes).toContain("missing-branch-target");
  });

  it("catches a goto target that does not exist", () => {
    const s = demoBranching();
    const broken = { ...s, cues: s.cues.map((c) => (c.id === "no" ? { ...c, goto: "ghost" } : c)) };
    expect(validateScene(broken as typeof s).map((i) => i.code)).toContain("missing-goto-target");
  });

  it("catches a cue nothing can reach", () => {
    const s = defineScene({
      ...MINIMAL,
      cues: [
        { kind: "narration", id: "a", text: "A.", terminal: true },
        { kind: "narration", id: "orphan", text: "Nobody gets here." },
      ],
    });
    expect(validateScene(s).map((i) => i.code)).toContain("unreachable-cue");
  });

  it("catches a loop that never ends", () => {
    const s = defineScene({
      ...MINIMAL,
      cues: [
        { kind: "narration", id: "a", text: "A.", goto: "b" },
        { kind: "narration", id: "b", text: "B.", goto: "a" },
      ],
    });
    expect(validateScene(s).map((i) => i.code)).toContain("dead-end");
  });

  it("catches duplicate cue ids", () => {
    const s = defineScene({
      ...MINIMAL,
      cues: [
        { kind: "narration", id: "a", text: "A." },
        { kind: "narration", id: "a", text: "Also a.", terminal: true },
      ],
    });
    expect(validateScene(s).map((i) => i.code)).toContain("duplicate-cue-id");
  });

  it("refuses a checkpoint whose diagram would show the answer", () => {
    const s = demoBranching();
    const leaky = {
      ...s,
      cues: s.cues.map((c) => (c.id === "ask" ? { ...c, visual: { ...c.visual, mode: "full" as const } } : c)),
    };
    expect(validateScene(leaky as typeof s).map((i) => i.code)).toContain("checkpoint-reveals-answer");
  });

  it("assertValidScene throws with every issue listed", () => {
    const s = defineScene({
      ...MINIMAL,
      cues: [{ kind: "narration", id: "a", text: "A.", goto: "ghost" }],
    });
    expect(() => assertValidScene(s)).toThrow(/missing-goto-target/);
  });
});

/* ------------------------------------------------------------------ */
/* Script lint                                                         */
/* ------------------------------------------------------------------ */

describe("script lint", () => {
  it("counts words the way the 25-word rule means", () => {
    expect(wordCount("  one   two three ")).toBe(3);
  });

  it("rejects praise, exclamation marks and over-long spoken lines", () => {
    const s = defineScene({
      ...MINIMAL,
      cues: [
        { kind: "narration", id: "praise", text: "Great job, you got this." },
        { kind: "narration", id: "shout", text: "Watch out!" },
        { kind: "narration", id: "long", text: Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "), terminal: true },
      ],
    });
    const byCue = Object.fromEntries(lintSceneScripts(s).map((i) => [`${i.cueId}:${i.code}`, i.message]));
    expect(Object.keys(byCue)).toContain("praise:tone");
    expect(Object.keys(byCue)).toContain("shout:exclamation");
    expect(Object.keys(byCue)).toContain("long:too-long");
  });

  it("exempts a question stem from the word limit but not from the tone rules", () => {
    const s = demoBranching();
    const long = {
      ...s,
      cues: s.cues.map((c) =>
        isCheckpointCue(c) ? { ...c, prompt: { ...c.prompt, text: Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ") } } : c,
      ),
    };
    // The stem is read, not spoken, so its length is irrelevant.
    expect(lintSceneScripts(long as typeof s)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Chapters, timeline, transcript, VTT                                 */
/* ------------------------------------------------------------------ */

describe("chapters", () => {
  it("derives one chapter per concept run, skipping remedial cues", () => {
    const s = defineScene({
      ...MINIMAL,
      cues: [
        { kind: "narration", id: "a", text: "A.", conceptId: "c1", conceptTitle: "One" },
        { kind: "narration", id: "b", text: "B.", conceptId: "c1", conceptTitle: "One" },
        { kind: "narration", id: "c", text: "C.", conceptId: "c2", conceptTitle: "Two", terminal: true },
        { kind: "narration", id: "r", text: "R.", conceptId: "c3", conceptTitle: "Three", remedial: true, goto: "c" },
      ],
    });
    expect(sceneChapters(s).map((c) => c.title)).toEqual(["One", "Two"]);
  });

  it("prefers authored chapters", () => {
    expect(sceneChapters(DEMO_COLLISION_SCENE)).toBe(DEMO_COLLISION_SCENE.chapters);
  });
});

describe("timeline", () => {
  const scene = demoBranching();
  const durationOf = () => 1000;

  it("covers the main path only and makes a checkpoint a zero-length marker", () => {
    const t = sceneTimeline(scene, durationOf);
    expect(t.entries.map((e) => e.cueId)).toEqual(["intro", "ask", "yes", "end"]);
    expect(t.entries[1].durationMs).toBe(0);
    expect(t.totalMs).toBe(3000);
  });

  it("maps a scrub position onto a cue and an offset inside it", () => {
    const t = sceneTimeline(scene, durationOf);
    expect(timelineSeek(t, 0)).toEqual({ index: 0, offsetMs: 0 });
    expect(timelineSeek(t, 1500)).toEqual({ index: cueIndex(scene, "yes"), offsetMs: 500 });
    expect(timelineSeek(t, 99_999)).toEqual({ index: cueIndex(scene, "end"), offsetMs: 1000 });
    expect(timelineSeek(t, -5)).toEqual({ index: 0, offsetMs: 0 });
  });
});

describe("transcript and captions", () => {
  it("lists every cue in array order, labelled", () => {
    const lines = sceneTranscript(demoBranching());
    expect(lines.map((l) => l.cueId)).toEqual(["intro", "ask", "yes", "end", "no"]);
    expect(lines.find((l) => l.cueId === "ask")?.kind).toBe("checkpoint");
    expect(lines.find((l) => l.cueId === "no")?.remedial).toBe(true);
  });

  it("serialises to WebVTT with contiguous cue times", () => {
    const vtt = sceneToVtt(demoBranching(), () => 2000);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.000");
    expect(vtt).toContain("00:00:02.000 --> 00:00:04.000");
    // The zero-length checkpoint marker is not a caption.
    expect(vtt).not.toContain("Your turn.");
  });
});

/* ------------------------------------------------------------------ */
/* Narration merge (the server seam)                                   */
/* ------------------------------------------------------------------ */

describe("attachNarration", () => {
  const scene = demoBranching();

  it("only ever adds audio; the scene is a lesson before and after", () => {
    const withAudio = attachNarration(scene, {
      sceneId: scene.id,
      status: "partial",
      clips: [
        { cueId: "intro", assetId: "narration__q__scene--a--0", url: "/a.wav", durationMs: 7000, status: "ready" },
        { cueId: "yes", assetId: "narration__q__scene--a--1", status: "unavailable" },
      ],
    });
    expect(withAudio).not.toBe(scene);
    expect(withAudio.cues.map((c) => c.text)).toEqual(scene.cues.map((c) => c.text));
    expect(hasPlayableAudio(withAudio.cues[0])).toBe(true);
    // `unavailable` is attached but never playable — captions, no error UI.
    expect(hasPlayableAudio(withAudio.cues[cueIndex(scene, "yes")])).toBe(false);
    expect(sceneHasNarration(withAudio)).toBe(true);
    expect(clipUrlResolver(withAudio)("intro")).toBe("/a.wav");
    expect(clipUrlResolver(withAudio)("yes")).toBeNull();
  });

  it("is a no-op for an empty or missing manifest", () => {
    expect(attachNarration(scene, null)).toBe(scene);
    expect(attachNarration(scene, unavailableManifest(scene))).toBe(scene);
  });

  it("never attaches audio to a checkpoint", () => {
    const merged = attachNarration(scene, {
      sceneId: scene.id,
      status: "ready",
      clips: [{ cueId: "ask", assetId: "x", url: "/x.wav", status: "ready" }],
    });
    expect(merged).toBe(scene);
  });

  it("detaches back to caption-only", () => {
    const withAudio = attachNarration(scene, {
      sceneId: scene.id,
      status: "ready",
      clips: [{ cueId: "intro", assetId: "x", url: "/x.wav", status: "ready" }],
    });
    expect(sceneHasNarration(detachNarration(withAudio))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The shipped demo scene                                              */
/* ------------------------------------------------------------------ */

describe("the demo collisions scene", () => {
  const scene = DEMO_COLLISION_SCENE;

  it("is structurally valid", () => {
    expect(validateScene(scene)).toEqual([]);
  });

  it("passes the tone and length lint", () => {
    expect(lintSceneScripts(scene)).toEqual([]);
  });

  it("is labelled as prepared demo content, never as AI output", () => {
    expect(scene.origin).toBe("demo_prepared");
  });

  it("ships with no audio at all, and plays anyway", () => {
    expect(sceneHasNarration(scene)).toBe(false);
    expect(scene.cues.every((c) => c.kind !== "narration" || c.audio === undefined)).toBe(true);
  });

  it("teaches both collision types and asks about the inelastic case", () => {
    const concepts = new Set(scene.cues.map((c) => c.conceptId));
    expect(concepts).toContain("demo-c-elastic");
    expect(concepts).toContain("demo-c-inelastic");
    const checkpoints = scene.cues.filter(isCheckpointCue);
    expect(checkpoints).toHaveLength(1);
    // The real demo question id, so the server scores it against the stored key.
    expect(checkpoints[0].prompt.questionId).toBe("demo-q07");
    expect(checkpoints[0].prompt.options).toHaveLength(4);
  });

  it("asks before it reveals: the checkpoint precedes the answer cue", () => {
    const ask = cueIndex(scene, "checkpoint-common-v");
    expect(ask).toBeGreaterThan(-1);
    expect(cueIndex(scene, "stick-result")).toBeGreaterThan(ask);
  });

  it("re-converges after a wrong answer instead of ending the lesson", () => {
    const ask = scene.cues.filter(isCheckpointCue)[0];
    const remedialStart = cueIndex(scene, ask.branch.wrong);
    expect(remedialStart).toBeGreaterThan(-1);
    const remedial = scene.cues[remedialStart];
    expect(remedial.kind === "narration" && remedial.remedial).toBe(true);
    // Walk the wrong branch and confirm it rejoins the main path.
    const seen: string[] = [];
    let at: number | null = remedialStart;
    while (at !== null && seen.length < 20) {
      seen.push(scene.cues[at].id);
      at = nextCueIndex(scene, at);
    }
    expect(seen).toContain("after-bars");
    expect(seen.at(-1)).toBe("verdict");
  });

  it("keeps the three chapters a student navigates by", () => {
    expect(sceneChapters(scene).map((c) => c.conceptId)).toEqual([
      "demo-c-conservation",
      "demo-c-elastic",
      "demo-c-inelastic",
    ]);
  });

  it("spells numbers out, because the digits are already in the diagram", () => {
    const narration = scene.cues.filter((c) => c.kind === "narration");
    for (const cue of narration) {
      expect(cue.text, `cue ${cue.id} has digits in a spoken line`).not.toMatch(/\d/);
    }
  });

  it("exposes a lookup for the scenes that need no server at all", () => {
    expect(DEMO_SCENES).toHaveLength(1);
    expect(findDemoScene(scene.id)).toBe(scene);
    expect(findDemoScene("nope")).toBeNull();
  });
});
