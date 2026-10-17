/**
 * Deterministic question validation. A question is only shown to students if
 * every check here passes. Model-based review (src/lib/ai/reviewer.ts) is an
 * additional filter on top of this, never a replacement.
 */
import { Question, type CalcSpec } from "../types";
import { DimensionError, evaluate, ExprError, type Quantity } from "./expr";
import { checkCollision } from "./physics";
import { dimEqual, dimToString, normalizeUnit, OffsetUnitError, parseUnit } from "./units";

export interface ValidationReport {
  ok: boolean;
  checks: string[];
  issues: string[];
}

const BANNED_OPTIONS = [/^all of the above$/i, /^none of the above$/i, /^both \(?[a-e]\)? and \(?[a-e]\)?\.?$/i];

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.\-/]/gu, "")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizeText(s).split(" ").filter((w) => w.length > 2));
}

/** Jaccard similarity of word sets; used for duplicate detection. */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Extract the leading numeric value from an option like "−2.5 m/s" or "3 × 10^2 J". */
export function parseOptionNumber(text: string): { value: number; rest: string } | null {
  const s = text.replace(/[−–]/g, "-").replace(/\s*[×x]\s*10\^?\s*\(?(-?\d+)\)?/, "e$1").trim();
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i.exec(s);
  if (!m) return null;
  return { value: Number(m[1]), rest: m[2].trim() };
}

function relClose(a: number, b: number, tol: number) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / scale <= tol || Math.abs(a - b) < 1e-9;
}

export function computeCalc(calc: CalcSpec): Quantity & { unitValue: number } {
  const vars: Record<string, Quantity> = {};
  for (const [name, { value, unit }] of Object.entries(calc.variables)) {
    const u = parseUnit(unit);
    vars[name] = { v: value * u.factor, d: u.dim };
  }
  const result = evaluate(calc.expression, vars);
  const target = parseUnit(calc.answerUnit);
  if (!dimEqual(result.d, target.dim)) {
    throw new DimensionError(
      `Answer has dimension ${dimToString(result.d)} but unit "${calc.answerUnit}" is ${dimToString(target.dim)}`,
    );
  }
  return { ...result, unitValue: result.v / target.factor };
}

function validateCalc(q: Question, report: ValidationReport) {
  const calc = q.calc!;
  let computed: number;
  try {
    computed = computeCalc(calc).unitValue;
    report.checks.push("units-dimensionally-consistent");
  } catch (e) {
    // Offset scales (°C/°F) are refused by units.ts rather than mis-converted,
    // so surface that message verbatim: it tells the author how to fix the spec.
    if (e instanceof OffsetUnitError) report.issues.push(`Unsupported unit: ${e.message}`);
    else if (e instanceof DimensionError) report.issues.push(`Dimension check failed: ${e.message}`);
    else if (e instanceof ExprError) report.issues.push(`Calculation could not be evaluated: ${e.message}`);
    else report.issues.push(`Calculation error: ${(e as Error).message}`);
    return;
  }

  const unitNorm = normalizeUnit(calc.answerUnit);
  const parsed = q.options.map((o) => ({ id: o.id, p: parseOptionNumber(o.text) }));
  const correct = parsed.find((o) => o.id === q.correctOptionId);
  if (!correct?.p) {
    report.issues.push("Correct option of a numerical question does not start with a number");
    return;
  }
  if (unitNorm && normalizeUnit(correct.p.rest) !== unitNorm) {
    report.issues.push(`Correct option unit "${correct.p.rest}" does not match the answer unit "${calc.answerUnit}"`);
  }
  if (!relClose(correct.p.value, computed, calc.tolerance)) {
    report.issues.push(
      `Answer key mismatch: recomputed ${computed.toPrecision(4)} ${calc.answerUnit} but option ${correct.id} says ${correct.p.value}`,
    );
  } else {
    report.checks.push("answer-recomputed");
  }
  for (const o of parsed) {
    if (o.id === q.correctOptionId || !o.p) continue;
    if (relClose(o.p.value, computed, calc.tolerance)) {
      report.issues.push(`Option ${o.id} also matches the recomputed answer, so more than one option is correct`);
    }
  }
}

export function validateQuestion(input: unknown, existing: Pick<Question, "id" | "text">[] = []): ValidationReport {
  const report: ValidationReport = { ok: false, checks: [], issues: [] };
  const parsed = Question.safeParse(input);
  if (!parsed.success) {
    report.issues.push(...parsed.error.issues.slice(0, 5).map((i) => `Schema: ${i.path.join(".")} ${i.message}`));
    return report;
  }
  const q = parsed.data;
  report.checks.push("schema");

  // Option integrity
  const ids = q.options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) report.issues.push("Duplicate option ids");
  const expectedIds = ["A", "B", "C", "D", "E"].slice(0, q.options.length);
  if (ids.join() !== expectedIds.join()) report.issues.push("Option ids must be sequential starting at A");
  const texts = q.options.map((o) => normalizeText(o.text));
  if (new Set(texts).size !== texts.length) report.issues.push("Two options have the same text");
  if (!ids.includes(q.correctOptionId)) report.issues.push("Correct option id is not one of the options");
  else report.checks.push("single-correct-option");
  for (const o of q.options) {
    if (BANNED_OPTIONS.some((r) => r.test(o.text.trim()))) {
      report.issues.push(`Option ${o.id} ("${o.text}") is not allowed in single-answer questions`);
    }
  }

  // Distractor feedback must refer to wrong options only
  for (const d of q.distractorFeedback) {
    if (d.optionId === q.correctOptionId) report.issues.push("Distractor feedback attached to the correct option");
    if (!ids.includes(d.optionId)) report.issues.push(`Distractor feedback for missing option ${d.optionId}`);
  }
  if (q.distractorFeedback.length > 0) report.checks.push("distractors-labelled");

  // Answer must not be given away in the stem
  const correctText = q.options.find((o) => o.id === q.correctOptionId)?.text ?? "";
  if (correctText.length > 12 && normalizeText(q.text).includes(normalizeText(correctText))) {
    report.issues.push("Question text contains the correct answer verbatim");
  }

  // Numerical questions must be recomputable
  if (q.category === "numerical") {
    if (!q.calc) report.issues.push("Numerical question has no calculation spec to verify");
    else validateCalc(q, report);
  } else if (q.calc) {
    validateCalc(q, report);
  }

  // Mechanical invariants are keyed off the optional `physicsCheck` field (a
  // CollisionCheck), never off the subject or the presence of `calc`. A
  // chemistry question carries no physicsCheck, so momentum/KE/restitution are
  // never evaluated for it — see the note on checkCollision in physics.ts.
  if (q.physicsCheck) {
    const r = checkCollision(q.physicsCheck);
    report.checks.push(...r.checks);
    report.issues.push(...r.issues);
  }

  // Duplicates
  for (const other of existing) {
    if (other.id !== q.id && similarity(other.text, q.text) >= 0.8) {
      report.issues.push(`Near-duplicate of question ${other.id}`);
      break;
    }
  }
  if (!report.issues.some((i) => i.startsWith("Near-duplicate"))) report.checks.push("not-duplicate");

  report.ok = report.issues.length === 0;
  return report;
}
