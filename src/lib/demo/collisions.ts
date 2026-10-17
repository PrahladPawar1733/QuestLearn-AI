/**
 * Prepared demo chapter: Physics — Collisions (Grade 11).
 *
 * Every question here is hand-written, and every numerical answer is
 * recomputed by the validator in tests (src/lib/__tests__/demo.test.ts).
 * This content is labelled "demo_prepared" in the UI. It is never presented
 * as AI output.
 */
import type { Concept, ExtractedContent, Material, Quest, Question, TutorContent, VisualSpec } from "../types";

export const DEMO_OWNER = "system";
export const DEMO_QUEST_ID = "demo-collisions";
export const DEMO_MATERIAL_ID = "demo-material-collisions";
const T0 = "2026-10-01T00:00:00.000Z";

type ConceptSeed = Pick<Concept, "id" | "title" | "description" | "difficulty" | "generatorKey">;

export const DEMO_CONCEPT_SEEDS: ConceptSeed[] = [
  {
    id: "demo-c-momentum",
    title: "Momentum",
    description: "Linear momentum p = mv is a vector quantity that points along the velocity.",
    difficulty: "easy",
    generatorKey: "momentum",
  },
  {
    id: "demo-c-conservation",
    title: "Conservation of momentum",
    description: "With no net external force, the total momentum of a system stays constant.",
    difficulty: "medium",
    generatorKey: "conservation",
  },
  {
    id: "demo-c-elastic",
    title: "Elastic collisions",
    description: "Both momentum and kinetic energy are conserved; equal masses exchange velocities.",
    difficulty: "medium",
    generatorKey: "elastic",
  },
  {
    id: "demo-c-inelastic",
    title: "Inelastic collisions",
    description: "Momentum is conserved but kinetic energy is not; perfectly inelastic bodies stick together.",
    difficulty: "medium",
    generatorKey: "inelastic",
  },
  {
    id: "demo-c-restitution",
    title: "Coefficient of restitution",
    description: "e = (speed of separation) / (speed of approach); 0 ≤ e ≤ 1.",
    difficulty: "medium",
    generatorKey: "restitution",
  },
  {
    id: "demo-c-problems",
    title: "Solving collision problems",
    description: "Choose a positive direction, use signs for velocities, then apply conservation laws.",
    difficulty: "hard",
    generatorKey: "problems",
  },
];

export function demoConcepts(): Concept[] {
  return DEMO_CONCEPT_SEEDS.map((c) => ({
    ...c,
    materialId: DEMO_MATERIAL_ID,
    questId: DEMO_QUEST_ID,
    ownerId: DEMO_OWNER,
    subject: "Physics",
    sourceRefs: [{ ref: "Demo chapter: Collisions" }],
    fromNotes: true,
  }));
}

type QSeed = Omit<Question, "questId" | "origin" | "validation" | "createdAt" | "sourceRefs" | "type"> & {
  sourceRefs?: Question["sourceRefs"];
};

const eqMassVisual: VisualSpec = {
  kind: "collision-1d",
  title: "Equal masses, perfectly elastic",
  m1: 1,
  m2: 1,
  u1: 1,
  u2: 0,
  e: 1,
  label1: "A",
  label2: "B",
  massUnit: "m",
  velocityUnit: "u",
  symbolic: true,
};

