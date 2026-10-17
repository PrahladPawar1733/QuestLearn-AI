import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { analyzeMaterial } from "@/lib/services/materials";
import { publicMaterial } from "@/lib/services/public";

export const maxDuration = 300;

/** POST /api/materials/:id/analyze: reading + concept extraction (resumable). */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/materials/[id]/analyze">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  rateLimit("analyze", uid);
  const m = await analyzeMaterial(uid, id);
  return json({ material: publicMaterial(m) });
});
