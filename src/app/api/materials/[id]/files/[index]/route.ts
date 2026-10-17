import { NextResponse } from "next/server";
import { Errors } from "@/lib/errors";
import { handler } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { loadOwnedMaterial } from "@/lib/services/access";
import { blobs } from "@/lib/storage";


/** Owner-only access to an uploaded file: short-lived signed URL on GCS, streamed locally. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/materials/[id]/files/[index]">) => {
  const uid = await requireUid();
  const { id, index } = await ctx.params;
  const m = await loadOwnedMaterial(id, uid);
  const f = m.files.find((x) => x.index === Number(index));
  if (!f) throw Errors.notFound("file");
  const path = f.processedPath ?? f.storagePath;
  const key = path.replace(/^local:\/\//, "").replace(/^gs:\/\/[^/]+\//, "");
  const signed = await blobs().signedUrl(key, 300);
  if (signed) return NextResponse.redirect(signed, 302);
  const buf = await blobs().get(key);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": f.processedPath ? "image/jpeg" : f.mimeType, "Cache-Control": "private, max-age=300" },
  });
});
