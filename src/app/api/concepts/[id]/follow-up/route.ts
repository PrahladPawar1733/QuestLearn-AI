import { z } from "zod";
import { handler, json, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { createFollowUp } from "@/lib/services/tutor";

const Body = z.object({ sessionId: z.string().min(1).max(80), questionId: z.string().min(1).max(80) });

export const maxDuration = 90;

/** POST /api/concepts/:id/follow-up: a validated follow-up question on the same concept. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/concepts/[id]/follow-up">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  rateLimit("followup", uid);
  const body = await parseJson(req, Body);
  return json(await createFollowUp(uid, body.sessionId, body.questionId, id), 201);
});
