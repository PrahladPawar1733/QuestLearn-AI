import { z } from "zod";
import { LANG_CODES } from "@/lib/language/langs";
import { handler, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { synthesize } from "@/lib/services/language";

const Body = z.object({ text: z.string().min(1).max(20000), lang: z.enum(LANG_CODES) });

/** POST /api/tts: read a passage aloud (MP3, cached in Cloud Storage). */
export const POST = handler(async (req: Request) => {
  const uid = await requireUid();
  rateLimit("tts", uid);
  const body = await parseJson(req, Body);
  const audio = await synthesize(body.text, body.lang);
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
});
