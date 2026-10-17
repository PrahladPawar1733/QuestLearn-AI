import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { loadQuest, loadSession } from "@/lib/services/access";
import { viewSession } from "@/lib/services/play";

/** GET /api/sessions/:id: resume a session after a refresh or network drop. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/sessions/[id]">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  const s = await loadSession(id, uid);
  return json(await viewSession(s, await loadQuest(s.questId, uid)));
});
