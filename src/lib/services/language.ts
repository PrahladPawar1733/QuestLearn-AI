import "server-only";
import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { config } from "../config";
import { db } from "../db";
import { AppError } from "../errors";
import { ttsCode, type Lang } from "../language/langs";
import { speakable } from "../language/speakable";
import { blobs } from "../storage";

/**
 * Cloud Translation + Text-to-Speech. Both run on demand (when a student switches language or
 * presses Listen), never inside quest generation, and both are cached, so they add no time to
 * the AI pipeline and each text is only paid for once.
 */
export type { Lang } from "../language/langs";

let auth: GoogleAuth | null = null;
async function gcp() {
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  // User credentials (local dev) need the quota project named; harmless for service accounts.
  const headers = { "x-goog-user-project": config.project };
  return { client, headers };
}

export function languageAvailable() {
  return config.aiMode === "vertex" && !!config.project;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);

/** Keep LaTeX out of the translator's hands; HTML mode leaves translate="no" spans alone. */
function protect(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/(\$\$[\s\S]+?\$\$|\$[^$]+\$)/g, '<span translate="no">$1</span>');
}
function unprotect(html: string) {
  return html
    .replace(/<span translate="no">([\s\S]*?)<\/span>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

interface CachedTranslation {
  id: string;
  target: Lang;
  text: string;
  createdAt: string;
}

/** Translate a batch; cached per (language, text). Returns originals for English. */
export async function translateTexts(texts: string[], target: Lang): Promise<string[]> {
  if (target === "en") return texts;
  if (!languageAvailable()) throw new AppError("LANGUAGE_UNAVAILABLE", "Translation isn't configured on this server.", 503);
  const ids = texts.map((t) => hash(`${target}\n${t}`));
  const cached = new Map((await db().getMany<CachedTranslation>("translations", [...new Set(ids)])).map((d) => [d.id, d.text]));
  const missing = [...new Set(texts.filter((t, i) => t.trim() && !cached.has(ids[i])))];
  if (missing.length) {
    const { client, headers } = await gcp();
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const r = await client.request<{ translations: { translatedText: string }[] }>({
        url: `https://translation.googleapis.com/v3/projects/${config.project}/locations/global:translateText`,
        method: "POST",
        headers,
        data: { contents: chunk.map(protect), sourceLanguageCode: "en", targetLanguageCode: target, mimeType: "text/html" },
      });
      await Promise.all(
        r.data.translations.map(async (t, j) => {
          const id = hash(`${target}\n${chunk[j]}`);
          const text = unprotect(t.translatedText);
          cached.set(id, text);
          await db().set("translations", { id, target, text, createdAt: new Date().toISOString() } satisfies CachedTranslation);
        }),
      );
    }
  }
  return texts.map((t, i) => cached.get(ids[i]) ?? t);
}

/**
 * Best fast voice per language, looked up once: Neural2, then Wavenet, then Standard.
 * (Chirp3-HD sounds richer but took ~4.7 s per passage vs ~0.3 s, measured 2026-10-18.)
 */
const voiceCache = new Map<string, { languageCode: string; name?: string }>();
async function voiceFor(lang: Lang) {
  const languageCode = ttsCode(lang);
  const hit = voiceCache.get(languageCode);
  if (hit) return hit;
  let voice: { languageCode: string; name?: string } = { languageCode };
  try {
    const { client, headers } = await gcp();
    const r = await client.request<{ voices?: { name: string }[] }>({ url: `https://texttospeech.googleapis.com/v1/voices?languageCode=${languageCode}`, headers });
    const names = (r.data.voices ?? []).map((v) => v.name).filter((n) => n.startsWith(languageCode));
    const name = ["Neural2", "Wavenet", "Standard"].map((t) => names.find((n) => n.includes(`-${t}-`))).find(Boolean);
    if (name) voice = { languageCode, name };
  } catch {
    /* fall back to the language's default voice */
  }
  voiceCache.set(languageCode, voice);
  return voice;
}

/** Split text into pieces of at most `max` UTF-8 bytes, preferring sentence and then word breaks. */
export function chunkByBytes(text: string, max: number): string[] {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  const out: string[] = [];
  let cur = "";
  for (const sentence of text.match(/[^.!?।؟]+[.!?।؟]*\s*/g) ?? [text]) {
    if (bytes(cur + sentence) <= max) {
      cur += sentence;
      continue;
    }
    if (cur.trim()) out.push(cur.trim());
    cur = "";
    // A single sentence longer than the limit: fall back to word breaks.
    for (const word of sentence.split(/(\s+)/)) {
      if (bytes(cur + word) > max && cur.trim()) {
        out.push(cur.trim());
        cur = "";
      }
      cur += word;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Speech for a passage, as MP3. Cached in Cloud Storage by (voice, text). */
export async function synthesize(text: string, lang: Lang): Promise<Buffer> {
  if (!languageAvailable()) throw new AppError("LANGUAGE_UNAVAILABLE", "Speech isn't configured on this server.", 503);
  const spoken = speakable(text);
  if (!spoken) throw new AppError("NOTHING_TO_READ", "There's nothing to read aloud.", 400);
  const voice = await voiceFor(lang);
  const key = `cache/tts/${voice.name ?? voice.languageCode}/${hash(spoken)}.mp3`;
  try {
    return await blobs().get(key);
  } catch {
    /* not cached yet */
  }
  const { client, headers } = await gcp();
  const call = (input: string, v: { languageCode: string; name?: string }) =>
    client.request<{ audioContent: string }>({
      url: "https://texttospeech.googleapis.com/v1/text:synthesize",
      method: "POST",
      headers,
      data: { input: { text: input }, voice: v, audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 } },
    });
  // The API takes at most 5,000 BYTES per request (an Indian-script character is 3 bytes), so long
  // passages are split at sentence ends, spoken in parallel, and the MP3s joined (frames concatenate).
  const parts = await Promise.all(
    chunkByBytes(spoken, 4500).map(async (piece) => {
      const r = await call(piece, voice).catch(() => call(piece, { languageCode: voice.languageCode }));
      return Buffer.from(r.data.audioContent, "base64");
    }),
  );
  const audio = Buffer.concat(parts);
  // Cache in the background: the student shouldn't wait for the upload.
  void blobs().put(key, audio, "audio/mpeg").catch(() => undefined);
  return audio;
}
