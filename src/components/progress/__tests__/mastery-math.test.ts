import { describe, expect, it } from "vitest";
import {
  applyResult,
  computeMastery,
  emptyMastery,
  MASTERY_CONFIG,
  masteryLabel,
  type MasteryLabel,
} from "@/lib/engine/mastery";
import type { Difficulty, MasteryResult } from "@/lib/types";
import {
  daysSince,
  DIFFICULTIES,
  formatDuration,
  hasTrend,
  humanizeMisconception,
  LABEL_ORDER,
  lastPractisedLabel,
  masteryTimeline,
  MIN_TREND_POINTS,
  nextLabelUp,
  nextStepSentence,
  overallStatement,
  projectMastery,
  reachableCeiling,
  recurringMisconceptions,
  requirementFor,
  revisionOrder,
  timeOnTask,
  trendSummary,
} from "../mastery-math";

const AT = "2026-10-01T10:00:00.000Z";

function result(correct: boolean, opts: Partial<MasteryResult> = {}): MasteryResult {
  return { correct, followUp: false, hint: false, difficulty: "medium", at: AT, ...opts };
}

/** Replay a history through the *real* engine, exactly as the app would. */
function replay(history: MasteryResult[]) {
  let m = emptyMastery("u1", { id: "c1", title: "C", subject: "Physics", questId: "q1" }, AT);
  for (const r of history) m = applyResult(m, r);
  return m;
}

function rank(l: MasteryLabel) {
  return LABEL_ORDER.indexOf(l);
}

/** Every history we project over, including awkward and empty ones. */
const HISTORIES: { name: string; history: MasteryResult[] }[] = [
  { name: "no practice", history: [] },
  { name: "one wrong", history: [result(false)] },
  { name: "one correct", history: [result(true)] },
  { name: "one correct with a hint", history: [result(true, { hint: true })] },
  { name: "two correct", history: [result(true), result(true)] },
  { name: "three correct", history: [result(true), result(true), result(true)] },
  { name: "four correct hard", history: Array.from({ length: 4 }, () => result(true, { difficulty: "hard" })) },
  { name: "all wrong", history: Array.from({ length: 5 }, () => result(false)) },
  { name: "wrong then fixed on a follow-up", history: [result(false), result(true, { followUp: true })] },
  { name: "mixed six", history: [result(true), result(false), result(true), result(true), result(false), result(true)] },
  { name: "long run of twelve", history: Array.from({ length: 12 }, (_, i) => result(i % 3 !== 0)) },
  {
    name: "eight correct hard follow-ups",
    history: Array.from({ length: 8 }, () => result(true, { difficulty: "hard", followUp: true })),
  },
];

