import { Firestore } from "@google-cloud/firestore";
import { generateJson } from "../src/lib/ai/client";
import { TRANSCRIBE_SYSTEM } from "../src/lib/ai/prompts";
import { TranscriptionOut } from "../src/lib/ai/schemas";
import { tutorFollowUp } from "../src/lib/ai/workflows";
import fs from "node:fs";
async function main() {
  const db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  const qs = (await db.collection("ql_questions").where("questId", "==", "qst_f2338kge7lf86s").get()).docs.map((d) => d.data());
  const missed = qs.find((x) => x.category === "numerical") ?? qs[0];
  const c = (await db.collection("ql_concepts").doc(missed.conceptId).get()).data()!;
  const m = (await db.collection("ql_materials").doc(c.materialId).get()).data()!;
  const excerpt = m.transcription.map((p: { ref: string; transcript: string }) => `### ${p.ref}\n${p.transcript}`).join("\n\n").slice(0, 8000);
  const pdf = fs.readFileSync("/Users/prahladpawar/Desktop/cbse-class-11-chemistry-notes-chapter-6-thermodynamics.pdf").toString("base64");
  const time = async (label: string, f: () => Promise<unknown>) => {
    const t0 = Date.now();
    try { const r = await f(); console.log(label, ((Date.now() - t0) / 1000).toFixed(1) + "s", r === null ? "(rejected by checks)" : "ok"); }
    catch (e) { console.log(label, ((Date.now() - t0) / 1000).toFixed(1) + "s", "ERR", (e as Error).message); }
  };
  const fu = (thinking?: "minimal" | "low") => () => tutorFollowUp({ missed: missed as never, conceptKey: c.key, conceptTitle: c.title, difficulty: missed.difficulty, sourceExcerpt: excerpt, grade: "11", subject: "Chemistry", avoid: [], ownerId: "probe", thinking });
  const tr = () => generateJson({ operation: "material.transcribe", schema: TranscriptionOut, system: TRANSCRIBE_SYSTEM, parts: [{ text: "Source: PDF 1" }, { inlineData: { mimeType: "application/pdf", data: pdf } }, { text: "Transcribe all sources above." }], temperature: 0.1, timeoutMs: 290_000, retries: 0 });
  await Promise.all([
    time("transcribe #1", tr), time("transcribe #2", tr),
    time("follow-up default #1", fu()), time("follow-up default #2", fu()),
    time("follow-up low #1", fu("low")), time("follow-up low #2", fu("low")),
    time("follow-up minimal #1", fu("minimal")), time("follow-up minimal #2", fu("minimal")),
  ]);
}
main().then(() => process.exit(0));
