import { describe, expect, it } from "vitest";
import { nextTargetDifficulty } from "@/lib/engine/adaptive";
import type { Session } from "@/lib/types";
import {
  adaptationStory,
  conceptDelta,
  type ConceptOutcome,
  directionLabel,
  orderConceptsForStory,
  reviseNextSentence,
  runHeadline,
  stepRangeLabel,
} from "../run-story";

function concept(over: Partial<ConceptOutcome> & { conceptId: string }): ConceptOutcome {
  return { title: over.conceptId, answered: 1, correct: 1, followUpFixed: false, mastery: 50, label: "Developing", ...over };
}

describe("adaptationStory", () => {
  it("collapses a run of questions at the same difficulty into one step", () => {
    const steps = adaptationStory([
      { targetDifficulty: "easy", reason: "Starting at easy difficulty." },
      { targetDifficulty: "easy", reason: "Staying at easy difficulty." },
      { targetDifficulty: "medium", reason: "Two correct in a row, so we're stepping up to medium." },
      { targetDifficulty: "medium", reason: "Staying at medium difficulty." },
      { targetDifficulty: "easy", reason: "Two misses in a row, so the next question is a little easier." },
    ]);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({ from: 1, to: 2, difficulty: "easy", direction: "start" });
    expect(steps[1]).toMatchObject({ from: 3, to: 4, difficulty: "medium", direction: "up" });
    expect(steps[2]).toMatchObject({ from: 5, to: 5, difficulty: "easy", direction: "down" });
    // The kept reason is the one that explains arriving there.
    expect(steps[1].reason).toContain("stepping up to medium");
  });

  it("covers every question exactly once, with no gaps", () => {
    const notes = (["easy", "medium", "hard", "hard", "medium", "medium", "easy"] as const).map((d) => ({
      targetDifficulty: d,
      reason: `at ${d}`,
    }));
    const steps = adaptationStory(notes);
    expect(steps[0].from).toBe(1);
    expect(steps[steps.length - 1].to).toBe(notes.length);
    for (let i = 1; i < steps.length; i++) expect(steps[i].from).toBe(steps[i - 1].to + 1);
  });

  it("handles an empty and a single-note timeline", () => {
    expect(adaptationStory([])).toEqual([]);
    const one = adaptationStory([{ targetDifficulty: "medium", reason: "Starting at medium difficulty." }]);
    expect(one).toHaveLength(1);
    expect(stepRangeLabel(one[0])).toBe("Question 1");
  });

  it("labels ranges and directions in words, never by colour alone", () => {
    expect(stepRangeLabel({ from: 2, to: 4, difficulty: "easy", direction: "hold", reason: "" })).toBe("Questions 2–4");
    expect(directionLabel("start", "easy")).toBe("Started at easy");
    expect(directionLabel("up", "hard")).toBe("Stepped up to hard");
    expect(directionLabel("down", "medium")).toBe("Stepped back to medium");
    expect(directionLabel("hold", "medium")).toBe("Held at medium");
  });

  it("reads real engine reasons without rewriting them", () => {
    // Two unaided correct answers: the engine's own words are what the story shows.
    const session = {
      targetDifficulty: "easy",
      struggles: {},
      answers: [
        { questionId: "q1", conceptId: "c1", selectedOptionId: "a", isCorrect: true, isFollowUp: false, hintUsed: false, xpAwarded: 10, difficulty: "easy", answeredAt: "x" },
        { questionId: "q2", conceptId: "c2", selectedOptionId: "a", isCorrect: true, isFollowUp: false, hintUsed: false, xpAwarded: 10, difficulty: "easy", answeredAt: "x" },
      ],
    } as unknown as Session;
    const { target, reason } = nextTargetDifficulty(session);
    expect(target).toBe("medium");
    const steps = adaptationStory([
      { targetDifficulty: "easy", reason: "Starting at easy difficulty." },
      { targetDifficulty: target, reason },
    ]);
    expect(steps[1].direction).toBe("up");
    expect(steps[1].reason).toBe(reason);
  });
});

