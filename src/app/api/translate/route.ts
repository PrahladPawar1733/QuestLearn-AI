import { z } from "zod";
import { LANG_CODES } from "@/lib/language/langs";
import { handler, json, parseJson } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { rateLimit } from "@/lib/ratelimit";
import { translateTexts } from "@/lib/services/language";

const Body = z.object({ texts: z.array(z.string().max(4000)).max(80), target: z.enum(LANG_CODES) });

/** POST /api/translate: translate on-screen learning content (cached per text). */
export const POST = handler(async (req: Request) => {
  const uid = await requireUid();
  rateLimit("translate", uid);
  const body = await parseJson(req, Body);
  return json({ texts: await translateTexts(body.texts, body.target) });
});
