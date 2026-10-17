/**
 * Question-level coverage for Chemistry. Before the dimension system was
 * widened, every one of these questions was rejected by our own validator with
 * `Calculation error: Unknown unit "mol"` and so was never shown to a student.
 */
import { describe, expect, it } from "vitest";
import { demoQuestions } from "../../demo/collisions";
import type { CalcSpec, Question } from "../../types";
import { validateQuestion } from "../questions";

const MECHANICS_CHECKS = ["momentum-conserved", "energy-not-created", "restitution-in-range"];

function chemQuestion(over: Partial<Question> & { calc: CalcSpec }): Question {
  return {
    id: "chem-q",
    questId: "q-chem",
    conceptId: "c-chem",
    type: "mcq_single",
    category: "numerical",
    difficulty: "easy",
    text: "Placeholder stem long enough for the schema.",
    options: [],
    correctOptionId: "B",
    explanation: "Placeholder explanation.",
    distractorFeedback: [],
    sourceRefs: [],
    origin: "ai_generated",
    validation: { status: "passed", checks: [], issues: [], reviewedByModel: false },
    createdAt: "2026-10-17T00:00:00.000Z",
    ...over,
  };
}

/** n = m / M — the exact case that reproduced the bug. */
const moles = chemQuestion({
  id: "chem-moles",
  text: "How many moles of water are present in 36 g of water (molar mass 18 g/mol)?",
  options: [
    { id: "A", text: "0.5 mol" },
    { id: "B", text: "2 mol" },
    { id: "C", text: "18 mol" },
    { id: "D", text: "648 mol" },
  ],
  correctOptionId: "B",
  explanation: "n = m / M = 36 g ÷ 18 g/mol = 2 mol.",
  distractorFeedback: [
    { optionId: "A", misconception: "inverted-ratio", feedback: "This divides molar mass by mass instead of mass by molar mass." },
    { optionId: "C", misconception: "reads-molar-mass", feedback: "18 is the molar mass in g/mol, not an amount in mol." },
    { optionId: "D", misconception: "multiplies-instead", feedback: "Multiplying mass by molar mass is dimensionally meaningless." },
  ],
  calc: { expression: "m/Mr", variables: { m: { value: 36, unit: "g" }, Mr: { value: 18, unit: "g/mol" } }, answerUnit: "mol", tolerance: 0.02 },
});

describe("BUG FIX: a chemistry numerical question now validates", () => {
  it("accepts 'how many moles are in 36 g of water?'", () => {
    const r = validateQuestion(moles);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checks).toContain("units-dimensionally-consistent");
    expect(r.checks).toContain("answer-recomputed");
  });

  it("no longer reports an unknown unit for mol, g/mol, mol/L, kJ/mol or K", () => {
    for (const unit of ["mol", "g/mol", "mol/L", "M", "kJ/mol", "K", "L", "mL", "dm^3", "kPa", "atm", "g/L"]) {
      const r = validateQuestion(
        chemQuestion({
          options: [
            { id: "A", text: `1 ${unit}` },
            { id: "B", text: `3 ${unit}` },
            { id: "C", text: `9 ${unit}` },
          ],
          correctOptionId: "B",
          calc: { expression: "x", variables: { x: { value: 3, unit } }, answerUnit: unit, tolerance: 0.02 },
        }),
      );
      expect(r.issues, unit).toEqual([]);
    }
  });

  it("rejects each distractor as not matching the recomputed answer", () => {
    const r = validateQuestion(moles);
    expect(r.issues.join(" ")).not.toMatch(/also matches/);
  });

  it("still catches a distractor that secretly equals the answer", () => {
    const q = structuredClone(moles);
    q.options[2].text = "2.0 mol"; // C now equals the key
    const r = validateQuestion(q);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Option C also matches the recomputed answer/);
  });

  it("still catches a wrong chemistry answer key", () => {
    const q = structuredClone(moles);
    q.correctOptionId = "C"; // 18 mol is wrong
    q.distractorFeedback = q.distractorFeedback.filter((d) => d.optionId !== "C");
    const r = validateQuestion(q);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Answer key mismatch: recomputed 2\.000 mol/);
  });

  it("still catches a mismatched answer unit on the correct option", () => {
    const q = structuredClone(moles);
    q.options[1].text = "2 g"; // right number, wrong unit
    const r = validateQuestion(q);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/does not match the answer unit "mol"/);
  });
});

