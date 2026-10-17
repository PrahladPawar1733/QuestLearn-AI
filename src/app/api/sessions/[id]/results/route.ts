import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { sessionResults } from "@/lib/services/play";

export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/sessions/[id]/results">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  return json(await sessionResults(uid, id));
});
