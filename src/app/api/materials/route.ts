import { z } from "zod";
import { AppError } from "@/lib/errors";
import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { createMaterial } from "@/lib/services/materials";
import { publicMaterial } from "@/lib/services/public";
import { DifficultyPreference, Subject } from "@/lib/types";


const Fields = z.object({
  title: z.string().max(120).default(""),
  subject: Subject.default("Physics"),
  grade: z.string().max(20).default("11"),
  goal: z.string().max(200).default(""),
  difficulty: DifficultyPreference.default("mixed"),
  questionCount: z.coerce.number().int().min(4).max(15).default(10),
});

/** POST /api/materials: multipart upload of PDFs / images + quest settings. */
export const POST = handler(async (req: Request) => {
  const uid = await requireUid();
  rateLimit("upload", uid);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("BAD_UPLOAD", "The upload couldn't be read. Please try again.", 400, true);
  }
  const raw = Object.fromEntries(["title", "subject", "grade", "goal", "difficulty", "questionCount"].map((k) => [k, form.get(k) ?? undefined]));
  const parsed = Fields.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION", "Some of the quest settings are invalid.", 400);
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  const data = await Promise.all(files.map(async (f) => ({ name: f.name || "upload", data: Buffer.from(await f.arrayBuffer()) })));
  const { title, ...settings } = parsed.data;
  const material = await createMaterial(uid, { title, settings, files: data });
  return json({ material: publicMaterial(material) }, 201);
});
