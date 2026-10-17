/**
 * Prepared Biology chapter: Transport across the cell membrane.
 *
 * The app shipped with a single Physics chapter, which made every game look
 * physics-only. This is the same shape as `collisions.ts` — a material with a
 * full extracted brief, concepts, and hand-checked questions — for a subject
 * with no numbers in it, which is the real test of whether the engine is
 * subject-agnostic.
 *
 * Every question here is `understanding` / `application` / `reasoning`, never
 * `numerical`, so none carries a `calc` spec. That is deliberate: the unit
 * validator is dimensional (kg, m, s) and a biology answer has no dimension
 * to check. The honesty guarantee for this chapter is the hand-review, and
 * the content is labelled `demo_prepared` so it is never passed off as
 * model-generated or as the student's own notes.
 */
import type { Concept, ExtractedContent, Material, Quest, Question } from "../types";

export const CELL_OWNER = "system";
export const CELL_QUEST_ID = "demo-cell-transport";
export const CELL_MATERIAL_ID = "demo-material-cell-transport";
const T0 = "2026-10-17T00:00:00.000Z";
const SRC = [{ ref: "Demo chapter: Transport across the cell membrane" }];

interface ConceptSeed {
  id: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
}

export const CELL_CONCEPT_SEEDS: ConceptSeed[] = [
  {
    id: "cell-c-membrane",
    title: "The fluid mosaic membrane",
    description: "A phospholipid bilayer with embedded proteins. Non-polar tails inside, polar heads outside — which is what makes it selectively permeable.",
    difficulty: "easy",
  },
  {
    id: "cell-c-diffusion",
    title: "Simple diffusion",
    description: "Net movement of particles from higher to lower concentration, down the gradient, with no energy cost to the cell.",
    difficulty: "easy",
  },
  {
    id: "cell-c-osmosis",
    title: "Osmosis",
    description: "Diffusion of water across a partially permeable membrane, from a more dilute solution to a more concentrated one.",
    difficulty: "medium",
  },
  {
    id: "cell-c-facilitated",
    title: "Facilitated diffusion",
    description: "Passive transport through channel or carrier proteins. Still down the gradient, but it needs a protein because the particle cannot cross the lipid core.",
    difficulty: "medium",
  },
  {
    id: "cell-c-active",
    title: "Active transport",
    description: "Pumping a substance against its concentration gradient using ATP. Needs a carrier protein and energy.",
    difficulty: "medium",
  },
  {
    id: "cell-c-tonicity",
    title: "Tonicity and real cells",
    description: "How animal and plant cells behave in hypotonic, isotonic and hypertonic surroundings — turgor, plasmolysis and lysis.",
    difficulty: "hard",
  },
];

type Seed = Omit<Question, "type" | "questId" | "origin" | "sourceRefs" | "validation" | "createdAt"> & {
  sourceRefs?: { ref: string }[];
};

