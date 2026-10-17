import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { generateQuestForMaterial } from "@/lib/services/materials";
import { publicMaterial } from "@/lib/services/public";

export const maxDuration = 300;

/** POST /api/materials/:id/generate-quest: generate, validate and assemble the quest (idempotent). */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/materials/[id]/generate-quest">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  rateLimit("analyze", uid);
  const { material, quest } = await generateQuestForMaterial(uid, id);
  return json({ material: publicMaterial(material), quest: { id: quest.id, title: quest.title, questionCount: quest.questionIds.length, playLength: quest.playLength, rejectedCount: quest.rejectedCount } });
});