describe("projectMastery agrees with the real mastery engine", () => {
  for (const { name, history } of HISTORIES) {
    it(`reports the engine's own score and label for: ${name}`, () => {
      const m = replay(history);
      const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
      expect(p.score).toBe(m.masteryScore);
      expect(p.score).toBe(computeMastery(m.recentResults));
      expect(p.label).toBe(masteryLabel(m.masteryScore, m.attempts));
      expect(p.attempts).toBe(m.attempts);
    });

    it(`promises only reachable targets for: ${name}`, () => {
      const m = replay(history);
      const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
      if (!p.target) {
        expect(p.label === "Mastered" || m.attempts === 0).toBe(true);
        return;
      }
      for (const d of DIFFICULTIES) {
        const k = p.answersNeeded[d];
        if (k == null) continue;
        // Apply exactly k hint-free correct answers at this difficulty through the real engine.
        let after = m;
        for (let i = 0; i < k; i++) after = applyResult(after, result(true, { difficulty: d }));
        const reached = masteryLabel(after.masteryScore, after.attempts);
        expect(rank(reached)).toBeGreaterThanOrEqual(rank(p.target));
      }
    });

    it(`reports the smallest count, so k-1 is never already enough for: ${name}`, () => {
      const m = replay(history);
      const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
      if (!p.target) return;
      for (const d of DIFFICULTIES) {
        const k = p.answersNeeded[d];
        if (k == null || k === 1) continue;
        let after = m;
        for (let i = 0; i < k - 1; i++) after = applyResult(after, result(true, { difficulty: d }));
        const reached = masteryLabel(after.masteryScore, after.attempts);
        expect(rank(reached)).toBeLessThan(rank(p.target));
      }
    });
  }

  it("never reports a count beyond the horizon", () => {
    for (const { history } of HISTORIES) {
      const m = replay(history);
      const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults }, 5);
      for (const d of DIFFICULTIES) {
        const k = p.answersNeeded[d];
        if (k != null) expect(k).toBeLessThanOrEqual(5);
      }
    }
  });

  it("best and worst bracket the per-difficulty counts", () => {
    for (const { history } of HISTORIES) {
      const m = replay(history);
      const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
      const found = DIFFICULTIES.map((d) => p.answersNeeded[d]).filter((n): n is number => n != null);
      if (found.length === 0) {
        expect(p.best).toBeNull();
        expect(p.worst).toBeNull();
      } else {
        expect(p.best).toBe(Math.min(...found));
        // `worst` is only meaningful when every difficulty reaches the target.
        if (found.length === DIFFICULTIES.length) expect(p.worst).toBe(Math.max(...found));
        else expect(p.worst).toBeNull();
      }
    }
  });

  it("uses MASTERY_CONFIG's own thresholds, not hard-coded ones", () => {
    for (const level of MASTERY_CONFIG.levels) {
      expect(requirementFor(level.label)).toEqual({ min: level.min, minAttempts: level.minAttempts });
    }
    expect(requirementFor("Not started")).toBeNull();
  });

  it("flags the attempts-only case where the score already clears the next band", () => {
    // Two correct hard answers score above 70 but "Proficient" needs three attempts.
    const m = replay([result(true, { difficulty: "hard" }), result(true, { difficulty: "hard", followUp: true })]);
    const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
    expect(p.label).toBe("Developing");
    expect(p.target).toBe("Proficient");
    expect(p.score).toBeGreaterThanOrEqual(70);
    expect(p.scoreAlreadyClears).toBe(true);
    expect(nextStepSentence(p)).toContain("already clears Proficient");
  });

  it("goes vaguer rather than confident when nothing is within the horizon", () => {
    const m = replay(Array.from({ length: 6 }, () => result(false)));
    const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults }, 1);
    expect(p.best).toBeNull();
    expect(nextStepSentence(p)).toContain("Keep practising");
    expect(nextStepSentence(p)).not.toMatch(/\d+ more correct/);
  });

  it("computes the practice ceiling from the formula and explains the Mastered gap with it", () => {
    const plainCeiling = reachableCeiling("hard", false);
    expect(plainCeiling).toBe(
      computeMastery(
        Array.from({ length: MASTERY_CONFIG.windowSize }, () => result(true, { difficulty: "hard" })),
      ),
    );
    // The point worth telling a student: ordinary correct answers cannot reach "Mastered".
    expect(plainCeiling).toBeLessThan(requirementFor("Mastered")!.min);
    expect(reachableCeiling("hard", true)).toBeGreaterThan(plainCeiling);

    const m = replay(Array.from({ length: 4 }, () => result(true)));
    const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
    expect(p.label).toBe("Proficient");
    expect(p.target).toBe("Mastered");
    expect(p.best).toBeNull();
    const s = nextStepSentence(p);
    expect(s).toContain(`${plainCeiling}%`);
    expect(s).toContain("follow-up questions after a mistake");
  });

  it("says nothing numeric before the first attempt", () => {
    const p = projectMastery({ attempts: 0, recentResults: [] });
    expect(p.target).toBeNull();
    expect(nextStepSentence(p)).toBe("Not practised yet. Answer one question on this and a score appears.");
  });

  it("stops projecting once Mastered", () => {
    const history = Array.from({ length: 8 }, () => result(true, { difficulty: "hard", followUp: true }));
    const m = replay(history);
    const p = projectMastery({ attempts: m.attempts, recentResults: m.recentResults });
    if (p.label === "Mastered") {
      expect(p.target).toBeNull();
      expect(nextStepSentence(p)).toContain("as high as the bands go");
    }
  });

  it("orders labels the same way masteryLabel escalates", () => {
    expect(nextLabelUp("Needs revision")).toBe("Developing");
    expect(nextLabelUp("Developing")).toBe("Proficient");
    expect(nextLabelUp("Proficient")).toBe("Mastered");
    expect(nextLabelUp("Mastered")).toBeNull();
    for (const level of MASTERY_CONFIG.levels) expect(LABEL_ORDER).toContain(level.label);
  });
});

