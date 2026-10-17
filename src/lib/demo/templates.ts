/**
 * Deterministic, parametric follow-up question generators for physics
 * concepts. They produce new scenarios (different objects, numbers and
 * framing) so a follow-up tests transfer, not recall of the missed question.
 * Output is labelled origin "template" and always passes validateQuestion.
 */
import { collide1D } from "../validation/physics";
import { validateQuestion } from "../validation/questions";
import type { CalcSpec, CollisionCheck, Difficulty, Question, QuestionCategory, VisualSpec } from "../types";

/* ---------- seeded RNG ---------- */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle<T>(arr: T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
type Rng = ReturnType<typeof rng>;

/** Format to 3 significant figures without trailing zeros. */
export function fmt(n: number): string {
  if (Math.abs(n) < 1e-12) return "0";
  const s = Number(n.toPrecision(3));
  return String(s);
}

/* ---------- builders ---------- */
interface Distractor {
  text: string;
  misconception: string;
  feedback: string;
}
interface Draft {
  text: string;
  category: QuestionCategory;
  correct: string;
  distractors: Distractor[];
  explanation: string;
  steps: string[];
  hint: string;
  calc?: CalcSpec;
  physicsCheck?: CollisionCheck;
  visual?: VisualSpec;
}

function numericDistractor(value: number, unit: string, misconception: string, feedback: string): Distractor {
  return { text: `${fmt(value)}${unit ? ` ${unit}` : ""}`, misconception, feedback };
}

function assemble(d: Draft, r: Rng, meta: { id: string; questId: string; conceptId: string; difficulty: Difficulty; followUpOf?: string }): Question {
  const letters = ["A", "B", "C", "D"] as const;
  const entries = r.shuffle([{ text: d.correct, correct: true as const, dist: null as Distractor | null }, ...d.distractors.slice(0, 3).map((x) => ({ text: x.text, correct: false as const, dist: x }))]);
  const options = entries.map((e, i) => ({ id: letters[i], text: e.text }));
  const correctOptionId = letters[entries.findIndex((e) => e.correct)];
  const distractorFeedback = entries
    .map((e, i) => (e.dist ? { optionId: letters[i], misconception: e.dist.misconception, feedback: e.dist.feedback } : null))
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    id: meta.id,
    questId: meta.questId,
    conceptId: meta.conceptId,
    type: "mcq_single",
    category: d.category,
    difficulty: meta.difficulty,
    text: d.text,
    options,
    correctOptionId,
    explanation: d.explanation,
    distractorFeedback,
    hint: d.hint,
    steps: d.steps,
    calc: d.calc,
    physicsCheck: d.physicsCheck,
    visual: d.visual,
    sourceRefs: [],
    origin: "template",
    followUpOf: meta.followUpOf,
    validation: { status: "passed", checks: [], issues: [], reviewedByModel: false },
    createdAt: new Date().toISOString(),
  };
}

const KG_MS = "kg·m/s";

/* ---------- generators per concept ---------- */
type Gen = (r: Rng, difficulty: Difficulty) => Draft;