describe("conceptDelta", () => {
  it("is null when the server recorded no before-score, rather than inventing one", () => {
    expect(conceptDelta(concept({ conceptId: "a", mastery: 72 }))).toBeNull();
  });

  it("reports movement and whether the band changed", () => {
    const d = conceptDelta(concept({ conceptId: "a", mastery: 72, label: "Proficient", masteryBefore: 51, labelBefore: "Developing" }));
    expect(d).toEqual({ before: 51, after: 72, delta: 21, bandChanged: true });
    const flat = conceptDelta(concept({ conceptId: "b", mastery: 60, label: "Developing", masteryBefore: 64, labelBefore: "Developing" }));
    expect(flat).toEqual({ before: 64, after: 60, delta: -4, bandChanged: false });
  });
});

describe("orderConceptsForStory", () => {
  it("leads with mistakes that were fixed, then the most missed", () => {
    const rows = [
      concept({ conceptId: "clean", answered: 2, correct: 2, mastery: 80 }),
      concept({ conceptId: "missed-two", answered: 3, correct: 1, mastery: 40 }),
      concept({ conceptId: "fixed", answered: 2, correct: 1, followUpFixed: true, mastery: 55 }),
      concept({ conceptId: "missed-one", answered: 2, correct: 1, mastery: 30 }),
    ];
    expect(orderConceptsForStory(rows).map((c) => c.conceptId)).toEqual(["fixed", "missed-two", "missed-one", "clean"]);
  });
});

describe("runHeadline", () => {
  it("says nothing when nothing was answered", () => {
    expect(runHeadline([])).toContain("nothing to report");
  });

  it("never claims movement without before-scores", () => {
    const h = runHeadline([
      concept({ conceptId: "a", answered: 2, correct: 2 }),
      concept({ conceptId: "b", answered: 2, correct: 1 }),
    ]);
    expect(h).toBe("You worked on 2 concepts. 1 was answered without a miss.");
    expect(h).not.toMatch(/moved|up/);
  });

  it("reports movement once every concept has a before-score", () => {
    const h = runHeadline([
      concept({ conceptId: "a", answered: 2, correct: 2, mastery: 72, label: "Proficient", masteryBefore: 50, labelBefore: "Developing" }),
      concept({ conceptId: "b", answered: 2, correct: 1, mastery: 48, label: "Developing", masteryBefore: 52, labelBefore: "Developing" }),
    ]);
    expect(h).toBe("You worked on 2 concepts. 1 of 2 moved up, 1 into a new band.");
  });

  it("leads the fixed-mistake event, which is the point of the screen", () => {
    const h = runHeadline([concept({ conceptId: "a", answered: 2, correct: 1, followUpFixed: true })]);
    expect(h).toContain("You turned 1 mistake into a correct answer on the retry.");
  });
});

describe("reviseNextSentence", () => {
  it("names the concepts that were missed", () => {
    expect(
      reviseNextSentence([
        concept({ conceptId: "a", title: "Momentum", answered: 2, correct: 1 }),
        concept({ conceptId: "b", title: "Restitution", answered: 1, correct: 0 }),
        concept({ conceptId: "c", title: "Impulse", answered: 1, correct: 1 }),
      ]),
    ).toBe("Revise next: Momentum, Restitution.");
  });

  it("caps the list and counts the rest", () => {
    const rows = ["A", "B", "C", "D", "E"].map((t) => concept({ conceptId: t, title: t, answered: 1, correct: 0 }));
    expect(reviseNextSentence(rows)).toBe("Revise next: A, B, C and 2 more.");
  });

  it("is honest when there is nothing to revise", () => {
    expect(reviseNextSentence([concept({ conceptId: "a", answered: 2, correct: 2 })])).toContain("Nothing from this run needs another pass");
  });
});
