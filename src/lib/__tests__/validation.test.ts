import { describe, expect, it } from "vitest";
import { demoConcepts, demoQuestions } from "../demo/collisions";
import { GENERATORS, generateFollowUp } from "../demo/templates";
import { evaluate, DimensionError } from "../validation/expr";
import { checkCollision, collide1D } from "../validation/physics";
import { computeCalc, parseOptionNumber, validateQuestion } from "../validation/questions";
import { parseUnit } from "../validation/units";
import type { Difficulty, Question } from "../types";

describe("units and expression evaluator", () => {
  it("parses compound units into SI factors and dimensions", () => {
    expect(parseUnit("kg·m/s").dim).toEqual([1, 1, -1]);
    expect(parseUnit("N s").dim).toEqual([1, 1, -1]);
    expect(parseUnit("km/h").factor).toBeCloseTo(1 / 3.6);
    expect(parseUnit("m/s^2").dim).toEqual([0, 1, -2]);
    expect(parseUnit("").dim).toEqual([0, 0, 0]);
    expect(() => parseUnit("furlong")).toThrow();
  });

  it("rejects adding incompatible dimensions", () => {
    expect(() =>
      evaluate("m + v", { m: { v: 1, d: [1, 0, 0] }, v: { v: 1, d: [0, 1, -1] } }),
    ).toThrow(DimensionError);
  });

  it("does not allow arbitrary code", () => {
    expect(() => evaluate("process.exit(1)", {})).toThrow();
    expect(() => evaluate("constructor", {})).toThrow();
  });

  it("detects a wrong answer unit dimension", () => {
    expect(() =>
      computeCalc({ expression: "m*v", variables: { m: { value: 2, unit: "kg" }, v: { value: 3, unit: "m/s" } }, answerUnit: "J", tolerance: 0.02 }),
    ).toThrow(DimensionError);
  });

  it("parses option numbers including unicode minus and scientific notation", () => {
    expect(parseOptionNumber("−2.5 m/s")).toEqual({ value: -2.5, rest: "m/s" });
    expect(parseOptionNumber("3 × 10^2 J")?.value).toBe(300);
    expect(parseOptionNumber("Ball A stops")).toBeNull();
  });
});

describe("physics invariants", () => {
  it("equal masses exchange velocities in an elastic collision", () => {
    const { v1, v2 } = collide1D(1, 1, 5, 0, 1);
    expect(v1).toBeCloseTo(0);
    expect(v2).toBeCloseTo(5);
  });
  it("flags momentum violations", () => {
    expect(checkCollision({ m1: 1, m2: 1, u1: 1, u2: 0, v1: 0, v2: 0 }).ok).toBe(false);
    expect(checkCollision({ m1: 1, m2: 1, u1: 1, u2: 0, v1: 0.5, v2: 0.5 }).ok).toBe(true);
  });
  it("flags kinetic energy creation", () => {
    const r = checkCollision({ m1: 1, m2: 1, u1: 2, u2: 0, v1: -1, v2: 3 });
    expect(r.ok).toBe(false);
  });
});

describe("demo chapter", () => {
  const qs = demoQuestions();
  it("has 6 concepts and at least 10 questions covering all concepts", () => {
    const concepts = demoConcepts();
    expect(concepts).toHaveLength(6);
    expect(qs.length).toBeGreaterThanOrEqual(10);
    for (const c of concepts) expect(qs.some((q) => q.conceptId === c.id)).toBe(true);
  });

  it.each(demoQuestions().map((q) => [q.id, q] as const))("%s passes deterministic validation", (_id, q) => {
    const others = qs.filter((o) => o.id !== q.id);
    const report = validateQuestion(q, others);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("recomputes every numerical answer", () => {
    for (const q of qs.filter((x) => x.category === "numerical")) {
      expect(validateQuestion(q).checks).toContain("answer-recomputed");
    }
  });

  it("includes the equal-mass elastic collision example with answer B", () => {
    const q = qs.find((x) => x.id === "demo-q05")!;
    expect(q.correctOptionId).toBe("B");
    expect(q.options.find((o) => o.id === "B")!.text).toMatch(/A stops and ball B moves with speed/);
    expect(q.distractorFeedback.length).toBe(3);
  });

  it("catches a deliberately wrong answer key", () => {
    const q = structuredClone(qs.find((x) => x.id === "demo-q07")!) as Question;
    q.correctOptionId = "A"; // 6.0 m/s is wrong
    q.distractorFeedback = q.distractorFeedback.filter((d) => d.optionId !== "A");
    const r = validateQuestion(q);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Answer key mismatch/);
  });

  it("rejects questions where two options are correct", () => {
    const q = structuredClone(qs.find((x) => x.id === "demo-q07")!) as Question;
    q.options[0].text = "4 m/s";
    expect(validateQuestion(q).issues.join(" ")).toMatch(/also matches/);
  });

  it("rejects near-duplicate questions", () => {
    const q = structuredClone(qs[0]) as Question;
    q.id = "copy";
    expect(validateQuestion(q, qs).issues.join(" ")).toMatch(/Near-duplicate/);
  });
});

describe("template follow-up generators", () => {
  const diffs: Difficulty[] = ["easy", "medium", "hard"];
  for (const key of Object.keys(GENERATORS)) {
    for (const d of diffs) {
      it(`${key}/${d} produces valid questions across seeds`, () => {
        let produced = 0;
        for (let i = 0; i < 25; i++) {
          const q = generateFollowUp({ generatorKey: key, conceptId: "c", questId: "q", difficulty: d, seed: `s${i}`, id: `f${i}`, avoid: [] });
          if (q) {
            produced++;
            expect(validateQuestion(q).ok).toBe(true);
            expect(q.origin).toBe("template");
          }
        }
        expect(produced).toBeGreaterThanOrEqual(24);
      });
    }
  }

  it("follow-ups are not near-identical to the missed demo question", () => {
    const missed = demoQuestions().find((q) => q.id === "demo-q07")!;
    const f = generateFollowUp({ generatorKey: "inelastic", conceptId: missed.conceptId, questId: "x", difficulty: "medium", seed: "abc", id: "f", avoid: [missed] })!;
    expect(f).not.toBeNull();
    expect(f.text).not.toEqual(missed.text);
  });
});