const SEEDS: QSeed[] = [
  {
    id: "demo-q01",
    conceptId: "demo-c-momentum",
    category: "understanding",
    difficulty: "easy",
    text: "Which statement about linear momentum is correct?",
    options: [
      { id: "A", text: "Momentum is a scalar, so it has no direction." },
      { id: "B", text: "Momentum is a vector that points in the direction of the velocity." },
      { id: "C", text: "A heavier object always has more momentum than a lighter one." },
      { id: "D", text: "Momentum is measured in joules." },
    ],
    correctOptionId: "B",
    explanation:
      "Momentum is $\\vec p = m\\vec v$. Mass is a positive scalar, so $\\vec p$ always points the same way as $\\vec v$. That is why the direction (sign) matters in collision problems.",
    distractorFeedback: [
      {
        optionId: "A",
        misconception: "momentum-is-scalar",
        feedback: "Momentum inherits the direction of velocity. Two equal-mass carts moving towards each other at the same speed have zero total momentum.",
      },
      {
        optionId: "C",
        misconception: "mass-only",
        feedback: "Momentum depends on mass and velocity. A fast tennis ball can have more momentum than a slow, heavy, parked truck, which has none.",
      },
      {
        optionId: "D",
        misconception: "confuses-momentum-with-energy",
        feedback: "Joules measure energy. Momentum is measured in kg·m/s (which equals N·s).",
      },
    ],
    hint: "Think about what happens to $\\vec p$ when an object turns around.",
    steps: ["Write the definition: $\\vec p = m\\vec v$.", "Mass is positive, so $\\vec p$ is parallel to $\\vec v$."],
  },
  {
    id: "demo-q02",
    conceptId: "demo-c-momentum",
    category: "numerical",
    difficulty: "easy",
    text: "A 0.16 kg cricket ball travels at 25 m/s. What is the magnitude of its momentum?",
    options: [
      { id: "A", text: "50 kg·m/s" },
      { id: "B", text: "156 kg·m/s" },
      { id: "C", text: "4.0 kg·m/s" },
      { id: "D", text: "0.0064 kg·m/s" },
    ],
    correctOptionId: "C",
    explanation: "$p = mv = 0.16 \\times 25 = 4.0\\ \\text{kg·m/s}$.",
    distractorFeedback: [
      {
        optionId: "A",
        misconception: "used-kinetic-energy-formula",
        feedback: "50 is $\\tfrac12 mv^2$, which is kinetic energy in joules, not momentum.",
      },
      { optionId: "B", misconception: "divided-instead-of-multiplied", feedback: "156 comes from $v/m$. Momentum multiplies mass and velocity." },
      { optionId: "D", misconception: "divided-instead-of-multiplied", feedback: "0.0064 comes from $m/v$. Momentum multiplies mass and velocity." },
    ],
    hint: "Momentum = mass × velocity.",
    steps: ["$p = mv$", "$p = 0.16\\ \\text{kg} \\times 25\\ \\text{m/s}$", "$p = 4.0\\ \\text{kg·m/s}$"],
    calc: {
      expression: "m*v",
      variables: { m: { value: 0.16, unit: "kg" }, v: { value: 25, unit: "m/s" } },
      answerUnit: "kg·m/s",
      tolerance: 0.02,
    },
    visual: { kind: "momentum-bars", title: "Cricket ball", items: [{ label: "Ball (0.16 kg, 25 m/s)", value: 4, unit: "kg·m/s" }] },
  },
  {
    id: "demo-q03",
    conceptId: "demo-c-conservation",
    category: "understanding",
    difficulty: "medium",
    text: "A rifle resting freely recoils when it fires a bullet. Which statement best explains the recoil?",
    options: [
      { id: "A", text: "The escaping gases push air backwards onto the rifle." },
      { id: "B", text: "The rifle moves backwards with the same speed as the bullet." },
      {
        id: "C",
        text: "The total momentum of rifle + bullet stays zero, so the rifle gains momentum equal and opposite to the bullet's.",
      },
      { id: "D", text: "The rifle and bullet must end up with equal kinetic energies." },
    ],
    correctOptionId: "C",
    explanation:
      "Before firing, the rifle and bullet are at rest, so total momentum is zero. The firing forces are internal, so total momentum stays zero: $m_b v_b + m_r v_r = 0$. The rifle moves backwards, but much more slowly because it is much heavier.",
    distractorFeedback: [
      { optionId: "A", misconception: "recoil-from-air", feedback: "Recoil happens even in a vacuum. It comes from momentum conservation, not from air." },
      {
        optionId: "B",
        misconception: "equal-speeds-not-momenta",
        feedback: "The momenta are equal and opposite, not the speeds. The rifle is heavier, so its speed is smaller.",
      },
      {
        optionId: "D",
        misconception: "energy-shared-equally",
        feedback: "Momentum is shared equally (and oppositely), not kinetic energy. The light bullet takes almost all of the kinetic energy.",
      },
    ],
    hint: "What was the total momentum before the trigger was pulled?",
    steps: ["Total momentum before = 0.", "Internal forces cannot change total momentum.", "So $m_r v_r = -m_b v_b$."],
  },
  {
    id: "demo-q04",
    conceptId: "demo-c-conservation",
    category: "numerical",
    difficulty: "medium",
    text: "A 4 kg rifle, initially at rest, fires a 0.02 kg bullet horizontally at 400 m/s. What is the recoil speed of the rifle?",
    options: [
      { id: "A", text: "2.0 m/s" },
      { id: "B", text: "400 m/s" },
      { id: "C", text: "28.3 m/s" },
      { id: "D", text: "0 m/s" },
    ],
    correctOptionId: "A",
    explanation: "Momentum is conserved: $0 = m_b v_b + m_r v_r$, so $|v_r| = \\dfrac{m_b v_b}{m_r} = \\dfrac{0.02 \\times 400}{4} = 2.0\\ \\text{m/s}$.",
    distractorFeedback: [
      { optionId: "B", misconception: "equal-speeds-not-momenta", feedback: "Equal and opposite momenta, not speeds. The rifle is 200 times heavier than the bullet." },
      {
        optionId: "C",
        misconception: "energy-shared-equally",
        feedback: "28.3 m/s comes from giving the rifle the same kinetic energy as the bullet. Momentum, not kinetic energy, is shared equally and oppositely.",
      },
      { optionId: "D", misconception: "momentum-not-transferred", feedback: "If the rifle stayed still, total momentum would change from 0 to $m_b v_b$, which internal forces cannot do." },
    ],
    hint: "Total momentum before firing is zero.",
    steps: [
      "Before: $p = 0$.",
      "After: $m_b v_b + m_r v_r = 0$.",
      "$|v_r| = \\dfrac{0.02 \\times 400}{4} = 2.0\\ \\text{m/s}$",
    ],
    calc: {
      expression: "mb*vb/mr",
      variables: { mb: { value: 0.02, unit: "kg" }, vb: { value: 400, unit: "m/s" }, mr: { value: 4, unit: "kg" } },
      answerUnit: "m/s",
      tolerance: 0.02,
    },
    visual: {
      kind: "momentum-bars",
      title: "Momentum after firing",
      items: [
        { label: "Bullet", value: 8, unit: "kg·m/s" },
        { label: "Rifle", value: -8, unit: "kg·m/s" },
      ],
    },
  },
  {
    id: "demo-q05",
    conceptId: "demo-c-elastic",
    category: "understanding",
    difficulty: "medium",
    text: "Two identical balls are on a frictionless horizontal surface. Ball A moves with speed $u$ and ball B is at rest. They undergo a perfectly elastic, head-on collision. What happens immediately after the collision?",
    options: [
      { id: "A", text: "Both balls stop." },
      { id: "B", text: "Ball A stops and ball B moves with speed $u$." },
      { id: "C", text: "Both balls move together with speed $u/2$." },
      { id: "D", text: "Both balls reverse direction." },
    ],
    correctOptionId: "B",
    explanation:
      "In a one-dimensional elastic collision between equal masses, the balls exchange velocities. A stops and B moves off with speed $u$. Momentum $mu$ is conserved, and kinetic energy $\\tfrac12 mu^2$ is conserved.",
    distractorFeedback: [
      { optionId: "A", misconception: "momentum-lost", feedback: "If both stopped, total momentum would drop from $mu$ to 0. Momentum is always conserved in a collision like this." },
      {
        optionId: "C",
        misconception: "elastic-treated-as-inelastic",
        feedback: "Moving together at $u/2$ conserves momentum but halves the kinetic energy. That is a perfectly inelastic collision, not an elastic one.",
      },
      { optionId: "D", misconception: "everything-bounces-back", feedback: "If both moved backwards, total momentum would point the wrong way. It must stay $mu$ forwards." },
    ],
    hint: "Check both conservation laws: momentum and kinetic energy.",
    steps: [
      "Momentum: $mu + 0 = mv_A + mv_B$, so $v_A + v_B = u$.",
      "Elastic means $e = 1$: $v_B - v_A = u$.",
      "Adding the two equations gives $v_B = u$ and $v_A = 0$.",
    ],
    visual: eqMassVisual,
    physicsCheck: { kind: "collision-1d", m1: 1, m2: 1, u1: 1, u2: 0, v1: 0, v2: 1 },
  },
  {
    id: "demo-q06",
    conceptId: "demo-c-elastic",
    category: "reasoning",
    difficulty: "hard",
    text: "A light ball moving at speed $v$ makes a perfectly elastic head-on collision with a very heavy ball at rest. Immediately afterwards, the light ball…",
    options: [
      { id: "A", text: "stops, because the masses exchange velocities." },
      { id: "B", text: "continues forward with speed $v$." },
      { id: "C", text: "sticks to the heavy ball." },
      { id: "D", text: "bounces back with a speed close to $v$." },
    ],
    correctOptionId: "D",
    explanation:
      "For an elastic collision, $v_1 = \\dfrac{m_1 - m_2}{m_1 + m_2}\\,v$. When $m_2 \\gg m_1$, the fraction is close to $-1$, so the light ball rebounds at almost $v$. It is like a ball bouncing off a wall.",
    distractorFeedback: [
      { optionId: "A", misconception: "equal-mass-rule-overgeneralised", feedback: "Exchanging velocities only happens when the masses are equal. Here they are very different." },
      { optionId: "B", misconception: "passes-through", feedback: "The light ball cannot pass through the heavy one, and it cannot keep all its momentum while also pushing the heavy ball." },
      { optionId: "C", misconception: "elastic-treated-as-inelastic", feedback: "Sticking together is a perfectly inelastic collision ($e = 0$). Elastic means $e = 1$." },
    ],
    hint: "Think of a tennis ball hitting a wall.",
    steps: [
      "Elastic result: $v_1 = \\dfrac{m_1 - m_2}{m_1 + m_2}\\,v$.",
      "With $m_2 \\gg m_1$: $\\dfrac{m_1 - m_2}{m_1 + m_2} \\approx -1$.",
      "So $v_1 \\approx -v$: it bounces back at nearly the same speed.",
    ],
    visual: { kind: "collision-1d", title: "Light ball hits a heavy ball (e = 1)", m1: 0.2, m2: 5, u1: 3, u2: 0, e: 1, label1: "light", label2: "heavy", massUnit: "kg", velocityUnit: "m/s", symbolic: false },
  },
  {
    id: "demo-q07",
    conceptId: "demo-c-inelastic",
    category: "numerical",
    difficulty: "medium",
    text: "A 2 kg lump of clay moving at 6 m/s hits and sticks to a 1 kg lump of clay at rest. What is their common velocity just after the collision?",
    options: [
      { id: "A", text: "6.0 m/s" },
      { id: "B", text: "3.0 m/s" },
      { id: "C", text: "12 m/s" },
      { id: "D", text: "4.0 m/s" },
    ],
    correctOptionId: "D",
    explanation: "Momentum is conserved: $2 \\times 6 + 1 \\times 0 = (2 + 1)v$, so $v = 12/3 = 4.0\\ \\text{m/s}$.",
    distractorFeedback: [
      { optionId: "A", misconception: "momentum-not-shared", feedback: "The 2 kg lump must now push the 1 kg lump too, so the pair moves more slowly than 6 m/s." },
      { optionId: "B", misconception: "averaged-velocities", feedback: "Averaging the velocities, $(6 + 0)/2$, ignores the masses. Use momentum: $(m_1u_1 + m_2u_2)/(m_1 + m_2)$." },
      { optionId: "C", misconception: "confused-momentum-with-velocity", feedback: "12 kg·m/s is the total momentum. Divide by the total mass to get the velocity." },
    ],
    hint: "Total momentum before = total momentum after; after the collision there is one 3 kg object.",
    steps: ["$p_{\\text{before}} = 2 \\times 6 + 1 \\times 0 = 12\\ \\text{kg·m/s}$", "$p_{\\text{after}} = (2 + 1)v$", "$v = 12/3 = 4.0\\ \\text{m/s}$"],
    calc: {
      expression: "(m1*u1 + m2*u2)/(m1 + m2)",
      variables: { m1: { value: 2, unit: "kg" }, u1: { value: 6, unit: "m/s" }, m2: { value: 1, unit: "kg" }, u2: { value: 0, unit: "m/s" } },
      answerUnit: "m/s",
      tolerance: 0.02,
    },
    physicsCheck: { kind: "collision-1d", m1: 2, m2: 1, u1: 6, u2: 0, v1: 4, v2: 4 },
    visual: { kind: "collision-1d", title: "Clay lumps stick together (e = 0)", m1: 2, m2: 1, u1: 6, u2: 0, e: 0, label1: "2 kg", label2: "1 kg", massUnit: "kg", velocityUnit: "m/s", symbolic: false },
  },
  {
    id: "demo-q08",
    conceptId: "demo-c-inelastic",
    category: "numerical",
    difficulty: "hard",
    text: "A 2 kg trolley moving at 6 m/s couples with a stationary 1 kg trolley and they move off together. How much kinetic energy is lost in the collision?",
    options: [
      { id: "A", text: "0 J" },
      { id: "B", text: "12 J" },
      { id: "C", text: "36 J" },
      { id: "D", text: "24 J" },
    ],
    correctOptionId: "B",
    explanation:
      "Common velocity: $v = \\dfrac{2 \\times 6}{3} = 4\\ \\text{m/s}$. $KE_{\\text{before}} = \\tfrac12 (2)(6^2) = 36\\ \\text{J}$ and $KE_{\\text{after}} = \\tfrac12 (3)(4^2) = 24\\ \\text{J}$. So $12\\ \\text{J}$ is converted to heat, sound and deformation.",
    distractorFeedback: [
      { optionId: "A", misconception: "ke-always-conserved", feedback: "Kinetic energy is only conserved in elastic collisions. Trolleys that couple together lose some." },
      { optionId: "C", misconception: "all-ke-lost-when-sticking", feedback: "The trolleys still move after coupling, so they keep some kinetic energy. Not all 36 J is lost." },
      { optionId: "D", misconception: "reported-final-ke", feedback: "24 J is the kinetic energy that remains. The question asks for the energy lost: 36 − 24." },
    ],
    hint: "Find the common velocity first, then compare kinetic energies.",
    steps: [
      "$v = \\dfrac{m_1 u_1}{m_1 + m_2} = 4\\ \\text{m/s}$",
      "$KE_{\\text{before}} = 36\\ \\text{J}$, $KE_{\\text{after}} = 24\\ \\text{J}$",
      "$\\Delta KE = 36 - 24 = 12\\ \\text{J}$",
    ],
    calc: {
      expression: "0.5*m1*u1^2 - 0.5*(m1 + m2)*(m1*u1/(m1 + m2))^2",
      variables: { m1: { value: 2, unit: "kg" }, u1: { value: 6, unit: "m/s" }, m2: { value: 1, unit: "kg" } },
      answerUnit: "J",
      tolerance: 0.02,
    },
    physicsCheck: { kind: "collision-1d", m1: 2, m2: 1, u1: 6, u2: 0, v1: 4, v2: 4 },
    visual: { kind: "collision-1d", title: "Trolleys couple (e = 0)", m1: 2, m2: 1, u1: 6, u2: 0, e: 0, label1: "2 kg", label2: "1 kg", massUnit: "kg", velocityUnit: "m/s", symbolic: false },
  },
  {
    id: "demo-q09",
    conceptId: "demo-c-restitution",
    category: "understanding",
    difficulty: "medium",
    text: "How is the coefficient of restitution $e$ for a head-on collision defined?",
    options: [
      { id: "A", text: "Kinetic energy after ÷ kinetic energy before" },
      { id: "B", text: "Relative speed of separation ÷ relative speed of approach" },
      { id: "C", text: "Total momentum after ÷ total momentum before" },
      { id: "D", text: "Relative speed of approach ÷ relative speed of separation" },
    ],
    correctOptionId: "B",
    explanation:
      "$e = \\dfrac{v_2 - v_1}{u_1 - u_2}$: how fast the bodies separate compared with how fast they approached. $e = 1$ is elastic, $e = 0$ is perfectly inelastic.",
    distractorFeedback: [
      { optionId: "A", misconception: "energy-ratio-confusion", feedback: "e is a ratio of relative speeds, not of energies. (For a ball bouncing off the floor, the energy ratio is $e^2$.)" },
      { optionId: "C", misconception: "momentum-ratio-confusion", feedback: "That ratio is always 1 when momentum is conserved, so it can't describe how bouncy a collision is." },
      { optionId: "D", misconception: "inverted-ratio", feedback: "Upside down! That would make e greater than 1 for ordinary collisions." },
    ],
    hint: "e = 1 means the bodies fly apart as fast as they came together.",
    steps: ["$e = \\dfrac{\\text{speed of separation}}{\\text{speed of approach}} = \\dfrac{v_2 - v_1}{u_1 - u_2}$"],
  },
  {
    id: "demo-q10",
    conceptId: "demo-c-restitution",
    category: "numerical",
    difficulty: "hard",
    text: "A ball is dropped from a height of 1.6 m onto a hard floor and rebounds to a height of 0.9 m. What is the coefficient of restitution between the ball and the floor?",
    options: [
      { id: "A", text: "0.56" },
      { id: "B", text: "1.33" },
      { id: "C", text: "0.75" },
      { id: "D", text: "0.44" },
    ],
    correctOptionId: "C",
    explanation:
      "Impact speed $= \\sqrt{2gh_0}$ and rebound speed $= \\sqrt{2gh_1}$, so $e = \\sqrt{h_1/h_0} = \\sqrt{0.9/1.6} = \\sqrt{0.5625} = 0.75$.",
    distractorFeedback: [
      { optionId: "A", misconception: "heights-not-speeds", feedback: "0.56 is $h_1/h_0$, a ratio of heights (energies). e compares speeds, so take the square root." },
      { optionId: "B", misconception: "inverted-ratio", feedback: "e can't exceed 1 for a ball that bounces lower than it started. The ratio is upside down." },
      { optionId: "D", misconception: "energy-lost-fraction", feedback: "0.44 is the fraction of energy lost, $1 - h_1/h_0$. That isn't e." },
    ],
    hint: "Speed just before impact is $\\sqrt{2gh}$.",
    steps: ["$u = \\sqrt{2gh_0}$, $v = \\sqrt{2gh_1}$", "$e = v/u = \\sqrt{h_1/h_0}$", "$e = \\sqrt{0.9/1.6} = 0.75$"],
    calc: {
      expression: "sqrt(h1/h0)",
      variables: { h0: { value: 1.6, unit: "m" }, h1: { value: 0.9, unit: "m" } },
      answerUnit: "",
      tolerance: 0.02,
    },
    visual: { kind: "bounce", title: "Dropped ball (e = 0.75)", dropHeight: 1.6, e: 0.75, heightUnit: "m" },
  },
  {
    id: "demo-q11",
    conceptId: "demo-c-problems",
    category: "numerical",
    difficulty: "easy",
    text: "A 3 kg cart moves right at 2 m/s while a 1 kg cart moves left at 4 m/s. Taking right as positive, what is the total momentum of the two carts?",
    options: [
      { id: "A", text: "10 kg·m/s" },
      { id: "B", text: "2.0 kg·m/s" },
      { id: "C", text: "6.0 kg·m/s" },
      { id: "D", text: "-2.0 kg·m/s" },
    ],
    correctOptionId: "B",
    explanation: "$p = (3)(+2) + (1)(-4) = 6 - 4 = +2\\ \\text{kg·m/s}$, i.e. 2 kg·m/s to the right.",
    distractorFeedback: [
      { optionId: "A", misconception: "ignored-direction", feedback: "10 adds the sizes, 6 + 4. Velocities to the left are negative, so the momenta partly cancel." },
      { optionId: "C", misconception: "only-one-object", feedback: "6 kg·m/s is only the 3 kg cart. Include the second cart's momentum too." },
      { optionId: "D", misconception: "sign-flipped", feedback: "The 3 kg cart has more momentum, and it moves right (positive), so the total is positive." },
    ],
    hint: "Give the leftward velocity a minus sign.",
    steps: ["Right = +, so $u_2 = -4\\ \\text{m/s}$.", "$p = 3 \\times 2 + 1 \\times (-4)$", "$p = +2\\ \\text{kg·m/s}$"],
    calc: {
      expression: "m1*u1 + m2*u2",
      variables: { m1: { value: 3, unit: "kg" }, u1: { value: 2, unit: "m/s" }, m2: { value: 1, unit: "kg" }, u2: { value: -4, unit: "m/s" } },
      answerUnit: "kg·m/s",
      tolerance: 0.02,
    },
    visual: {
      kind: "momentum-bars",
      title: "Momentum with signs",
      items: [
        { label: "3 kg cart", value: 6, unit: "kg·m/s" },
        { label: "1 kg cart", value: -4, unit: "kg·m/s" },
        { label: "Total", value: 2, unit: "kg·m/s" },
      ],
    },
  },
  {
    id: "demo-q12",
    conceptId: "demo-c-problems",
    category: "numerical",
    difficulty: "hard",
    text: "A 1 kg ball moving at 6 m/s collides head-on and perfectly elastically with a 2 kg ball at rest. What is the velocity of the 2 kg ball just after the collision?",
    options: [
      { id: "A", text: "6.0 m/s" },
      { id: "B", text: "4.0 m/s" },
      { id: "C", text: "2.0 m/s" },
      { id: "D", text: "3.0 m/s" },
    ],
    correctOptionId: "B",
    explanation:
      "For an elastic collision with the target at rest, $v_2 = \\dfrac{2m_1}{m_1 + m_2}u_1 = \\dfrac{2(1)}{3}(6) = 4.0\\ \\text{m/s}$. The 1 kg ball rebounds at $-2\\ \\text{m/s}$. Check: $1(6) = 1(-2) + 2(4)$ ✓.",
    distractorFeedback: [
      { optionId: "A", misconception: "equal-mass-rule-overgeneralised", feedback: "Velocities are only exchanged when the masses are equal. Here the target is twice as heavy." },
      { optionId: "C", misconception: "elastic-treated-as-inelastic", feedback: "2 m/s is the common velocity if the balls stuck together. In an elastic collision they separate." },
      { optionId: "D", misconception: "split-velocity", feedback: "Halving the velocity ignores the masses. Use both momentum and kinetic-energy conservation (or $e = 1$)." },
    ],
    hint: "Use momentum conservation together with $e = 1$.",
    steps: [
      "Momentum: $6 = v_1 + 2v_2$",
      "Elastic: $v_2 - v_1 = 6$",
      "Add: $3v_2 = 12$, so $v_2 = 4\\ \\text{m/s}$ and $v_1 = -2\\ \\text{m/s}$.",
    ],
    calc: {
      expression: "2*m1*u1/(m1 + m2)",
      variables: { m1: { value: 1, unit: "kg" }, u1: { value: 6, unit: "m/s" }, m2: { value: 2, unit: "kg" } },
      answerUnit: "m/s",
      tolerance: 0.02,
    },
    physicsCheck: { kind: "collision-1d", m1: 1, m2: 2, u1: 6, u2: 0, v1: -2, v2: 4 },
    visual: { kind: "collision-1d", title: "1 kg hits 2 kg (e = 1)", m1: 1, m2: 2, u1: 6, u2: 0, e: 1, label1: "1 kg", label2: "2 kg", massUnit: "kg", velocityUnit: "m/s", symbolic: false },
  },
  {
    id: "demo-q13",
    conceptId: "demo-c-elastic",
    category: "understanding",
    difficulty: "easy",
    text: "Which quantities are conserved in a perfectly elastic collision between two bodies?",
    options: [
      { id: "A", text: "Momentum only" },
      { id: "B", text: "Kinetic energy only" },
      { id: "C", text: "Both total momentum and total kinetic energy" },
      { id: "D", text: "Neither, because the bodies exert forces on each other" },
    ],
    correctOptionId: "C",
    explanation:
      "Momentum is conserved in every collision where no external force acts. Elastic means no kinetic energy is lost too, so both totals are conserved.",
    distractorFeedback: [
      { optionId: "A", misconception: "forgets-ke-in-elastic", feedback: "Momentum only is true of inelastic collisions. Elastic collisions also keep all the kinetic energy." },
      { optionId: "B", misconception: "forgets-momentum", feedback: "Momentum is conserved in all collisions without external forces, elastic or not." },
      { optionId: "D", misconception: "internal-forces-change-momentum", feedback: "The forces are internal and equal and opposite (Newton's third law), so they cancel in the total." },
    ],
    hint: "One of these is conserved in every collision.",
    steps: ["Every isolated collision conserves momentum.", "Elastic means kinetic energy is also conserved."],
  },
  {
    id: "demo-q14",
    conceptId: "demo-c-inelastic",
    category: "understanding",
    difficulty: "easy",
    text: "Two bodies collide and stick together. What is the coefficient of restitution for this collision?",
    options: [
      { id: "A", text: "e = 1" },
      { id: "B", text: "e = 0.5" },
      { id: "C", text: "It depends only on the masses" },
      { id: "D", text: "e = 0" },
    ],
    correctOptionId: "D",
    explanation:
      "If they stick, their speed of separation is zero, so $e = \\dfrac{0}{\\text{approach}} = 0$. This is a perfectly inelastic collision.",
    distractorFeedback: [
      { optionId: "A", misconception: "inverted-extremes", feedback: "e = 1 is the opposite extreme: a perfectly elastic collision where the bodies bounce apart." },
      { optionId: "B", misconception: "guessing-middle", feedback: "Sticking together means zero separation speed, so e is exactly 0, not a middle value." },
      { optionId: "C", misconception: "e-depends-on-mass", feedback: "e depends on the materials and the separation speed, not just the masses. Here separation speed is 0." },
    ],
    hint: "How fast do the bodies separate if they stick together?",
    steps: ["Stuck together, so separation speed = 0.", "$e = 0 / \\text{approach speed} = 0$."],
  },
];