const momentum: Gen = (r, difficulty): Draft => {
  if (difficulty === "easy") {
    const ctx = r.pick([
      { name: "football", m: [0.4, 0.45], v: [8, 12, 15, 20] },
      { name: "hockey puck", m: [0.16, 0.17], v: [10, 20, 30] },
      { name: "bowling ball", m: [5, 6, 7], v: [3, 4, 5, 6] },
      { name: "cyclist with bicycle", m: [70, 75, 80], v: [4, 5, 6, 8] },
    ] as const);
    const m = r.pick(ctx.m);
    const v = r.pick(ctx.v);
    const p = m * v;
    return {
      category: "numerical",
      text: `A ${ctx.name} of mass ${m} kg moves at ${v} m/s. What is the magnitude of its momentum?`,
      correct: `${fmt(p)} ${KG_MS}`,
      distractors: [
        numericDistractor(0.5 * m * v * v, KG_MS, "used-kinetic-energy-formula", "That value is $\\tfrac12 mv^2$, the kinetic energy (in joules), not momentum."),
        numericDistractor(m / v, KG_MS, "divided-instead-of-multiplied", "That is $m/v$. Momentum multiplies mass by velocity."),
        numericDistractor(v / m, KG_MS, "divided-instead-of-multiplied", "That is $v/m$. Momentum multiplies mass by velocity."),
      ],
      explanation: `$p = mv = ${m} \\times ${v} = ${fmt(p)}\\ \\text{kg·m/s}$.`,
      steps: ["$p = mv$", `$p = ${m} \\times ${v}$`, `$p = ${fmt(p)}\\ \\text{kg·m/s}$`],
      hint: "Momentum = mass × velocity.",
      calc: { expression: "m*v", variables: { m: { value: m, unit: "kg" }, v: { value: v, unit: "m/s" } }, answerUnit: KG_MS, tolerance: 0.02 },
      visual: { kind: "momentum-bars", title: ctx.name, items: [{ label: ctx.name, value: Number(fmt(p)), unit: KG_MS }] },
    };
  }
  const ctx = r.pick(["tennis ball", "rubber ball", "squash ball"] as const);
  const m = r.pick([0.05, 0.06, 0.1, 0.15]);
  const v = r.pick([10, 12, 15, 20, 25]);
  const dp = 2 * m * v;
  return {
    category: difficulty === "hard" ? "reasoning" : "numerical",
    text: `A ${m} kg ${ctx} hits a wall head-on at ${v} m/s and rebounds straight back at the same speed. What is the magnitude of its change in momentum?`,
    correct: `${fmt(dp)} ${KG_MS}`,
    distractors: [
      { text: `0 ${KG_MS}`, misconception: "ignored-direction", feedback: "Same speed, but opposite direction! Momentum changes from $+mv$ to $-mv$." },
      numericDistractor(m * v, KG_MS, "only-final-or-initial", "That is the momentum before (or after). The change is after − before = $-mv - (+mv)$."),
      numericDistractor(m * v * v, KG_MS, "used-kinetic-energy-formula", "$mv^2$ mixes up momentum with energy. Use $\\Delta p = m\\Delta v$."),
    ],
    explanation: `Take the original direction as positive: $\\Delta p = m(-v) - m(v) = -2mv$, so $|\\Delta p| = 2 \\times ${m} \\times ${v} = ${fmt(dp)}\\ \\text{kg·m/s}$.`,
    steps: ["$p_i = +mv$, $p_f = -mv$", "$\\Delta p = p_f - p_i = -2mv$", `$|\\Delta p| = ${fmt(dp)}\\ \\text{kg·m/s}$`],
    hint: "Momentum is a vector, so reversing direction changes it even if the speed doesn't change.",
    calc: { expression: "2*m*v", variables: { m: { value: m, unit: "kg" }, v: { value: v, unit: "m/s" } }, answerUnit: KG_MS, tolerance: 0.02 },
    visual: {
      kind: "momentum-bars",
      title: "Before and after the bounce",
      items: [
        { label: "Before", value: Number(fmt(m * v)), unit: KG_MS },
        { label: "After", value: -Number(fmt(m * v)), unit: KG_MS },
      ],
    },
  };
};

