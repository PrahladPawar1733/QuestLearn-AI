import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { advance } from "@/lib/services/play";

/** POST /api/sessions/:id/next: adaptive selection of the next question, or quest completion. */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/sessions/[id]/next">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  return json(await advance(uid, id));
});