export function demoQuestions(): Question[] {
  return SEEDS.map((s) => ({
    ...s,
    type: "mcq_single" as const,
    questId: DEMO_QUEST_ID,
    origin: "demo_prepared" as const,
    sourceRefs: s.sourceRefs ?? [{ ref: "Demo chapter: Collisions" }],
    validation: { status: "passed" as const, checks: [], issues: [], reviewedByModel: false },
    createdAt: T0,
  }));
}

export function demoQuest(): Quest {
  return {
    id: DEMO_QUEST_ID,
    ownerId: DEMO_OWNER,
    materialId: DEMO_MATERIAL_ID,
    title: "Collisions",
    subject: "Physics",
    grade: "11",
    conceptIds: DEMO_CONCEPT_SEEDS.map((c) => c.id),
    questionIds: SEEDS.map((s) => s.id),
    playLength: 10,
    status: "ready",
    origin: "demo_prepared",
    rejectedCount: 0,
    createdAt: T0,
  };
}

/**
 * A hand-written chapter brief for the demo.
 *
 * For an uploaded chapter this block is produced by `extractChapter` and
 * stored on the material; the demo has no upload, so it is authored here and
 * labelled as prepared demo content. Everything a student reads before play
 * comes from this shape, so the demo must carry one or the pre-play screen
 * would be empty exactly where it matters most.
 */