const conservation: Gen = (r, difficulty): Draft => {
  if (difficulty !== "hard") {
    const mA = r.pick([40, 45, 50, 60]);
    const mB = r.pick([55, 65, 70, 80]);
    const vA = r.pick([1.2, 1.5, 2, 2.4]);
    const vB = (mA * vA) / mB;
    return {
      category: "numerical",
      text: `Two ice skaters stand at rest facing each other. Skater A (${mA} kg) pushes skater B (${mB} kg) and moves backwards at ${vA} m/s. Ignoring friction, how fast does skater B move?`,
      correct: `${fmt(vB)} m/s`,
      distractors: [
        numericDistractor(vA, "m/s", "equal-speeds-not-momenta", "Equal and opposite momenta, not equal speeds. The heavier skater moves more slowly."),
        numericDistractor((mB * vA) / mA, "m/s", "inverted-mass-ratio", "The mass ratio is upside down. Since $m_A v_A = m_B v_B$, $v_B = m_A v_A / m_B$."),
        numericDistractor(vA * Math.sqrt(mA / mB), "m/s", "energy-shared-equally", "That shares kinetic energy equally. It is momentum that is shared equally and oppositely."),
      ],
      explanation: `Total momentum starts at 0, so $m_A v_A = m_B v_B$ and $v_B = \\dfrac{${mA} \\times ${vA}}{${mB}} = ${fmt(vB)}\\ \\text{m/s}$.`,
      steps: ["Before: $p = 0$", "$m_A v_A = m_B v_B$", `$v_B = ${fmt(vB)}\\ \\text{m/s}$`],
      hint: "They start at rest, so total momentum is zero before and after.",
      calc: {
        expression: "mA*vA/mB",
        variables: { mA: { value: mA, unit: "kg" }, vA: { value: vA, unit: "m/s" }, mB: { value: mB, unit: "kg" } },
        answerUnit: "m/s",
        tolerance: 0.02,
      },
      visual: {
        kind: "momentum-bars",
        title: "Momentum after the push",
        items: [
          { label: "Skater A", value: -Number(fmt(mA * vA)), unit: KG_MS },
          { label: "Skater B", value: Number(fmt(mA * vA)), unit: KG_MS },
        ],
      },
    };
  }
  const M = r.pick([120, 150, 200, 240]);
  const m = r.pick([50, 60, 70]);
  const v = r.pick([2, 3, 4]);
  const V = (m * v) / M;
  return {
    category: "numerical",
    text: `A ${m} kg student jumps horizontally off the back of a ${M} kg boat at ${v} m/s (relative to the water). The boat was at rest. Ignoring water resistance, how fast does the boat move forward?`,
    correct: `${fmt(V)} m/s`,
    distractors: [
      numericDistractor(v, "m/s", "equal-speeds-not-momenta", "Equal and opposite momenta, not speeds. The heavier boat moves more slowly."),
      numericDistractor((M * v) / m, "m/s", "inverted-mass-ratio", "The mass ratio is inverted. $mv = MV$, so $V = mv/M$."),
      numericDistractor(v * Math.sqrt(m / M), "m/s", "energy-shared-equally", "That shares kinetic energy equally. Momentum, not kinetic energy, is equal and opposite."),
    ],
    explanation: `$0 = m v - M V$, so $V = \\dfrac{mv}{M} = \\dfrac{${m} \\times ${v}}{${M}} = ${fmt(V)}\\ \\text{m/s}$.`,
    steps: ["Initial momentum = 0", "$mv = MV$", `$V = ${fmt(V)}\\ \\text{m/s}$`],
    hint: "This is a recoil problem: student + boat start with zero total momentum.",
    calc: { expression: "m*v/M", variables: { m: { value: m, unit: "kg" }, v: { value: v, unit: "m/s" }, M: { value: M, unit: "kg" } }, answerUnit: "m/s", tolerance: 0.02 },
  };
};

