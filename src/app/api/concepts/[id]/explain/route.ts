import { z } from "zod";
import { handler, json, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { explainMistake } from "@/lib/services/tutor";

const Body = z.object({ sessionId: z.string().min(1).max(80), questionId: z.string().min(1).max(80) });

export const maxDuration = 60;

/** POST /api/concepts/:id/explain: targeted explanation of a wrong answer. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/concepts/[id]/explain">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  rateLimit("tutor", uid);
  const body = await parseJson(req, Body);
  return json(await explainMistake(uid, body.sessionId, body.questionId, id));
});
