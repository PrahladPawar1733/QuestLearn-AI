import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { loadOwnedMaterial } from "@/lib/services/access";
import { deleteMaterial } from "@/lib/services/materials";
import { publicMaterial } from "@/lib/services/public";

/** GET /api/materials/:id: processing status and metadata (polled by the create page). */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/materials/[id]">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  return json({ material: publicMaterial(await loadOwnedMaterial(id, uid)) });
});

/** DELETE /api/materials/:id: removes files, quest, questions, attempts and mastery for this material. */
export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/materials/[id]">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  await deleteMaterial(uid, id);
  return json({ deleted: true });
});
