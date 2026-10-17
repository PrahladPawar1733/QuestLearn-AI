import { z } from "zod";
import { handler, json, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { startSession } from "@/lib/services/play";
import { GameWorld } from "@/lib/types";

const Body = z.object({ world: GameWorld.default("classic"), practiceConceptIds: z.array(z.string().max(120)).max(6).optional() });

/** POST /api/quests/:id/start: begin a play session (or a revision practice session). */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/quests/[id]/start">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  const body = await parseJson(req, Body);
  return json(await startSession(uid, id, { world: body.world, practiceConceptIds: body.practiceConceptIds }), 201);
});
