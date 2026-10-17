import { z } from "zod";
import { handler, json, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { takeHint } from "@/lib/services/play";

const Body = z.object({ sessionId: z.string().min(1).max(80), questionId: z.string().min(1).max(80) });

/** POST /api/quests/:id/hint: reveal the hint (recorded server-side; reduces XP for this question). */
export const POST = handler(async (req: Request) => {
  const uid = await requireUid();
  const body = await parseJson(req, Body);
  return json(await takeHint(uid, body.sessionId, body.questionId));
});