const SEEDS: Seed[] = [
  {
    id: "cell-q01",
    conceptId: "cell-c-membrane",
    category: "understanding",
    difficulty: "easy",
    text: "Why is the interior of the phospholipid bilayer a barrier to ions such as Na⁺?",
    options: [
      { id: "A", text: "The interior is made of fatty acid tails, which are non-polar, and charged ions cannot pass through them easily." },
      { id: "B", text: "The interior is positively charged and repels all positive ions." },
      { id: "C", text: "The interior is too thin for any particle to cross." },
      { id: "D", text: "Ions are always far larger than the gaps between phospholipids." },
    ],
    correctOptionId: "A",
    explanation:
      "The bilayer is arranged with the hydrophilic phosphate heads facing the watery surroundings and the hydrophobic hydrocarbon tails facing inwards. A charged ion is strongly attracted to water and will not readily enter that non-polar core, so it needs a channel or carrier protein instead.",
    steps: [
      "Identify the two regions of a phospholipid: a polar head and two non-polar tails.",
      "In a bilayer the tails face each other, creating a non-polar core.",
      "A charged particle is stabilised by water and is not stabilised in a non-polar region, so crossing is energetically unfavourable.",
    ],
    hint: "Think about what the middle of the bilayer is made of, and whether a charged particle is comfortable there.",
    distractorFeedback: [
      { optionId: "B", misconception: "membrane-has-net-charge", feedback: "The core is not charged — it is uncharged and non-polar. If it simply repelled positive ions, negative ions would cross freely, and they do not." },
      { optionId: "C", misconception: "thickness-blocks-everything", feedback: "The membrane is only about 7 nm thick, and small non-polar molecules like oxygen cross it very easily. Thickness is not the barrier." },
      { optionId: "D", misconception: "size-only", feedback: "Size matters, but ions are tiny — far smaller than glucose, which also needs a protein. The obstacle for an ion is its charge, not its size." },
    ],
  },
  {
    id: "cell-q02",
    conceptId: "cell-c-diffusion",
    category: "understanding",
    difficulty: "easy",
    text: "A drop of dye is placed in still water and slowly spreads out. What drives this?",
    options: [
      { id: "A", text: "The random motion of particles, which produces a net movement from where they are crowded to where they are not." },
      { id: "B", text: "An attractive force pulling dye particles towards the empty regions." },
      { id: "C", text: "The water actively pushing the dye outwards to even itself out." },
      { id: "D", text: "Energy released by the dye to spread itself." },
    ],
    correctOptionId: "A",
    explanation:
      "Particles are in constant random motion. No individual particle 'knows' where to go — but where there are more of them, more happen to wander outwards than inwards, so the net flow is down the concentration gradient until it is even.",
    hint: "Does a single dye particle have any sense of direction?",
    distractorFeedback: [
      { optionId: "B", misconception: "diffusion-is-attraction", feedback: "There is no force pulling particles towards empty space. Diffusion is a statistical result of random movement, not an attraction." },
      { optionId: "C", misconception: "solvent-drives-diffusion", feedback: "The water is not doing anything purposeful. Both dye and water particles move randomly; the dye spreads because of its own gradient." },
      { optionId: "D", misconception: "diffusion-needs-energy", feedback: "Diffusion releases no energy from the dye and costs the cell nothing — it is passive. The kinetic energy involved is the ordinary thermal motion particles already have." },
    ],
  },
  {
    id: "cell-q03",
    conceptId: "cell-c-osmosis",
    category: "understanding",
    difficulty: "medium",
    text: "Pure water is separated from a concentrated sugar solution by a partially permeable membrane. Which way does there a net movement of water, and why?",
    options: [
      { id: "A", text: "Into the sugar solution, because water moves from where water is more concentrated to where it is less concentrated." },
      { id: "B", text: "Into the pure water, because sugar attracts water molecules towards itself across the membrane." },
      { id: "C", text: "There is no net movement, because the membrane blocks water." },
      { id: "D", text: "Into the sugar solution, because sugar molecules pull water through the membrane behind them." },
    ],
    correctOptionId: "A",
    explanation:
      "Osmosis is just diffusion of water. On the pure-water side the concentration of water is highest, so more water molecules cross towards the sugar solution than come back. The sugar cannot cross, so the gradient is resolved by water moving instead.",
    steps: [
      "Ask which side has the greater concentration of WATER (not of solute).",
      "Pure water is 100% water; the sugar solution is less.",
      "Water diffuses down its own gradient, so the net flow is into the sugar solution.",
    ],
    hint: "Track the water, not the sugar. Where is water most concentrated?",
    distractorFeedback: [
      { optionId: "B", misconception: "osmosis-is-attraction", feedback: "Sugar does not reach across and pull water. Water simply diffuses down its own concentration gradient — the direction happens to be towards the sugar." },
      { optionId: "C", misconception: "partially-permeable-blocks-water", feedback: "'Partially permeable' means it lets some things through. Water is precisely the thing it does let through; it is the sugar that is held back." },
      { optionId: "D", misconception: "solute-drags-solvent", feedback: "The sugar molecules cannot cross the membrane at all, so they cannot drag anything with them. The movement is water diffusing by itself." },
    ],
  },
  {
    id: "cell-q04",
    conceptId: "cell-c-facilitated",
    category: "understanding",
    difficulty: "medium",
    text: "Glucose enters a red blood cell through a carrier protein, moving from a higher to a lower concentration. Is this active transport?",
    options: [
      { id: "A", text: "No — it uses a protein but moves down the gradient, so it needs no ATP. This is facilitated diffusion." },
      { id: "B", text: "Yes — any transport involving a protein is active transport." },
      { id: "C", text: "Yes — glucose is a large molecule, so moving it always costs energy." },
      { id: "D", text: "No — glucose crosses the lipid bilayer directly without any protein." },
    ],
    correctOptionId: "A",
    explanation:
      "What makes transport 'active' is working against the gradient, which requires energy. Here the gradient does the work and the protein only provides a route past the non-polar core. Needing a protein and needing ATP are two separate things.",
    hint: "What exactly is the word 'active' describing — the protein, or the direction of travel?",
    distractorFeedback: [
      { optionId: "B", misconception: "protein-means-active", feedback: "This is the commonest slip here. Channel and carrier proteins are used in passive transport too — the protein is a doorway, not a pump." },
      { optionId: "C", misconception: "size-means-active", feedback: "Size explains why glucose needs a protein rather than crossing the lipid directly, but it does not make the process active. Direction relative to the gradient is what decides that." },
      { optionId: "D", misconception: "glucose-crosses-lipid", feedback: "Glucose is polar and fairly large, so it does not cross the non-polar core unaided — that is exactly why a carrier protein is involved." },
    ],
  },
  {
    id: "cell-q05",
    conceptId: "cell-c-active",
    category: "reasoning",
    difficulty: "medium",
    text: "A root cell takes up nitrate ions even though nitrate is already more concentrated inside the cell than in the soil. What must be true?",
    options: [
      { id: "A", text: "The cell is using energy from ATP to pump nitrate against its concentration gradient." },
      { id: "B", text: "Nitrate is diffusing in, because ions always enter cells." },
      { id: "C", text: "Water is carrying the nitrate in by osmosis." },
      { id: "D", text: "The membrane has become fully permeable to nitrate." },
    ],
    correctOptionId: "A",
    explanation:
      "Movement against a concentration gradient cannot happen by diffusion — diffusion only ever goes down a gradient. Uptake in this direction requires a carrier protein coupled to an energy source, which in a root cell is ATP from respiration.",
    steps: [
      "Compare the concentrations: higher inside, lower outside.",
      "Moving in means moving up the gradient, which diffusion cannot do.",
      "Therefore energy and a carrier protein are required — active transport.",
    ],
    hint: "Which way does diffusion go, and is that the direction described here?",
    distractorFeedback: [
      { optionId: "B", misconception: "ions-always-enter", feedback: "Diffusion has no preference for 'inside'. It moves particles down the gradient, which here would mean nitrate leaving, not entering." },
      { optionId: "C", misconception: "osmosis-carries-solutes", feedback: "Osmosis is the movement of water only. It cannot carry a solute against that solute's own gradient." },
      { optionId: "D", misconception: "permeability-explains-uptake", feedback: "Making the membrane more permeable would let nitrate leak OUT, since it is more concentrated inside. Permeability alone never moves something uphill." },
    ],
  },
  {
    id: "cell-q06",
    conceptId: "cell-c-tonicity",
    category: "application",
    difficulty: "medium",
    text: "An animal cell is placed in distilled water. What is the most likely outcome?",
    options: [
      { id: "A", text: "Water enters by osmosis and the cell may swell and burst, because it has no cell wall to resist the pressure." },
      { id: "B", text: "Water leaves the cell and it shrinks." },
      { id: "C", text: "The cell becomes turgid and firm, and stops there." },
      { id: "D", text: "Nothing happens, because distilled water contains no solutes to move." },
    ],
    correctOptionId: "A",
    explanation:
      "Distilled water is hypotonic to the cytoplasm, so water moves in by osmosis. An animal cell has only a membrane, which cannot withstand the rising pressure, so it swells and can undergo lysis.",
    hint: "What does an animal cell have on the outside that a plant cell does not?",
    distractorFeedback: [
      { optionId: "B", misconception: "direction-reversed", feedback: "Water moves towards the more concentrated solution. The cytoplasm is more concentrated than distilled water, so water moves IN, not out." },
      { optionId: "C", misconception: "animal-cells-become-turgid", feedback: "Turgor is a plant-cell outcome: the cell wall pushes back and the pressure stabilises. An animal cell has no wall, so there is nothing to stop the swelling." },
      { optionId: "D", misconception: "no-solute-no-osmosis", feedback: "Osmosis depends on a difference across the membrane, and here there is a large one — the cytoplasm is full of solutes even though the outside is not." },
    ],
  },
  {
    id: "cell-q07",
    conceptId: "cell-c-tonicity",
    category: "application",
    difficulty: "hard",
    text: "A plant cell is left in a strongly hypertonic salt solution. Which description best matches what is seen under a microscope?",
    options: [
      { id: "A", text: "The cell membrane pulls away from the cell wall as the vacuole shrinks — the cell is plasmolysed." },
      { id: "B", text: "The whole cell, wall included, shrinks evenly to a smaller size." },
      { id: "C", text: "The cell bursts, releasing its contents." },
      { id: "D", text: "The cell becomes turgid and pushes hard against the wall." },
    ],
    correctOptionId: "A",
    explanation:
      "Water leaves the vacuole and cytoplasm by osmosis. The cellulose wall is rigid and keeps its shape, but the membrane is flexible and is drawn inwards with the shrinking protoplast — the gap between wall and membrane is what you see as plasmolysis.",
    steps: [
      "Hypertonic outside means water leaves the cell.",
      "The vacuole loses water first and the protoplast shrinks.",
      "The rigid wall does not shrink, so the membrane detaches from it.",
    ],
    hint: "The wall is rigid and the membrane is not. What happens to the gap between them?",
    distractorFeedback: [
      { optionId: "B", misconception: "wall-shrinks", feedback: "The cellulose wall is rigid and keeps its shape. That contrast is precisely why plasmolysis is visible at all." },
      { optionId: "C", misconception: "plant-cells-burst", feedback: "Bursting happens when water enters an animal cell. Here water is leaving, and in any case the wall prevents a plant cell from bursting." },
      { optionId: "D", misconception: "tonicity-reversed", feedback: "Turgid is the hypotonic outcome, when water enters and presses the membrane against the wall. A hypertonic solution does the opposite." },
    ],
  },
  {
    id: "cell-q08",
    conceptId: "cell-c-diffusion",
    category: "reasoning",
    difficulty: "medium",
    text: "Raising the temperature increases the rate of diffusion across a membrane. What is the best explanation?",
    options: [
      { id: "A", text: "Particles gain kinetic energy and move faster, so they cross the membrane more often." },
      { id: "B", text: "The concentration gradient becomes steeper at higher temperature." },
      { id: "C", text: "Heat supplies the energy that diffusion requires to occur." },
      { id: "D", text: "The membrane dissolves, leaving larger holes." },
    ],
    correctOptionId: "A",
    explanation:
      "Diffusion rate depends on how quickly particles move. Temperature is a measure of average kinetic energy, so warmer particles travel faster and encounter the membrane more frequently, increasing the net rate.",
    hint: "What does temperature actually measure, at the level of individual particles?",
    distractorFeedback: [
      { optionId: "B", misconception: "temperature-changes-gradient", feedback: "The concentrations on each side are unchanged by warming. What changes is how fast particles move, not how many there are." },
      { optionId: "C", misconception: "diffusion-needs-energy-input", feedback: "Diffusion is passive and needs no energy input to happen. Heat speeds up an already-spontaneous process rather than powering it." },
      { optionId: "D", misconception: "heat-destroys-membrane", feedback: "At extreme temperatures a membrane is damaged, but the ordinary increase in diffusion rate happens well below that, with the membrane intact." },
    ],
  },
  {
    id: "cell-q09",
    conceptId: "cell-c-membrane",
    category: "reasoning",
    difficulty: "medium",
    text: "Oxygen crosses the membrane far more readily than a sodium ion, even though both are small. Why?",
    options: [
      { id: "A", text: "Oxygen is non-polar, so it dissolves in and passes through the lipid core; the sodium ion is charged and cannot." },
      { id: "B", text: "Oxygen molecules are much smaller than sodium ions." },
      { id: "C", text: "The cell actively pumps oxygen inwards at all times." },
      { id: "D", text: "There are far more oxygen channels than sodium channels." },
    ],
    correctOptionId: "A",
    explanation:
      "Permeability through the bilayer is governed by polarity much more than by size. A small non-polar molecule dissolves into the hydrocarbon core and passes straight through; a charged particle does not, regardless of how small it is.",
    hint: "Compare charge rather than size.",
    distractorFeedback: [
      { optionId: "B", misconception: "size-explains-permeability", feedback: "A sodium ion is actually very small. Size alone does not predict permeability — a polar water molecule is smaller still and crosses only slowly." },
      { optionId: "C", misconception: "oxygen-is-pumped", feedback: "Oxygen enters passively, down its gradient, as respiring cells constantly use it up. No pump is involved." },
      { optionId: "D", misconception: "channels-explain-oxygen", feedback: "Oxygen needs no channel at all — it crosses the lipid directly. Channels matter for the particles that cannot." },
    ],
  },
  {
    id: "cell-q10",
    conceptId: "cell-c-active",
    category: "reasoning",
    difficulty: "hard",
    text: "A cell is treated with a poison that stops ATP production. Which process stops almost immediately?",
    options: [
      { id: "A", text: "Active transport of ions against their gradients." },
      { id: "B", text: "Simple diffusion of oxygen into the cell." },
      { id: "C", text: "Osmosis of water into the cell." },
      { id: "D", text: "Facilitated diffusion of glucose down its gradient." },
    ],
    correctOptionId: "A",
    explanation:
      "Only active transport consumes ATP. Diffusion, osmosis and facilitated diffusion are all passive — they are driven by the gradient itself, so they continue even when the cell can no longer make ATP.",
    steps: [
      "List which processes require energy: only active transport.",
      "The other three are driven by existing concentration gradients.",
      "Removing ATP therefore stops active transport first.",
    ],
    hint: "Which of these is the cell paying for?",
    distractorFeedback: [
      { optionId: "B", misconception: "all-transport-needs-atp", feedback: "Simple diffusion costs the cell nothing — it is driven by the random motion particles already have." },
      { optionId: "C", misconception: "osmosis-needs-atp", feedback: "Osmosis is diffusion of water and is passive. A dead cell still takes up water in a hypotonic solution." },
      { optionId: "D", misconception: "facilitated-needs-atp", feedback: "Facilitated diffusion uses a protein but no ATP; the glucose gradient supplies the direction and the drive." },
    ],
  },
  {
    id: "cell-q11",
    conceptId: "cell-c-osmosis",
    category: "application",
    difficulty: "medium",
    text: "Potato strips are left in three solutions. Strip X gains mass, strip Y is unchanged, strip Z loses mass. What can you conclude about solution Z?",
    options: [
      { id: "A", text: "Solution Z is hypertonic to the potato cells, so water moved out of them." },
      { id: "B", text: "Solution Z is hypotonic to the potato cells." },
      { id: "C", text: "Solution Z was pure water." },
      { id: "D", text: "Solution Z contained no solutes at all." },
    ],
    correctOptionId: "A",
    explanation:
      "Loss of mass means net water movement out of the cells. Water moves towards the more concentrated solution, so the surrounding solution must have been more concentrated than the cell contents — hypertonic. Strip Y marks the point where the two concentrations matched.",
    hint: "Mass loss means water left. Which way does water move?",
    distractorFeedback: [
      { optionId: "B", misconception: "tonicity-terms-swapped", feedback: "Hypotonic means more dilute than the cell, which would make water move IN and the strip gain mass — that is strip X." },
      { optionId: "C", misconception: "assumes-extreme", feedback: "Pure water is the most hypotonic case possible and would cause the greatest gain in mass, not a loss." },
      { optionId: "D", misconception: "no-solute-assumption", feedback: "A solution with no solutes is pure water. For water to leave the cells, Z must contain MORE solute than the cytoplasm, not less." },
    ],
  },
  {
    id: "cell-q12",
    conceptId: "cell-c-facilitated",
    category: "reasoning",
    difficulty: "hard",
    text: "As the external glucose concentration rises, the rate of facilitated diffusion into a cell increases and then levels off. Why does it plateau?",
    options: [
      { id: "A", text: "All the carrier proteins are occupied, so the number of carriers limits the rate." },
      { id: "B", text: "The concentration gradient disappears at high external concentration." },
      { id: "C", text: "The cell runs out of ATP to continue the process." },
      { id: "D", text: "The membrane becomes saturated with glucose and stops being permeable." },
    ],
    correctOptionId: "A",
    explanation:
      "Facilitated diffusion depends on a finite number of carrier proteins. Once every carrier is working continuously, adding more glucose outside cannot speed things up — the transport is saturated. Simple diffusion shows no such plateau, which is one way to tell the two apart experimentally.",
    steps: [
      "Rate rises at first because more glucose means more collisions with carriers.",
      "Each carrier takes a fixed time per molecule.",
      "Once all carriers are busy, the rate is capped by carrier number.",
    ],
    hint: "What is there a limited number of?",
    distractorFeedback: [
      { optionId: "B", misconception: "gradient-vanishes", feedback: "Raising the outside concentration makes the gradient steeper, not weaker. The gradient is not the limiting factor here." },
      { optionId: "C", misconception: "facilitated-uses-atp", feedback: "Facilitated diffusion uses no ATP at all, so an ATP shortage cannot explain the plateau." },
      { optionId: "D", misconception: "membrane-saturates", feedback: "The lipid itself is not involved — glucose does not cross it. It is the protein carriers that saturate, not the membrane." },
    ],
  },
];

