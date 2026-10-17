import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { sessionReport } from "@/lib/services/report";

export const maxDuration = 120;

/** POST /api/sessions/:id/report: the end-of-run coaching report (written once, then cached). */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/sessions/[id]/report">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  rateLimit("tutor", uid);
  return json(await sessionReport(uid, id));
});