const elastic: Gen = (r, difficulty): Draft => {
  if (difficulty === "easy") {
    const ctx = r.pick(["air-track gliders", "snooker balls", "steel trolleys"] as const);
    const u = r.pick([0.6, 0.8, 1.2, 1.5, 2.5]);
    return {
      category: "numerical",
      text: `Two identical ${ctx} collide head-on, perfectly elastically. The first moves at ${u} m/s and the second is at rest. What is the velocity of the second one after the collision?`,
      correct: `${fmt(u)} m/s`,
      distractors: [
        numericDistractor(u / 2, "m/s", "elastic-treated-as-inelastic", "Sharing the speed equally ($u/2$ each) is what happens if they stick together. Elastic means they bounce apart."),
        { text: "0 m/s", misconception: "passes-through", feedback: "If the second one stayed at rest, the first would have to pass through it." },
        numericDistractor(2 * u, "m/s", "doubled-speed", "That would create momentum and energy from nothing."),
      ],
      explanation: `Equal masses in a 1D elastic collision exchange velocities. The first stops and the second moves off at ${u} m/s.`,
      steps: ["Momentum: $v_1 + v_2 = u$", "Elastic ($e = 1$): $v_2 - v_1 = u$", `Add: $v_2 = u = ${u}\\ \\text{m/s}$, $v_1 = 0$`],
      hint: "Equal masses + elastic → think of snooker.",
      calc: {
        expression: "2*m1*u1/(m1 + m2)",
        variables: { m1: { value: 1, unit: "kg" }, m2: { value: 1, unit: "kg" }, u1: { value: u, unit: "m/s" } },
        answerUnit: "m/s",
        tolerance: 0.02,
      },
      physicsCheck: { kind: "collision-1d", m1: 1, m2: 1, u1: u, u2: 0, v1: 0, v2: u },
      visual: { kind: "collision-1d", title: `Identical ${ctx} (e = 1)`, m1: 1, m2: 1, u1: u, u2: 0, e: 1, label1: "1", label2: "2", massUnit: "kg", velocityUnit: "m/s", symbolic: false },
    };
  }
  const m1 = r.pick([1, 2, 3]);
  const m2 = r.pick([2, 3, 4, 5].filter((x) => x !== m1));
  const u1 = r.pick([4, 5, 6, 8]);
  const { v1, v2 } = collide1D(m1, m2, u1, 0, 1);
  const askV1 = difficulty === "hard";
  const target = askV1 ? v1 : v2;
  return {
    category: askV1 ? "reasoning" : "numerical",
    text: `A ${m1} kg ball moving at ${u1} m/s collides head-on and perfectly elastically with a ${m2} kg ball at rest. Taking the original direction as positive, what is the velocity of the ${askV1 ? `${m1} kg` : `${m2} kg`} ball just after the collision?`,
    correct: `${fmt(target)} m/s`,
    distractors: askV1
      ? [
          numericDistractor(-target, "m/s", "sign-flipped", "Check the direction. A lighter ball hitting a heavier one bounces back (negative); a heavier one keeps going forward."),
          { text: "0 m/s", misconception: "equal-mass-rule-overgeneralised", feedback: "Only equal masses swap velocities completely. These masses differ." },
          numericDistractor((m1 * u1) / (m1 + m2), "m/s", "elastic-treated-as-inelastic", "That is the common velocity if they stuck together. In an elastic collision they separate."),
        ]
      : [
          numericDistractor(u1, "m/s", "equal-mass-rule-overgeneralised", "Velocities are only exchanged when the masses are equal."),
          numericDistractor((m1 * u1) / (m1 + m2), "m/s", "elastic-treated-as-inelastic", "That is the common velocity if they stuck together. In an elastic collision they separate."),
          numericDistractor(u1 / 2, "m/s", "split-velocity", "Halving the speed ignores the masses. Use momentum conservation plus $e = 1$."),
        ],
    explanation: `For an elastic collision with the target at rest: $v_1 = \\dfrac{m_1 - m_2}{m_1 + m_2}u_1 = ${fmt(v1)}\\ \\text{m/s}$ and $v_2 = \\dfrac{2m_1}{m_1 + m_2}u_1 = ${fmt(v2)}\\ \\text{m/s}$.`,
    steps: [`Momentum: $${m1}(${u1}) = ${m1}v_1 + ${m2}v_2$`, `Elastic: $v_2 - v_1 = ${u1}$`, `Solve: $v_1 = ${fmt(v1)}$, $v_2 = ${fmt(v2)}\\ \\text{m/s}$`],
    hint: "Write the momentum equation and the $e = 1$ equation, then solve them together.",
    calc: {
      expression: askV1 ? "(m1 - m2)*u1/(m1 + m2)" : "2*m1*u1/(m1 + m2)",
      variables: { m1: { value: m1, unit: "kg" }, m2: { value: m2, unit: "kg" }, u1: { value: u1, unit: "m/s" } },
      answerUnit: "m/s",
      tolerance: 0.02,
    },
    physicsCheck: { kind: "collision-1d", m1, m2, u1, u2: 0, v1, v2 },
    visual: { kind: "collision-1d", title: `${m1} kg hits ${m2} kg (e = 1)`, m1, m2, u1, u2: 0, e: 1, label1: `${m1} kg`, label2: `${m2} kg`, massUnit: "kg", velocityUnit: "m/s", symbolic: false },
  };
};