describe("masteryTimeline", () => {
  it("is empty with no results", () => {
    expect(masteryTimeline([], 0)).toEqual([]);
  });

  it("matches the engine's score at every point of a complete history", () => {
    const history = [result(true), result(false), result(true), result(true)];
    const m = replay(history);
    const points = masteryTimeline(m.recentResults, m.attempts);
    expect(points).toHaveLength(4);
    expect(points.map((p) => p.attempt)).toEqual([1, 2, 3, 4]);
    points.forEach((p, i) => {
      expect(p.score).toBe(computeMastery(history.slice(0, i + 1)));
      expect(p.correct).toBe(history[i].correct);
    });
    expect(points[points.length - 1].score).toBe(m.masteryScore);
  });

  it("starts a trimmed history where the full window is actually known", () => {
    // 20 answers: applyResult keeps the last 16, so the first four are gone.
    const history = Array.from({ length: 20 }, (_, i) => result(i % 2 === 0));
    const m = replay(history);
    expect(m.attempts).toBe(20);
    expect(m.recentResults).toHaveLength(MASTERY_CONFIG.windowSize * 2);
    const points = masteryTimeline(m.recentResults, m.attempts);
    // The 16 stored results are attempts 5–20; the 8th of them is attempt 12,
    // the earliest point whose eight-result window is fully known.
    expect(points[0].attempt).toBe(12);
    expect(points).toHaveLength(9);
    expect(points[points.length - 1].attempt).toBe(20);
    expect(points[points.length - 1].score).toBe(m.masteryScore);
  });

  it("refuses to call fewer than MIN_TREND_POINTS a trend", () => {
    const two = masteryTimeline(replay([result(true), result(true)]).recentResults, 2);
    expect(two).toHaveLength(2);
    expect(hasTrend(two)).toBe(false);
    expect(trendSummary(two)).toBe("Not enough practice yet to show a trend.");
    expect(MIN_TREND_POINTS).toBe(3);
  });

  it("describes direction only over the plotted points", () => {
    const up = masteryTimeline(replay([result(false), result(true), result(true), result(true)]).recentResults, 4);
    expect(hasTrend(up)).toBe(true);
    expect(trendSummary(up)).toMatch(/^Up \d+ points over your last 4 answers\.$/);
    const down = masteryTimeline(replay([result(true), result(true), result(false), result(false)]).recentResults, 4);
    expect(trendSummary(down)).toMatch(/^Down \d+ points over your last 4 answers\.$/);
  });
});

describe("recurringMisconceptions", () => {
  it("drops one-off slips and keeps repeats, newest tally first", () => {
    const rows: { conceptTitle: string; misconceptions: Record<string, number> }[] = [
      { conceptTitle: "Momentum", misconceptions: { "sign-of-velocity": 3, "forgot-mass": 1 } },
      { conceptTitle: "Restitution", misconceptions: { "sign-of-velocity": 2, "ratio-inverted": 2 } },
    ];
    const out = recurringMisconceptions(rows);
    expect(out.map((m) => m.key)).toEqual(["sign-of-velocity", "ratio-inverted"]);
    expect(out[0].count).toBe(5);
    expect(out[0].concepts).toEqual(["Momentum", "Restitution"]);
    expect(out[0].label).toBe("Sign of velocity");
  });

  it("tolerates missing or empty tallies", () => {
    expect(recurringMisconceptions([])).toEqual([]);
    expect(recurringMisconceptions([{ conceptTitle: "X", misconceptions: {} }])).toEqual([]);
    expect(recurringMisconceptions([{ conceptTitle: "X", misconceptions: { a: 0 } }])).toEqual([]);
  });

  it("humanizes slugs without inventing words", () => {
    expect(humanizeMisconception("forgot_mass-ratio")).toBe("Forgot mass ratio");
    expect(humanizeMisconception("")).toBe("");
  });
});

