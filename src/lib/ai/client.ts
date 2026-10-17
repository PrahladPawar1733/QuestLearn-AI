import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { audit } from "../audit";
import { config } from "../config";
import { AppError, Errors } from "../errors";

let client: GoogleGenAI | null = null;

export function aiAvailable() {
  return config.aiMode !== "demo";
}

export function genai(): GoogleGenAI {
  if (!aiAvailable()) throw Errors.aiUnavailable();
  if (!client) {
    client =
      config.aiMode === "vertex"
        ? new GoogleGenAI({ vertexai: true, project: config.project, location: config.location })
        : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/** Convert a zod schema to the JSON-Schema subset accepted by Gemini structured output. */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        // `maxItems` is rejected by Vertex's responseJsonSchema on nested
        // object arrays — it returns a bare 400 INVALID_ARGUMENT with no
        // indication of which keyword is at fault. Bisecting the real
        // question schema against the API showed removing ONLY `maxItems`
        // makes it valid (minItems, enum and anyOf are all accepted).
        //
        // Dropping it is safe: the bound still exists in the zod schema, so
        // an over-long response is caught by `safeParse` and fed back through
        // the repair retry. The provider simply is not told the ceiling.
        if (k === "$schema" || k === "default" || k === "additionalProperties" || k === "pattern" || k === "maxItems") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json);
}

export type InputPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

interface GenerateOpts<T extends z.ZodType> {
  operation: string;
  schema: T;
  system: string;
  parts: InputPart[];
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  ownerId?: string;
  inputRefs?: string[];
  /** Max retries on transient errors (timeout, 429, 5xx). */
  retries?: number;
}

/**
 * Pull quota details out of a provider error.
 *
 * Google returns two very different things with the same 429: a short
 * per-minute burst limit, and a per-DAY project quota that will not reset for
 * hours. Treating them alike means we retry a daily exhaustion twice for
 * nothing and then tell the student to "try again in a minute", which is
 * simply false.
 */
function quotaInfo(e: unknown): { perDay: boolean; retrySeconds: number | null } {
  let raw = "";
  try {
    raw = typeof (e as Error)?.message === "string" ? (e as Error).message : JSON.stringify(e ?? "");
  } catch {
    raw = String(e);
  }
  const perDay = /PerDay|per_day|requests per day|free_tier_requests/i.test(raw);
  const m = raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return { perDay, retrySeconds: m ? Math.round(Number(m[1])) : null };
}

/** "about 11 hours" / "about 4 minutes" — vague on purpose; the exact second is noise. */
function humanDelay(seconds: number): string {
  if (seconds < 90) return `about ${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < 5400) return `about ${Math.round(seconds / 60)} minutes`;
  return `about ${Math.round(seconds / 3600)} hours`;
}

function isTransient(e: unknown) {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  const status = (e as { status?: number })?.status;
  // A daily quota will not recover inside a retry loop, so do not spend one.
  if (status === 429 || msg.includes("resource_exhausted")) {
    const q = quotaInfo(e);
    if (q.perDay || (q.retrySeconds ?? 0) > 300) return false;
  }
  return (
    status === 429 ||
    (status !== undefined && status >= 500) ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("deadline")
  );
}

function mapProviderError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const status = (e as { status?: number })?.status;
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  if (status === 429 || msg.includes("resource_exhausted")) {
    const q = quotaInfo(e);
    if (q.perDay || (q.retrySeconds ?? 0) > 300) {
      const when = q.retrySeconds ? ` It resets in ${humanDelay(q.retrySeconds)}.` : "";
      return new AppError(
        "AI_QUOTA_EXHAUSTED",
        `This project's daily AI quota is used up.${when} Your upload is saved — you can retry once it resets, or switch to a model that still has quota.`,
        429,
        // Not retryable: the retry loop cannot outlast a daily window.
        false,
      );
    }
    return new AppError("AI_RATE_LIMITED", "The AI service is busy right now. Please try again in a minute.", 429, true);
  }
  if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("deadline"))
    return new AppError("AI_TIMEOUT", "The AI took too long to respond. Your work is saved, so you can retry.", 504, true);
  if (status === 404) return new AppError("AI_MODEL_NOT_FOUND", "The configured AI model isn't available in this project.", 502, false);
  if (status === 401 || status === 403)
    return new AppError("AI_PERMISSION", "The server doesn't have permission to use the AI model.", 502, false);
  return new AppError("AI_ERROR", "Something went wrong talking to the AI service. Please try again.", 502, true);
}