const inelastic: Gen = (r, difficulty): Draft => {
  const ctx = r.pick([
    { a: "railway wagon", b: "railway wagon", ma: [8000, 10000, 12000], mb: [4000, 6000, 8000], u: [2, 3, 4] },
    { a: "rugby player", b: "rugby player", ma: [80, 90, 100], mb: [70, 75, 85], u: [4, 5, 6] },
    { a: "lump of putty", b: "lump of putty", ma: [0.3, 0.4, 0.5], mb: [0.2, 0.6, 0.7], u: [3, 5, 8] },
  ] as const);
  const m1 = r.pick(ctx.ma);
  const m2 = r.pick(ctx.mb);
  const u1 = r.pick(ctx.u);
  const v = (m1 * u1) / (m1 + m2);
  if (difficulty !== "hard") {
    return {
      category: "numerical",
      text: `A ${m1} kg ${ctx.a} moving at ${u1} m/s runs into a stationary ${m2} kg ${ctx.b}, and they move off together. What is their common velocity?`,
      correct: `${fmt(v)} m/s`,
      distractors: [
        numericDistractor(u1 / 2, "m/s", "averaged-velocities", "Averaging the velocities ignores the masses. Use $(m_1u_1 + m_2u_2)/(m_1 + m_2)$."),
        numericDistractor(u1, "m/s", "momentum-not-shared", "Now a bigger total mass shares the same momentum, so the speed must drop."),
        numericDistractor((m1 * u1) / m2, "m/s", "divided-by-wrong-mass", "Divide by the total mass $m_1 + m_2$, because both bodies move together afterwards."),
      ],
      explanation: `$v = \\dfrac{m_1u_1}{m_1 + m_2} = \\dfrac{${m1} \\times ${u1}}{${m1 + m2}} = ${fmt(v)}\\ \\text{m/s}$.`,
      steps: [`$p_{\\text{before}} = ${m1} \\times ${u1} = ${fmt(m1 * u1)}$`, `$p_{\\text{after}} = (${m1} + ${m2})v$`, `$v = ${fmt(v)}\\ \\text{m/s}$`],
      hint: "After sticking, there is one combined object.",
      calc: {
        expression: "m1*u1/(m1 + m2)",
        variables: { m1: { value: m1, unit: "kg" }, m2: { value: m2, unit: "kg" }, u1: { value: u1, unit: "m/s" } },
        answerUnit: "m/s",
        tolerance: 0.02,
      },
      physicsCheck: { kind: "collision-1d", m1, m2, u1, u2: 0, v1: v, v2: v },
      visual: { kind: "collision-1d", title: "They move off together (e = 0)", m1, m2, u1, u2: 0, e: 0, label1: `${m1} kg`, label2: `${m2} kg`, massUnit: "kg", velocityUnit: "m/s", symbolic: false },
    };
  }
  const keB = 0.5 * m1 * u1 * u1;
  const keA = 0.5 * (m1 + m2) * v * v;
  return {
    category: "numerical",
    text: `A ${m1} kg ${ctx.a} moving at ${u1} m/s collides with a stationary ${m2} kg ${ctx.b} and they move off together. How much kinetic energy is lost?`,
    correct: `${fmt(keB - keA)} J`,
    distractors: [
      { text: "0 J", misconception: "ke-always-conserved", feedback: "Kinetic energy is only conserved in elastic collisions. Sticking together always loses some." },
      numericDistractor(keB, "J", "all-ke-lost-when-sticking", "They still move after the collision, so not all the kinetic energy is lost."),
      numericDistractor(keA, "J", "reported-final-ke", "That is the kinetic energy that remains. The loss is before − after."),
    ],
    explanation: `$v = ${fmt(v)}\\ \\text{m/s}$. $KE_{\\text{before}} = ${fmt(keB)}\\ \\text{J}$ and $KE_{\\text{after}} = ${fmt(keA)}\\ \\text{J}$, so $\\Delta KE = ${fmt(keB - keA)}\\ \\text{J}$.`,
    steps: [`$v = \\dfrac{m_1 u_1}{m_1 + m_2} = ${fmt(v)}$`, `$KE_{\\text{before}} = ${fmt(keB)}$, $KE_{\\text{after}} = ${fmt(keA)}$`, `$\\Delta KE = ${fmt(keB - keA)}\\ \\text{J}$`],
    hint: "Find the common velocity first.",
    calc: {
      expression: "0.5*m1*u1^2 - 0.5*(m1 + m2)*(m1*u1/(m1 + m2))^2",
      variables: { m1: { value: m1, unit: "kg" }, m2: { value: m2, unit: "kg" }, u1: { value: u1, unit: "m/s" } },
      answerUnit: "J",
      tolerance: 0.02,
    },
    physicsCheck: { kind: "collision-1d", m1, m2, u1, u2: 0, v1: v, v2: v },
  };
};