function cellExtracted(): ExtractedContent {
  return {
    chapterTitle: "Transport across the cell membrane",
    subject: "Biology",
    grade: "11",
    summary:
      "A cell membrane is selectively permeable: a phospholipid bilayer whose non-polar core lets small uncharged molecules slip through while blocking ions and larger polar molecules, which must use proteins instead. Most movement across it is passive — diffusion, osmosis and facilitated diffusion all run down a concentration gradient and cost the cell nothing. Only active transport works against a gradient, and that is the one process that needs ATP. Tonicity then ties the theory to what you actually see: an animal cell bursting in pure water, a plant cell plasmolysing in brine.",
    concepts: CELL_CONCEPT_SEEDS.map((c) => ({
      key: c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      sourceRefs: SRC,
      fromNotes: true,
    })),
    definitions: [
      { term: "Selectively permeable", definition: "Allows some substances across but not others, depending on size, charge and polarity.", fromNotes: true },
      { term: "Diffusion", definition: "Net movement of particles down a concentration gradient, caused by their random motion. Passive.", fromNotes: true },
      { term: "Osmosis", definition: "Net movement of water across a partially permeable membrane, from a more dilute to a more concentrated solution.", fromNotes: true },
      { term: "Facilitated diffusion", definition: "Passive movement down a gradient through a channel or carrier protein, for particles that cannot cross the lipid core.", fromNotes: true },
      { term: "Active transport", definition: "Movement against a concentration gradient using a carrier protein and energy from ATP.", fromNotes: true },
      { term: "Hypotonic / isotonic / hypertonic", definition: "A surrounding solution that is more dilute than / equal to / more concentrated than the cell contents.", fromNotes: true },
      { term: "Plasmolysis", definition: "In a plant cell, the pulling away of the membrane from the cell wall as the protoplast loses water.", fromNotes: true },
    ],
    formulas: [],
    examples: [
      {
        problem: "Why does a red blood cell burst in distilled water but a plant cell does not?",
        solution: "Both take in water by osmosis because distilled water is hypotonic. The plant cell has a rigid cellulose wall that pushes back as pressure rises, so it becomes turgid and stable. The animal cell has only a membrane, which cannot resist the pressure, so it lyses.",
      },
      {
        problem: "How would you tell experimentally whether glucose enters a cell by simple or facilitated diffusion?",
        solution: "Raise the external glucose concentration steadily and plot the uptake rate. Simple diffusion rises in proportion with no limit; facilitated diffusion rises and then plateaus once all carrier proteins are saturated.",
      },
      {
        problem: "A root hair cell absorbs potassium ions from very dilute soil water. What does that tell you?",
        solution: "Potassium is more concentrated inside the cell than outside, so uptake is against the gradient. That cannot be diffusion, so it must be active transport using carrier proteins and ATP from respiration.",
      },
    ],
    relationships: [
      { from: "Osmosis", to: "Simple diffusion", relation: "is a special case of" },
      { from: "Facilitated diffusion", to: "Active transport", relation: "shares carrier proteins with" },
      { from: "Active transport", to: "Respiration", relation: "depends on ATP from" },
      { from: "Tonicity and real cells", to: "Osmosis", relation: "is the observable result of" },
    ],
    uncertain: [],
  };
}

