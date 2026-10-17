/**
 * QuestLearn AI evaluation.
 *
 *   npm run eval            # deterministic checks always; Gemini checks when credentials exist
 *
 * Writes eval/results/latest.json and eval/results/latest.md. Every number is
 * measured by this script on this run; nothing is estimated or hard-coded.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aiAvailable } from "../src/lib/ai/client";
import { designQuestions, extractChapter, reviewQuestions, tutorExplain, tutorFollowUp } from "../src/lib/ai/workflows";
import { config } from "../src/lib/config";
import { demoQuestions } from "../src/lib/demo/collisions";
import { GENERATORS, generateFollowUp } from "../src/lib/demo/templates";
import type { Difficulty, Question } from "../src/lib/types";
import { similarity, validateQuestion } from "../src/lib/validation/questions";

const SEEDS_PER_CELL = Number(process.env.EVAL_SEEDS ?? 40);
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

function deterministic() {
  const demo = demoQuestions();
  const demoPass = demo.filter((q) => validateQuestion(q, demo.filter((o) => o.id !== q.id)).ok).length;
  const demoNumerical = demo.filter((q) => q.category === "numerical");
  const demoRecomputed = demoNumerical.filter((q) => validateQuestion(q).checks.includes("answer-recomputed")).length;

  const diffs: Difficulty[] = ["easy", "medium", "hard"];
  let attempts = 0;
  let produced = 0;
  let valid = 0;
  let labelled = 0;
  let wrongOptions = 0;
  let dupPairs = 0;
  let pairs = 0;
  let nearMissed = 0;
  const perCell: Record<string, number> = {};
  for (const key of Object.keys(GENERATORS)) {
    for (const d of diffs) {
      const qs: Question[] = [];
      for (let i = 0; i < SEEDS_PER_CELL; i++) {
        attempts++;
        const q = generateFollowUp({ generatorKey: key, conceptId: key, questId: "eval", difficulty: d, seed: `eval-${key}-${d}-${i}`, id: `e${i}`, avoid: [] });
        if (!q) continue;
        produced++;
        if (validateQuestion(q).ok) valid++;
        const wrong = q.options.filter((o) => o.id !== q.correctOptionId);
        wrongOptions += wrong.length;
        labelled += wrong.filter((o) => q.distractorFeedback.some((f) => f.optionId === o.id && f.misconception)).length;
        qs.push(q);
      }
      perCell[`${key}/${d}`] = qs.length;
      for (let a = 0; a < qs.length; a++)
        for (let b = a + 1; b < qs.length; b++) {
          pairs++;
          if (qs[a].text === qs[b].text) dupPairs++;
        }
    }
  }
  // Follow-ups vs. the missed demo question: how often is the follow-up a near-copy?
  for (const missed of demo) {
    const key = { "demo-c-momentum": "momentum", "demo-c-conservation": "conservation", "demo-c-elastic": "elastic", "demo-c-inelastic": "inelastic", "demo-c-restitution": "restitution", "demo-c-problems": "problems" }[missed.conceptId]!;
    const f = generateFollowUp({ generatorKey: key, conceptId: missed.conceptId, questId: "eval", difficulty: missed.difficulty, seed: `fu-${missed.id}`, id: "f", avoid: [missed] });
    if (f && similarity(f.text, missed.text) >= 0.8) nearMissed++;
  }
  return {
    demoQuestions: demo.length,
    demoValidationPassRate: pct(demoPass, demo.length),
    demoNumericalRecomputedRate: pct(demoRecomputed, demoNumerical.length),
    templateAttempts: attempts,
    templateProducedRate: pct(produced, attempts),
    templateValidRate: pct(valid, produced),
    templateDistractorLabelledRate: pct(labelled, wrongOptions),
    templateExactDuplicatePairRate: pct(dupPairs, pairs),
    followUpNearCopyOfMissedRate: pct(nearMissed, demo.length),
    perCell,
  };
}

interface Chapter {
  id: string;
  subject: string;
  grade: string;
  title: string;
  pages: { ref: string; transcript: string }[];
  expectedConcepts: string[][];
}

async function withAi(chapters: Chapter[]) {
  const rows = [];
  for (const ch of chapters) {
    const started = Date.now();
    const pages = ch.pages.map((p) => ({ ...p, readability: "clear" as const }));
    const settings = { subject: ch.subject as "Physics", grade: ch.grade, goal: "", difficulty: "mixed" as const, questionCount: 8 };
    try {
      const { extracted } = await extractChapter(pages, settings, ch.title, "eval", ch.id);
      const hay = extracted.concepts.map((c) => `${c.title} ${c.description}`.toLowerCase());
      const found = ch.expectedConcepts.filter((alts) => hay.some((h) => alts.some((a) => h.includes(a.toLowerCase()))));
      const conceptKeyById = Object.fromEntries(extracted.concepts.map((c) => [`${ch.id}--${c.key}`, c.key]));
      const set = await designQuestions({ extracted, pages, settings, questId: `eval-${ch.id}`, concepts: [], conceptKeyById, ownerId: "eval" });
      const all = set.accepted.length + set.rejected.length;
      const acc = set.accepted;
      const refs = new Set(ch.pages.map((p) => p.ref));
      const grounded = acc.filter((q) => q.sourceRefs.some((s) => refs.has(s.ref))).length;
      const wrongOpts = acc.reduce((n, q) => n + q.options.length - 1, 0);
      const labelled = acc.reduce((n, q) => n + q.distractorFeedback.length, 0);
      const dupRejects = set.rejected.filter((r) => r.issues.some((i) => i.startsWith("Near-duplicate"))).length;
      const keyRejects = set.rejected.filter((r) => r.issues.some((i) => /Answer key mismatch|Independent solver/.test(i))).length;
      const numerical = acc.filter((q) => q.category === "numerical");

      // Tutor + follow-up on up to 3 accepted questions, answered with the first wrong option.
      let tutorOk = 0;
      let tutorTried = 0;
      let tutorConsistent = 0;
      let fuOk = 0;
      for (const q of acc.slice(0, 3)) {
        const wrong = q.options.find((o) => o.id !== q.correctOptionId)!;
        tutorTried++;
        try {
          const t = await tutorExplain({ question: q, selectedOptionId: wrong.id, conceptTitle: q.conceptId, conceptDescription: "", grade: ch.grade, sourceExcerpt: ch.pages.map((p) => p.transcript).join("\n"), priorMisconceptions: {}, struggle: 1, ownerId: "eval" });
          tutorOk++;
          // Consistency check: a blind solver given the tutor's explanation + the question must still pick the key.
          const v = await reviewQuestions([{ ...q, text: `${q.text}\n(Teacher's note: ${t.simpleExplanation})` }], "eval", "");
          if (v.get(q.id)?.ok) tutorConsistent++;
        } catch {
          /* counted as failure */
        }
        try {
          const f = await tutorFollowUp({ missed: q, conceptKey: conceptKeyById[q.conceptId] ?? q.conceptId, conceptTitle: q.conceptId, difficulty: q.difficulty, sourceExcerpt: ch.pages.map((p) => p.transcript).join("\n"), grade: ch.grade, subject: ch.subject, avoid: acc, ownerId: "eval" });
          if (f && f.conceptId === q.conceptId && similarity(f.text, q.text) < 0.8) fuOk++;
        } catch {
          /* counted as failure */
        }
      }
      rows.push({
        chapter: ch.id,
        extractionRecall: pct(found.length, ch.expectedConcepts.length),
        conceptsExtracted: extracted.concepts.length,
        questionsGenerated: all,
        questionsAccepted: acc.length,
        acceptanceRate: pct(acc.length, all),
        answerKeyRejections: keyRejects,
        duplicateRejectionRate: pct(dupRejects, all),
        numericalAccepted: numerical.length,
        sourceGroundedRate: pct(grounded, acc.length),
        distractorLabelledRate: pct(labelled, wrongOpts),
        tutorSchemaValidRate: pct(tutorOk, tutorTried),
        tutorKeyConsistentRate: pct(tutorConsistent, tutorOk),
        followUpRelevantRate: pct(fuOk, tutorTried),
        seconds: Math.round((Date.now() - started) / 1000),
      });
    } catch (e) {
      rows.push({ chapter: ch.id, error: (e as Error).message });
    }
  }
  return rows;
}