const restitution: Gen = (r, difficulty): Draft => {
  if (difficulty !== "hard") {
    const e = r.pick([0.5, 0.6, 0.7, 0.8, 0.9]);
    const h0 = r.pick([1.0, 1.25, 2.0, 2.5, 3.2]);
    const h1 = Number(fmt(e * e * h0));
    const ball = r.pick(["tennis ball", "basketball", "rubber ball", "golf ball"]);
    const eTrue = Math.sqrt(h1 / h0);
    return {
      category: "numerical",
      text: `A ${ball} dropped from ${h0} m onto a concrete floor bounces back up to ${h1} m. What is the coefficient of restitution?`,
      correct: fmt(eTrue),
      distractors: [
        { text: fmt(h1 / h0), misconception: "heights-not-speeds", feedback: "That is $h_1/h_0$. e compares speeds, and speed ∝ $\\sqrt{h}$, so take the square root." },
        { text: fmt(Math.sqrt(h0 / h1)), misconception: "inverted-ratio", feedback: "e can't exceed 1 when the ball bounces lower than it was dropped. The ratio is upside down." },
        { text: fmt(1 - h1 / h0), misconception: "energy-lost-fraction", feedback: "That is the fraction of energy lost, not e." },
      ],
      explanation: `$e = \\sqrt{h_1/h_0} = \\sqrt{${h1}/${h0}} = ${fmt(eTrue)}$.`,
      steps: ["$u = \\sqrt{2gh_0}$, $v = \\sqrt{2gh_1}$", "$e = v/u = \\sqrt{h_1/h_0}$", `$e = ${fmt(eTrue)}$`],
      hint: "Speed at impact is $\\sqrt{2gh}$.",
      calc: { expression: "sqrt(h1/h0)", variables: { h0: { value: h0, unit: "m" }, h1: { value: h1, unit: "m" } }, answerUnit: "", tolerance: 0.02 },
      visual: { kind: "bounce", title: `${ball}`, dropHeight: h0, e: Number(fmt(eTrue)), heightUnit: "m" },
    };
  }
  const e = r.pick([0.4, 0.5, 0.6, 0.8]);
  const m1 = r.pick([1, 2]);
  const m2 = r.pick([1, 2, 3]);
  const u1 = r.pick([5, 6, 8, 10]);
  const { v1, v2 } = collide1D(m1, m2, u1, 0, e);
  const V1 = Number(fmt(v1));
  const V2 = Number(fmt(v2));
  const eShown = (V2 - V1) / u1;
  return {
    category: "numerical",
    text: `Ball P (${m1} kg) moving at ${u1} m/s hits ball Q (${m2} kg) at rest, head-on. Afterwards P moves at ${V1} m/s and Q at ${V2} m/s (same positive direction). What is the coefficient of restitution?`,
    correct: fmt(eShown),
    distractors: [
      { text: fmt(u1 / (V2 - V1)), misconception: "inverted-ratio", feedback: "Separation speed goes on top: $e = (v_Q - v_P)/(u_P - u_Q)$." },
      { text: fmt(V2 / u1), misconception: "ignored-relative-velocity", feedback: "Use relative velocities: subtract P's final velocity from Q's." },
      {
        text: fmt((0.5 * m1 * V1 * V1 + 0.5 * m2 * V2 * V2) / (0.5 * m1 * u1 * u1)),
        misconception: "energy-ratio-confusion",
        feedback: "That is the kinetic-energy ratio. e is a ratio of relative speeds.",
      },
    ],
    explanation: `$e = \\dfrac{v_Q - v_P}{u_P - u_Q} = \\dfrac{${V2} - ${V1}}{${u1} - 0} = ${fmt(eShown)}$.`,
    steps: ["Separation speed $= v_Q - v_P$", "Approach speed $= u_P - u_Q$", `$e = ${fmt(eShown)}$`],
    hint: "e = speed of separation ÷ speed of approach.",
    calc: {
      expression: "(v2 - v1)/(u1 - u2)",
      variables: { v1: { value: V1, unit: "m/s" }, v2: { value: V2, unit: "m/s" }, u1: { value: u1, unit: "m/s" }, u2: { value: 0, unit: "m/s" } },
      answerUnit: "",
      tolerance: 0.02,
    },
    physicsCheck: { kind: "collision-1d", m1, m2, u1, u2: 0, v1: V1, v2: V2 },
    visual: { kind: "collision-1d", title: `e = ${fmt(eShown)}`, m1, m2, u1, u2: 0, e: Math.min(1, Math.max(0, eShown)), label1: "P", label2: "Q", massUnit: "kg", velocityUnit: "m/s", symbolic: false },
  };
};

