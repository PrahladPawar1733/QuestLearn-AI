import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.QL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ql-test-"));
process.env.QL_FORCE_DEMO = "1";

type Play = typeof import("../services/play");
type Tutor = typeof import("../services/tutor");
let play: Play;
let tutor: Tutor;
let db: typeof import("../db").db;
let demo: typeof import("../demo/collisions");

beforeAll(async () => {
  play = await import("../services/play");
  tutor = await import("../services/tutor");
  db = (await import("../db")).db;
  demo = await import("../demo/collisions");
});

const keyFor = (qid: string) => demo.demoQuestions().find((q) => q.id === qid)!.correctOptionId;
const wrongFor = (qid: string) => (["A", "B", "C", "D"] as const).find((o) => o !== keyFor(qid))!;

describe("adaptive learning loop (demo mode, no AI)", () => {
  const uid = "u_test-student-0000001";

  it("case 1: correct answers raise difficulty", async () => {
    const v = await play.startSession(uid, demo.DEMO_QUEST_ID, { world: "rocket" });
    expect(v.current).not.toBeNull();
    expect(v.current!.difficulty).toBe("easy"); // "mixed" warms up easy
    // The public question must not leak the answer key.
    expect(JSON.stringify(v.current)).not.toMatch(/correctOptionId|explanation|distractorFeedback/);

    let s = v;
    for (let i = 0; i < 2; i++) {
      const q = s.current!;
      const r = await play.submitAnswer(uid, s.session.id, q.id, keyFor(q.id));
      expect(r.isCorrect).toBe(true);
      expect(r.hint).toBeUndefined();
      expect(r.xpAwarded).toBeGreaterThanOrEqual(100);
      s = await play.advance(uid, s.session.id);
    }
    expect(s.session.targetDifficulty).toBe("medium");
    expect(s.session.lastAdaptation?.reason).toMatch(/Two correct in a row/);
  });

  it("case 2: wrong → tutor → follow-up correct → mastery rises, recovery XP", async () => {
    const v = await play.startSession(uid, demo.DEMO_QUEST_ID, { world: "classic" });
    const q = v.current!;
    const wrong = await play.submitAnswer(uid, v.session.id, q.id, wrongFor(q.id));
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.nextAction).toBe("tutor");
    expect(wrong.xpAwarded).toBe(0);
    expect(wrong.correctOptionId).toBe(keyFor(q.id));
    // The hint rides along with a wrong answer: the question is closed, so /hint would now refuse.
    expect(wrong.hint).toBe(demo.demoQuestions().find((x) => x.id === q.id)!.hint);
    await expect(play.takeHint(uid, v.session.id, q.id)).rejects.toMatchObject({ code: "NOT_CURRENT" });

    // Duplicate submission returns the same stored result, no double counting.
    const dup = await play.submitAnswer(uid, v.session.id, q.id, keyFor(q.id));
    expect(dup.duplicate).toBe(true);
    expect(dup.isCorrect).toBe(false);

    const ex = await tutor.explainMistake(uid, v.session.id, q.id, q.conceptId);
    expect(ex.origin).toBe("demo_prepared");
    expect(ex.fallbackReason).toMatch(/Demo mode/);
    expect(ex.tutor.whyWrong.length).toBeGreaterThan(10);
    expect(ex.tutor.steps.length).toBeGreaterThan(0);

    const fu = await tutor.createFollowUp(uid, v.session.id, q.id, q.conceptId);
    expect(fu.origin).toBe("template");
    expect(fu.question.followUpOf).toBe(q.id);
    expect(fu.question.text).not.toEqual(q.text);
    // idempotent
    const fu2 = await tutor.createFollowUp(uid, v.session.id, q.id, q.conceptId);
    expect(fu2.question.id).toBe(fu.question.id);

    const stored = await db().get<{ correctOptionId: string }>("questions", fu.question.id);
    const right = await play.submitAnswer(uid, v.session.id, fu.question.id, stored!.correctOptionId as "A");
    expect(right.isCorrect).toBe(true);
    expect(right.isFollowUp).toBe(true);
    expect(right.xpBreakdown.map((b) => b.label)).toContain("Mistake fixed");
    expect(right.mastery.after).toBeGreaterThan(right.mastery.before);
    expect(right.newAchievements.map((a) => a.id)).toContain("mistake-to-mastery");
  });

  it("case 3: repeated struggle lowers follow-up difficulty and simplifies the lesson", async () => {
    const uid3 = "u_test-student-0000003";
    const v = await play.startSession(uid3, demo.DEMO_QUEST_ID, { world: "maze" });
    let s = v;
    // Answer everything wrong on whichever concept appears, until a concept has 2 misses.
    let target: string | null = null;
    for (let i = 0; i < 12 && !target; i++) {
      const q = s.current!;
      await play.submitAnswer(uid3, s.session.id, q.id, wrongFor(q.id));
      const sess = await db().get<{ struggles: Record<string, number> }>("sessions", s.session.id);
      if ((sess!.struggles[q.conceptId] ?? 0) >= 2) {
        target = q.id;
        const ex = await tutor.explainMistake(uid3, s.session.id, q.id, q.conceptId);
        expect(ex.tutor.simplified).toBe(true);
        const fu = await tutor.createFollowUp(uid3, s.session.id, q.id, q.conceptId);
        expect(fu.reason).toMatch(/step easier/);
        const order = ["easy", "medium", "hard"];
        expect(order.indexOf(fu.difficulty)).toBeLessThanOrEqual(order.indexOf(q.difficulty));
        break;
      }
      s = await play.advance(uid3, s.session.id);
      if (i >= 1) expect(s.session.targetDifficulty).toBe("easy");
    }
    expect(target).not.toBeNull();
  });

  it("completes a quest and produces results with recommendations", async () => {
    const uid4 = "u_test-student-0000004";
    let s = await play.startSession(uid4, demo.DEMO_QUEST_ID, { world: "balloons" });
    let completed = false;
    let n = 0;
    while (!completed && n < 20) {
      const q = s.current!;
      // get one deliberately wrong
      const choice = n === 3 ? wrongFor(q.id) : keyFor(q.id);
      await play.submitAnswer(uid4, s.session.id, q.id, choice);
      const next = await play.advance(uid4, s.session.id);
      completed = next.completed;
      s = next;
      n++;
    }
    expect(completed).toBe(true);
    expect(n).toBe(10);
    const r = await play.sessionResults(uid4, s.session.id);
    expect(r.totals.answered).toBe(10);
    expect(r.totals.correct).toBe(9);
    expect(r.totals.accuracy).toBe(90);
    expect(r.totals.completionBonus).toBeGreaterThan(0);
    expect(r.recommendation.action).toBe("practice");
    expect(r.achievements.map((a) => a.id)).toEqual(expect.arrayContaining(["first-quest", "chapter-conqueror"]));
    // Practice weak concepts
    const p = await play.startSession(uid4, demo.DEMO_QUEST_ID, { world: "classic", practiceConceptIds: r.weakConceptIds });
    expect(p.session.kind).toBe("practice");
    expect(p.current?.origin).toBe("template");
  });

  it("rejects answering a question that is not open, and other users' sessions", async () => {
    const v = await play.startSession(uid, demo.DEMO_QUEST_ID, { world: "classic" });
    await expect(play.submitAnswer(uid, v.session.id, "demo-q99", "A")).rejects.toMatchObject({ status: 404 });
    await expect(play.submitAnswer("u_someone-else-00000001", v.session.id, v.current!.id, "A")).rejects.toMatchObject({ status: 404 });
  });

  it("one correct answer is not reported as mastery", async () => {
    const { computeMastery, masteryLabel } = await import("../engine/mastery");
    const one = computeMastery([{ correct: true, followUp: false, hint: false, difficulty: "medium", at: "" }]);
    expect(one).toBeLessThan(70);
    expect(masteryLabel(one, 1)).not.toBe("Mastered");
  });
});