describe("time helpers", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");

  it("counts whole elapsed days", () => {
    expect(daysSince("2026-10-17T09:00:00.000Z", now)).toBe(0);
    expect(daysSince("2026-10-16T09:00:00.000Z", now)).toBe(1);
    expect(daysSince("not a date", now)).toBeNull();
  });

  it("labels recency in words", () => {
    expect(lastPractisedLabel("2026-10-17T09:00:00.000Z", now)).toBe("Practised today");
    expect(lastPractisedLabel("2026-10-16T09:00:00.000Z", now)).toBe("Practised yesterday");
    expect(lastPractisedLabel("2026-10-10T09:00:00.000Z", now)).toBe("Practised 7 days ago");
    expect(lastPractisedLabel("2026-09-01T09:00:00.000Z", now)).toBe("Practised 6 weeks ago");
    expect(lastPractisedLabel("2026-01-01T09:00:00.000Z", now)).toMatch(/months ago$/);
  });

  it("excludes implausibly long runs from time on task instead of guessing", () => {
    const t = timeOnTask([
      { startedAt: "2026-10-17T10:00:00.000Z", completedAt: "2026-10-17T10:08:00.000Z" },
      { startedAt: "2026-10-17T11:00:00.000Z", completedAt: "2026-10-17T11:06:00.000Z" },
      { startedAt: "2026-10-16T09:00:00.000Z", completedAt: "2026-10-16T23:00:00.000Z" }, // tab left open
      { startedAt: "2026-10-16T09:00:00.000Z" }, // never finished
    ]);
    expect(t).toEqual({ ms: 14 * 60_000, runs: 2, excluded: 1 });
    expect(formatDuration(t.ms)).toBe("14 min");
    expect(formatDuration(95 * 60_000)).toBe("1 h 35 min");
    expect(formatDuration(500)).toBe("1s");
  });
});

describe("what to do next", () => {
  it("orders revision by weakest score, then by longest since practised", () => {
    const rows = [
      { conceptId: "a", score: 60, daysSince: 1 },
      { conceptId: "b", score: 30, daysSince: 0 },
      { conceptId: "c", score: 30, daysSince: 9 },
    ];
    expect(revisionOrder(rows).map((r) => r.conceptId)).toEqual(["c", "b", "a"]);
  });

  it("refuses an overall verdict on almost no practice", () => {
    expect(overallStatement({ questionsAnswered: 0, conceptsPractised: 0, conceptsAtProficient: 0, weakCount: 0 })).toBe(
      "No practice recorded yet, so there is nothing to report.",
    );
    expect(
      overallStatement({ questionsAnswered: 2, conceptsPractised: 1, conceptsAtProficient: 0, weakCount: 1 }),
    ).toContain("not enough practice yet");
  });

  it("states counts, never a grade or a prediction", () => {
    const s = overallStatement({ questionsAnswered: 24, conceptsPractised: 6, conceptsAtProficient: 2, weakCount: 3 });
    expect(s).toBe("2 of 6 concepts you have practised are at Proficient or above; 3 need another pass.");
    expect(s).not.toMatch(/grade|exam|predict|%/i);
  });
});

describe("difficulty coverage", () => {
  it("projects over every difficulty the formula weights", () => {
    const weighted = Object.keys(MASTERY_CONFIG.difficultyWeight) as Difficulty[];
    expect([...DIFFICULTIES].sort()).toEqual([...weighted].sort());
  });
});