/**
 * Calls Gemini with structured JSON output, validates the result with zod,
 * retries transient failures with backoff and invalid output once with the
 * validation error as feedback, and records an audit entry.
 */
export async function generateJson<T extends z.ZodType>(opts: GenerateOpts<T>): Promise<z.infer<T>> {
  const ai = genai();
  const model = opts.model ?? config.model;
  const started = Date.now();
  const maxTransient = opts.retries ?? 2;
  let transientRetries = 0;
  let repairAttempted = false;
  let feedback: string | null = null;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? config.aiTimeoutMs);
    try {
      // Vertex rejects an empty text part with a bare 400 INVALID_ARGUMENT,
      // which is exactly what happens when an earlier stage (transcription)
      // failed and left us with nothing to work from. Drop empties and fail
      // with a message that names the real problem instead.
      const parts: Part[] = (opts.parts as Part[]).filter(
        (p) => !("text" in p) || (typeof p.text === "string" && p.text.trim().length > 0),
      );
      if (parts.length === 0) {
        throw new AppError(
          "AI_NO_INPUT",
          "There was no readable content to work from. Re-run the reading step, or retake the unclear pages.",
          422,
          false,
        );
      }
      if (feedback) parts.push({ text: `Your previous response was rejected by validation: ${feedback}\nReturn corrected JSON only.` });
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.4,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(opts.schema),
          abortSignal: controller.signal,
        },
      });
      clearTimeout(timer);
      const text = res.text ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new SchemaFailure("Response was not valid JSON");
      }
      const result = opts.schema.safeParse(parsed);
      if (!result.success) {
        throw new SchemaFailure(
          result.error.issues
            .slice(0, 6)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      }
      await audit({
        operation: opts.operation,
        model,
        ownerId: opts.ownerId,
        inputRefs: opts.inputRefs ?? [],
        outcome: "success",
        retries: transientRetries + (repairAttempted ? 1 : 0),
        durationMs: Date.now() - started,
      });
      return result.data;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof SchemaFailure && !repairAttempted) {
        repairAttempted = true;
        feedback = e.message;
        continue;
      }
      if (!(e instanceof SchemaFailure) && isTransient(e) && transientRetries < maxTransient) {
        transientRetries++;
        await new Promise((r) => setTimeout(r, 800 * 2 ** (transientRetries - 1) + Math.random() * 300));
        continue;
      }
      const status = (e as { status?: number })?.status;
      if (status === 400) {
        // A 400 is our fault, not the model's. Record the shape of what we
        // sent so the cause is visible without a live reproduction.
        console.error("[ai] 400 from provider", {
          operation: opts.operation,
          model,
          partCount: (opts.parts as Part[]).length,
          textChars: (opts.parts as Part[]).reduce((n, p) => n + ("text" in p && typeof p.text === "string" ? p.text.length : 0), 0),
          schemaBytes: JSON.stringify(toGeminiSchema(opts.schema)).length,
        });
      }
      const appErr =
        e instanceof SchemaFailure
          ? new AppError("AI_INVALID_OUTPUT", "The AI returned something we couldn't use. Please try again.", 502, true)
          : mapProviderError(e);
      await audit({
        operation: opts.operation,
        model,
        ownerId: opts.ownerId,
        inputRefs: opts.inputRefs ?? [],
        outcome: e instanceof SchemaFailure ? "validation_failed" : "error",
        detail: appErr.code,
        retries: transientRetries + (repairAttempted ? 1 : 0),
        durationMs: Date.now() - started,
      });
      console.error(`[ai] ${opts.operation} failed`, (e as Error)?.message);
      throw appErr;
    }
  }
}

class SchemaFailure extends Error {}