async function main() {
  const dataset = JSON.parse(readFileSync(path.join(process.cwd(), "eval/dataset.json"), "utf8")) as { chapters: Chapter[] };
  const det = deterministic();
  const ai = aiAvailable() ? await withAi(dataset.chapters) : null;
  const result = {
    ranAt: new Date().toISOString(),
    aiMode: config.aiMode,
    model: aiAvailable() ? config.model : null,
    deterministic: det,
    ai: ai ?? "SKIPPED: no Gemini credentials configured (set GOOGLE_CLOUD_PROJECT + GOOGLE_GENAI_USE_VERTEXAI=true, or GEMINI_API_KEY)",
  };
  mkdirSync("eval/results", { recursive: true });
  writeFileSync("eval/results/latest.json", JSON.stringify(result, null, 2));
  const md = [
    `# QuestLearn AI evaluation (${result.ranAt})`,
    "",
    `AI mode: **${result.aiMode}**${result.model ? ` (model ${result.model})` : ""}`,
    "",
    "## Deterministic checks (always run)",
    "",
    "| Metric | Value |",
    "|---|---|",
    ...Object.entries(det)
      .filter(([k]) => k !== "perCell")
      .map(([k, v]) => `| ${k} | ${v}${typeof v === "number" && /Rate$/.test(k) ? "%" : ""} |`),
    "",
    "## Gemini pipeline",
    "",
    ai
      ? ["| " + Object.keys(ai[0]).join(" | ") + " |", "|" + Object.keys(ai[0]).map(() => "---").join("|") + "|", ...ai.map((r) => "| " + Object.values(r).join(" | ") + " |")].join("\n")
      : `${result.ai}`,
    "",
  ].join("\n");
  writeFileSync("eval/results/latest.md", md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
