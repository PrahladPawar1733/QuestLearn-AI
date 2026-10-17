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
        if (k === "$schema" || k === "default" || k === "additionalProperties" || k === "pattern") continue;
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

function isTransient(e: unknown) {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  const status = (e as { status?: number })?.status;
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
  if (status === 429 || msg.includes("resource_exhausted"))
    return new AppError("AI_RATE_LIMITED", "The AI service is busy right now. Please try again in a minute.", 429, true);
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
      const parts: Part[] = [...(opts.parts as Part[])];
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