export function cellConcepts(): Concept[] {
  return CELL_CONCEPT_SEEDS.map((c) => ({
    ...c,
    materialId: CELL_MATERIAL_ID,
    questId: CELL_QUEST_ID,
    ownerId: CELL_OWNER,
    subject: "Biology",
    sourceRefs: SRC,
    fromNotes: true,
    createdAt: T0,
  }));
}

export function cellQuestions(): Question[] {
  return SEEDS.map((s) => ({
    ...s,
    type: "mcq_single" as const,
    questId: CELL_QUEST_ID,
    origin: "demo_prepared" as const,
    sourceRefs: s.sourceRefs ?? SRC,
    validation: { status: "passed" as const, checks: [], issues: [], reviewedByModel: false },
    createdAt: T0,
  }));
}

export function cellMaterial(): Material {
  return {
    id: CELL_MATERIAL_ID,
    ownerId: CELL_OWNER,
    title: "Transport across the cell membrane",
    settings: { subject: "Biology", grade: "11", goal: "School exam + NEET foundation", difficulty: "mixed", questionCount: 10 },
    extracted: cellExtracted(),
    files: [],
    stage: "ready",
    completedStages: ["uploaded", "reading", "concepts", "questions", "preparing", "ready"],
    questId: CELL_QUEST_ID,
    isDemo: true,
    createdAt: T0,
    updatedAt: T0,
  };
}

export function cellQuest(): Quest {
  return {
    id: CELL_QUEST_ID,
    ownerId: CELL_OWNER,
    materialId: CELL_MATERIAL_ID,
    title: "Transport across the cell membrane",
    subject: "Biology",
    grade: "11",
    conceptIds: CELL_CONCEPT_SEEDS.map((c) => c.id),
    questionIds: SEEDS.map((s) => s.id),
    playLength: 10,
    status: "ready",
    origin: "demo_prepared",
    rejectedCount: 0,
    createdAt: T0,
  };
}