describe("other realistic chemistry questions", () => {
  it("validates a molarity-to-volume question", () => {
    const r = validateQuestion(
      chemQuestion({
        text: "What volume of 0.50 mol/L NaOH solution contains 0.25 mol of NaOH?",
        options: [
          { id: "A", text: "0.125 L" },
          { id: "B", text: "0.5 L" },
          { id: "C", text: "2 L" },
        ],
        correctOptionId: "B",
        explanation: "V = n / c = 0.25 mol ÷ 0.50 mol/L = 0.5 L.",
        calc: {
          expression: "n/c",
          variables: { n: { value: 0.25, unit: "mol" }, c: { value: 0.5, unit: "mol/L" } },
          answerUnit: "L",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.issues).toEqual([]);
  });

  it("validates a molarity question written with M and mL", () => {
    const r = validateQuestion(
      chemQuestion({
        text: "0.25 mol of solute is dissolved to make 500 mL of solution. What is its concentration?",
        options: [
          { id: "A", text: "0.125 M" },
          { id: "B", text: "0.5 M" },
          { id: "C", text: "2 M" },
        ],
        correctOptionId: "B",
        explanation: "c = n / V = 0.25 mol ÷ 0.500 L = 0.5 M.",
        calc: {
          expression: "n/V",
          variables: { n: { value: 0.25, unit: "mol" }, V: { value: 500, unit: "mL" } },
          answerUnit: "M",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.issues).toEqual([]);
  });

  it("validates a thermochemistry question in kJ/mol", () => {
    const r = validateQuestion(
      chemQuestion({
        text: "Burning 0.50 mol of a fuel with ΔH = -1300 kJ/mol releases how much energy?",
        options: [
          { id: "A", text: "-1300 kJ" },
          { id: "B", text: "-650 kJ" },
          { id: "C", text: "-2600 kJ" },
        ],
        correctOptionId: "B",
        explanation: "q = n ΔH = 0.50 mol × -1300 kJ/mol = -650 kJ.",
        calc: {
          expression: "n*dH",
          variables: { n: { value: 0.5, unit: "mol" }, dH: { value: -1300, unit: "kJ/mol" } },
          answerUnit: "kJ",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.issues).toEqual([]);
  });

  it("validates a specific-heat question that mixes mass, temperature and energy", () => {
    const r = validateQuestion(
      chemQuestion({
        text: "How much heat raises the temperature of 100 g of water by 20 K? (c = 4.18 J/g K)",
        options: [
          { id: "A", text: "0.836 kJ" },
          { id: "B", text: "8.36 kJ" },
          { id: "C", text: "83.6 kJ" },
        ],
        correctOptionId: "B",
        explanation: "q = m c ΔT = 0.100 kg × 4180 J/(kg K) × 20 K = 8.36 kJ.",
        calc: {
          expression: "m*c*dT",
          variables: { m: { value: 100, unit: "g" }, c: { value: 4.18, unit: "J/g K" }, dT: { value: 20, unit: "K" } },
          answerUnit: "kJ",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.issues).toEqual([]);
  });

  it("validates a gas-law question in kPa and L", () => {
    const r = validateQuestion(
      chemQuestion({
        text: "A gas at 100 kPa in 2.0 L is compressed isothermally to 1.0 L. What is the new pressure?",
        options: [
          { id: "A", text: "50 kPa" },
          { id: "B", text: "200 kPa" },
          { id: "C", text: "100 kPa" },
        ],
        correctOptionId: "B",
        explanation: "p2 = p1 V1 / V2 = 100 kPa × 2.0 L ÷ 1.0 L = 200 kPa.",
        calc: {
          expression: "p1*V1/V2",
          variables: { p1: { value: 100, unit: "kPa" }, V1: { value: 2, unit: "L" }, V2: { value: 1, unit: "L" } },
          answerUnit: "kPa",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.issues).toEqual([]);
  });
});

describe("dimensionally wrong chemistry answers are still rejected", () => {
  it("rejects an amount computed into a mass unit", () => {
    const q = structuredClone(moles);
    q.calc!.answerUnit = "g";
    const r = validateQuestion(q);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Dimension check failed: Answer has dimension N but unit "g" is M/);
  });

  it("rejects a molarity computed into a mol unit", () => {
    const r = validateQuestion(
      chemQuestion({
        options: [
          { id: "A", text: "1 mol" },
          { id: "B", text: "0.5 mol" },
          { id: "C", text: "2 mol" },
        ],
        calc: {
          expression: "n/V",
          variables: { n: { value: 0.25, unit: "mol" }, V: { value: 500, unit: "mL" } },
          answerUnit: "mol",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Dimension check failed/);
  });

  it("rejects adding an amount to a mass inside the expression", () => {
    const r = validateQuestion(
      chemQuestion({
        options: [
          { id: "A", text: "1 mol" },
          { id: "B", text: "2 mol" },
          { id: "C", text: "3 mol" },
        ],
        calc: {
          expression: "n + m",
          variables: { n: { value: 1, unit: "mol" }, m: { value: 1, unit: "g" } },
          answerUnit: "mol",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Cannot add N and M/);
  });
});

describe("Celsius questions are refused with an actionable message", () => {
  const celsius = chemQuestion({
    text: "Water at 20 °C is heated by 30 °C. What is the final temperature?",
    options: [
      { id: "A", text: "40 °C" },
      { id: "B", text: "50 °C" },
      { id: "C", text: "60 °C" },
    ],
    calc: {
      expression: "t0 + dt",
      variables: { t0: { value: 20, unit: "°C" }, dt: { value: 30, unit: "°C" } },
      answerUnit: "°C",
      tolerance: 0.02,
    },
  });

  it("rejects the question rather than computing a plausible-but-wrong Kelvin value", () => {
    const r = validateQuestion(celsius);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Unsupported unit: Celsius \("°C"\) is an offset scale/);
    expect(r.issues.join(" ")).toMatch(/Use K/);
    expect(r.checks).not.toContain("units-dimensionally-consistent");
  });

  it("accepts the same question rewritten in kelvin", () => {
    const r = validateQuestion(
      chemQuestion({
        text: "Water at 293 K is heated by 30 K. What is the final temperature?",
        options: [
          { id: "A", text: "313 K" },
          { id: "B", text: "323 K" },
          { id: "C", text: "333 K" },
        ],
        calc: {
          expression: "t0 + dt",
          variables: { t0: { value: 293, unit: "K" }, dt: { value: 30, unit: "K" } },
          answerUnit: "K",
          tolerance: 0.02,
        },
      }),
    );
    expect(r.issues).toEqual([]);
  });
});

describe("mechanical invariants stay keyed to physicsCheck, not to the subject", () => {
  it("never runs momentum/KE/restitution checks on a chemistry question", () => {
    const r = validateQuestion(moles);
    for (const c of MECHANICS_CHECKS) expect(r.checks).not.toContain(c);
    expect(r.issues.join(" ")).not.toMatch(/[Mm]omentum|restitution|[Kk]inetic energy/);
  });

  it("still runs them for a collision question that opts in", () => {
    const collision = demoQuestions().find((q) => q.physicsCheck)!;
    const r = validateQuestion(collision);
    expect(r.issues).toEqual([]);
    expect(r.checks).toContain("momentum-conserved");
    expect(r.checks).toContain("energy-not-created");
  });

  it("still flags a collision question whose physicsCheck violates momentum", () => {
    const q = structuredClone(demoQuestions().find((x) => x.physicsCheck)!);
    q.physicsCheck = { kind: "collision-1d", m1: 1, m2: 1, u1: 1, u2: 0, v1: 0, v2: 0 };
    expect(validateQuestion(q).issues.join(" ")).toMatch(/Momentum not conserved/);
  });
});