function demoExtracted(): ExtractedContent {
  return {
    chapterTitle: "Collisions",
    subject: "Physics",
    grade: "11",
    summary:
      "A collision is a brief, forceful interaction between two bodies. Because the collision forces are internal to the pair and act for a very short time, the total momentum of the pair is conserved — whatever happens in between. Kinetic energy is a different story: it is conserved only in an elastic collision, and is partly converted to heat, sound and deformation in every real one. The coefficient of restitution e measures where a collision sits between those extremes.",
    concepts: DEMO_CONCEPT_SEEDS.map((c) => ({
      key: c.generatorKey ?? c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      sourceRefs: [{ ref: "Demo chapter: Collisions" }],
      fromNotes: true,
    })),
    definitions: [
      { term: "Linear momentum", definition: "The product of a body's mass and velocity, p = mv. It is a vector, so its direction matters as much as its size.", fromNotes: true },
      { term: "Elastic collision", definition: "A collision in which total kinetic energy is conserved as well as momentum.", fromNotes: true },
      { term: "Inelastic collision", definition: "A collision in which momentum is conserved but kinetic energy is not. In a perfectly inelastic collision the bodies move off together.", fromNotes: true },
      { term: "Coefficient of restitution (e)", definition: "The ratio of the relative speed of separation to the relative speed of approach. e = 1 is elastic, e = 0 is perfectly inelastic.", fromNotes: true },
      { term: "Impulse", definition: "The change in momentum produced by a force acting over a time interval, J = FΔt = Δp.", fromNotes: true },
    ],
    formulas: [
      { latex: "p = mv", meaning: "Momentum of a single body. Direction follows the velocity.", fromNotes: true },
      { latex: "m_1u_1 + m_2u_2 = m_1v_1 + m_2v_2", meaning: "Conservation of momentum for a two-body collision along a line.", fromNotes: true },
      { latex: "e = \\frac{v_2 - v_1}{u_1 - u_2}", meaning: "Coefficient of restitution: separation speed over approach speed.", fromNotes: true },
      { latex: "KE = \\tfrac{1}{2}mv^2", meaning: "Kinetic energy. Compare before and after to classify the collision.", fromNotes: true },
      { latex: "v = \\frac{m_1u_1 + m_2u_2}{m_1 + m_2}", meaning: "Common final velocity when two bodies stick together (perfectly inelastic).", fromNotes: true },
    ],
    examples: [
      {
        problem: "A 2 kg trolley moving at 3 m/s strikes a stationary 4 kg trolley and they couple together. Find their common speed.",
        solution: "Momentum before = 2 × 3 + 4 × 0 = 6 kg·m/s. After, the pair has mass 6 kg, so v = 6 / 6 = 1 m/s in the original direction.",
      },
      {
        problem: "Two equal masses collide head-on elastically, one at u and one at rest. What happens?",
        solution: "For equal masses in a one-dimensional elastic collision the velocities are exchanged: the moving body stops and the stationary one leaves at u.",
      },
      {
        problem: "A ball dropped from 1.0 m rebounds to 0.64 m. Find e.",
        solution: "Speeds go as √h, so e = √(0.64 / 1.0) = 0.8.",
      },
    ],
    relationships: [
      { from: "Impulse", to: "Momentum", relation: "impulse is the change in" },
      { from: "Coefficient of restitution", to: "Elastic collisions", relation: "e = 1 describes" },
      { from: "Coefficient of restitution", to: "Inelastic collisions", relation: "e = 0 describes" },
      { from: "Conservation of momentum", to: "Solving collision problems", relation: "is the main tool for" },
    ],
    // The demo chapter is authored, so nothing was unreadable. A real upload
    // lists anything the model could not read here instead of inventing it.
    uncertain: [],
  };
}

