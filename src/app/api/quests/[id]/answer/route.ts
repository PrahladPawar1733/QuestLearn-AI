import { z } from "zod";
import { AppError } from "@/lib/errors";
import { handler, json, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { loadSession } from "@/lib/services/access";
import { submitAnswer } from "@/lib/services/play";

const Body = z.object({
  sessionId: z.string().min(1).max(80),
  questionId: z.string().min(1).max(80),
  selectedOptionId: z.enum(["A", "B", "C", "D", "E"]),
});

/**
 * POST /api/quests/:id/answer: score an answer on the server.
 * Idempotent per (session, question): a retried request returns the original result.
 */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/quests/[id]/answer">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  const body = await parseJson(req, Body);
  const s = await loadSession(body.sessionId, uid);
  if (s.questId !== id) throw new AppError("MISMATCH", "That session belongs to a different quest.", 400);
  return json(await submitAnswer(uid, body.sessionId, body.questionId, body.selectedOptionId));
});