const problems: Gen = (r, difficulty): Draft => {
  if (difficulty === "easy") {
    const m1 = r.pick([2, 3, 4, 5]);
    const u1 = r.pick([2, 3, 4]);
    const m2 = r.pick([1, 2, 3].filter((x) => x !== m1));
    const u2 = -r.pick([1, 2, 5].filter((x) => m2 * x !== m1 * u1));
    const p = m1 * u1 + m2 * u2;
    return {
      category: "numerical",
      text: `A ${m1} kg trolley moves right at ${u1} m/s and a ${m2} kg trolley moves left at ${-u2} m/s. Taking right as positive, what is the total momentum?`,
      correct: `${fmt(p)} ${KG_MS}`,
      distractors: [
        numericDistractor(m1 * u1 - m2 * u2, KG_MS, "ignored-direction", "Leftward velocities are negative, so the momenta partly cancel."),
        numericDistractor(m1 * u1, KG_MS, "only-one-object", "Include the second trolley's momentum too."),
        numericDistractor(-p, KG_MS, "sign-flipped", "Check which trolley has more momentum. That decides the sign of the total."),
      ],
      explanation: `$p = (${m1})(${u1}) + (${m2})(${u2}) = ${fmt(p)}\\ \\text{kg·m/s}$.`,
      steps: [`Right = +, so $u_2 = ${u2}\\ \\text{m/s}$`, `$p = ${m1 * u1} + (${m2 * u2})$`, `$p = ${fmt(p)}\\ \\text{kg·m/s}$`],
      hint: "Give the leftward velocity a minus sign.",
      calc: {
        expression: "m1*u1 + m2*u2",
        variables: { m1: { value: m1, unit: "kg" }, u1: { value: u1, unit: "m/s" }, m2: { value: m2, unit: "kg" }, u2: { value: u2, unit: "m/s" } },
        answerUnit: KG_MS,
        tolerance: 0.02,
      },
      visual: {
        kind: "momentum-bars",
        title: "Momentum with signs",
        items: [
          { label: `${m1} kg`, value: m1 * u1, unit: KG_MS },
          { label: `${m2} kg`, value: m2 * u2, unit: KG_MS },
          { label: "Total", value: p, unit: KG_MS },
        ],
      },
    };
  }
  if (difficulty === "medium") {
    const m1 = r.pick([2, 3, 4]);
    const m2 = r.pick([1, 2]);
    const u1 = r.pick([4, 5, 6]);
    const u2 = -r.pick([2, 3]);
    const v = (m1 * u1 + m2 * u2) / (m1 + m2);
    return {
      category: "numerical",
      text: `A ${m1} kg cart moving right at ${u1} m/s meets a ${m2} kg cart moving left at ${-u2} m/s. They collide head-on and stick together. Taking right as positive, what is their velocity just afterwards?`,
      correct: `${fmt(v)} m/s`,
      distractors: [
        numericDistractor((m1 * u1 - m2 * u2) / (m1 + m2), "m/s", "ignored-direction", "The carts move in opposite directions, so give the leftward one a negative velocity."),
        numericDistractor((u1 + u2) / 2, "m/s", "averaged-velocities", "Averaging velocities ignores the masses. Use total momentum ÷ total mass."),
        numericDistractor(-v, "m/s", "sign-flipped", "Which cart had more momentum? The combined pair moves in that cart's direction."),
      ],
      explanation: `$v = \\dfrac{${m1}(${u1}) + ${m2}(${u2})}{${m1 + m2}} = ${fmt(v)}\\ \\text{m/s}$.`,
      steps: [`$p = ${m1 * u1} + (${m2 * u2}) = ${m1 * u1 + m2 * u2}$`, `$v = p/(m_1 + m_2)$`, `$v = ${fmt(v)}\\ \\text{m/s}$`],
      hint: "Signs first, then conservation of momentum.",
      calc: {
        expression: "(m1*u1 + m2*u2)/(m1 + m2)",
        variables: { m1: { value: m1, unit: "kg" }, u1: { value: u1, unit: "m/s" }, m2: { value: m2, unit: "kg" }, u2: { value: u2, unit: "m/s" } },
        answerUnit: "m/s",
        tolerance: 0.02,
      },
      physicsCheck: { kind: "collision-1d", m1, m2, u1, u2, v1: v, v2: v },
      visual: { kind: "collision-1d", title: "Head-on, stick together", m1, m2, u1, u2, e: 0, label1: `${m1} kg`, label2: `${m2} kg`, massUnit: "kg", velocityUnit: "m/s", symbolic: false },
    };
  }
  return elastic(r, "hard");
};

export const GENERATORS: Record<string, Gen> = { momentum, conservation, elastic, inelastic, restitution, problems };

export function generateFollowUp(opts: {
  generatorKey: string;
  conceptId: string;
  questId: string;
  difficulty: Difficulty;
  seed: string;
  id: string;
  followUpOf?: string;
  avoid: Pick<Question, "id" | "text">[];
}): Question | null {
  const gen = GENERATORS[opts.generatorKey];
  if (!gen) return null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const r = rng(hashSeed(`${opts.seed}:${attempt}`));
    const draft = gen(r, opts.difficulty);
    const q = assemble(draft, r, { id: opts.id, questId: opts.questId, conceptId: opts.conceptId, difficulty: opts.difficulty, followUpOf: opts.followUpOf });
    const report = validateQuestion(q, opts.avoid);
    if (report.ok) {
      q.validation = { status: "passed", checks: report.checks, issues: [], reviewedByModel: false };
      return q;
    }
  }
  return null;
}