export function demoMaterial(): Material {
  return {
    id: DEMO_MATERIAL_ID,
    ownerId: DEMO_OWNER,
    title: "Collisions",
    settings: { subject: "Physics", grade: "11", goal: "School exam + JEE foundation", difficulty: "mixed", questionCount: 10 },
    extracted: demoExtracted(),
    files: [],
    stage: "ready",
    completedStages: ["uploaded", "reading", "concepts", "questions", "preparing", "ready"],
    questId: DEMO_QUEST_ID,
    isDemo: true,
    createdAt: T0,
    updatedAt: T0,
  };
}

/* ------------------------------------------------------------------ */
/* Prepared concept lessons for the tutor (used when AI is unavailable) */
/* ------------------------------------------------------------------ */

interface Lesson {
  explanation: string;
  simple: string;
  keyEquations: TutorContent["keyEquations"];
  visual?: VisualSpec;
}

export const DEMO_LESSONS: Record<string, Lesson> = {
  "demo-c-momentum": {
    explanation:
      "Momentum measures how hard it is to stop a moving object. It is mass times velocity, $\\vec p = m\\vec v$, so it has a size and a direction.",
    simple:
      "Imagine stopping a bicycle and a truck rolling at the same speed. The truck is much harder to stop because it has more mass, so more momentum. A faster bicycle is harder to stop than a slow one. Momentum grows with both mass and speed, and it points where the object is going.",
    keyEquations: [
      { latex: "\\vec p = m\\vec v", meaning: "Momentum is mass times velocity (a vector)." },
      { latex: "[p] = \\text{kg·m/s} = \\text{N·s}", meaning: "SI unit of momentum." },
    ],
  },
  "demo-c-conservation": {
    explanation:
      "If no external force acts on a system, its total momentum cannot change. Forces between parts of the system are equal and opposite (Newton's third law), so they cancel when you add up all the momenta.",
    simple:
      "Two skaters stand still on ice and push each other. Before the push, total momentum is zero. After it, one skater goes left and the other goes right. Their momenta are equal and opposite, so the total is still zero. The lighter skater moves faster.",
    keyEquations: [
      { latex: "m_1u_1 + m_2u_2 = m_1v_1 + m_2v_2", meaning: "Total momentum before = total momentum after." },
      { latex: "m_r v_r = -m_b v_b", meaning: "Recoil: starting from rest, the momenta are equal and opposite." },
    ],
  },
  "demo-c-elastic": {
    explanation:
      "In an elastic collision, both total momentum and total kinetic energy are conserved, so the bodies bounce apart with $e = 1$. For a 1D collision with body 2 at rest: $v_1 = \\frac{m_1 - m_2}{m_1 + m_2}u_1$ and $v_2 = \\frac{2m_1}{m_1 + m_2}u_1$. Equal masses simply swap velocities.",
    simple:
      "Picture snooker. The cue ball hits a still ball dead-centre, then stops, and the other ball rolls away at the cue ball's speed. Equal masses just swap velocities. A small ball hitting a big one bounces back, and a big ball hitting a small one keeps going forward.",
    keyEquations: [
      { latex: "v_1 = \\frac{m_1 - m_2}{m_1 + m_2}\\,u_1", meaning: "Final velocity of the moving body (target at rest)." },
      { latex: "v_2 = \\frac{2m_1}{m_1 + m_2}\\,u_1", meaning: "Final velocity of the target." },
      { latex: "v_2 - v_1 = u_1 - u_2", meaning: "e = 1: they separate as fast as they approached." },
    ],
  },
  "demo-c-inelastic": {
    explanation:
      "In an inelastic collision, momentum is conserved but some kinetic energy turns into heat, sound or deformation. If the bodies stick together (perfectly inelastic, $e = 0$), they share one final velocity: $v = \\frac{m_1u_1 + m_2u_2}{m_1 + m_2}$.",
    simple:
      "Throw a ball of clay at another ball of clay and they squish together and move as one. The momentum is still all there, shared by a bigger mass, so they move more slowly. The 'missing' kinetic energy went into squashing the clay and warming it up.",
    keyEquations: [
      { latex: "v = \\frac{m_1u_1 + m_2u_2}{m_1 + m_2}", meaning: "Common velocity after sticking together." },
      { latex: "\\Delta KE = KE_{\\text{before}} - KE_{\\text{after}}", meaning: "Energy converted to other forms." },
    ],
  },
  "demo-c-restitution": {
    explanation:
      "The coefficient of restitution compares how fast bodies separate with how fast they approached: $e = \\frac{v_2 - v_1}{u_1 - u_2}$. It ranges from 0 (stick together) to 1 (perfectly elastic). For a ball dropped on a rigid floor, $e = \\sqrt{h_1/h_0}$.",
    simple:
      "e is a bounciness score from 0 to 1. A clay blob that hits the floor and stays there has e = 0. A super-bouncy ball that comes back almost as fast as it hit has e close to 1. Since height grows with the square of speed, a ball with e = 0.5 bounces back to a quarter of the drop height.",
    keyEquations: [
      { latex: "e = \\frac{v_2 - v_1}{u_1 - u_2}", meaning: "Separation speed ÷ approach speed." },
      { latex: "e = \\sqrt{h_1 / h_0}", meaning: "Ball dropped from h₀ that rebounds to h₁." },
    ],
  },
  "demo-c-problems": {
    explanation:
      "Solve any collision problem in four steps. (1) Choose a positive direction. (2) Write every velocity with its sign. (3) Apply conservation of momentum. (4) Add a second equation: $e$ (or kinetic energy for elastic), or 'same final velocity' if they stick.",
    simple:
      "Treat it like a recipe. Pick 'right is plus'. Anything moving left gets a minus sign. Add up all the momenta before and set that equal to all the momenta after. If you have two unknowns, use the bounciness rule (e) as your second equation.",
    keyEquations: [
      { latex: "\\sum p_{\\text{before}} = \\sum p_{\\text{after}}", meaning: "Always true for an isolated system." },
      { latex: "v_2 - v_1 = e\\,(u_1 - u_2)", meaning: "Second equation from the coefficient of restitution." },
    ],
  },
};

export function isDemoQuest(id: string) {
  return id === DEMO_QUEST_ID;
}
