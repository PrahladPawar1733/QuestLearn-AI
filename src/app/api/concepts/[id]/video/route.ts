import { db } from "@/lib/db";
import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { refreshVideo, requestConceptVideo } from "@/lib/services/video";
import { blobs } from "@/lib/storage";
import type { LearningAsset } from "@/lib/types";


async function present(a: LearningAsset) {
  let url: string | null = null;
  if (a.generationStatus === "ready" && a.storagePath?.startsWith("gs://")) {
    url = await blobs().signedUrl(a.storagePath.replace(/^gs:\/\/[^/]+\//, ""), 600);
  }
  return { status: a.generationStatus, error: a.error ?? null, url };
}

/** POST starts (or resumes) a video job; GET polls it. */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/concepts/[id]/video">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  rateLimit("video", uid);
  return json(await present(await requestConceptVideo(uid, id)), 202);
});

export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/concepts/[id]/video">) => {
  const uid = await requireUid();
  const { id } = await ctx.params;
  const a = await db().get<LearningAsset>("assets", `video__${uid}__${id}`);
  if (!a) return json({ status: "none", error: null, url: null });
  return json(await present(await refreshVideo(a)));
});
