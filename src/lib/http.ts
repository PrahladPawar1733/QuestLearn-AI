import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
}

/**
 * Wraps a route handler with consistent error mapping and request logging.
 * Logs method, path, status and duration only: no bodies, no student content.
 */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const started = Date.now();
    const path = new URL(req.url).pathname;
    let status = 500;
    try {
      const res = await fn(req, ctx);
      status = res.status;
      return res;
    } catch (e) {
      const err =
        e instanceof AppError
          ? e
          : new AppError("INTERNAL", "Something went wrong on our side. Please try again.", 500, true);
      if (!(e instanceof AppError)) console.error(`[api] ${req.method} ${path}`, (e as Error)?.stack ?? e);
      status = err.status;
      const body: ApiErrorBody = { error: { code: err.code, message: err.userMessage, retryable: err.retryable, details: err.details } };
      const headers: Record<string, string> = {};
      if (err.status === 429 && typeof err.details?.retryAfter === "number") headers["Retry-After"] = String(err.details.retryAfter);
      return NextResponse.json(body, { status: err.status, headers });
    } finally {
      console.info(JSON.stringify({ severity: "INFO", component: "api", method: req.method, path, status, ms: Date.now() - started }));
    }
  };
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("BAD_JSON", "The request body must be valid JSON.", 400);
  }
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError("VALIDATION", "Some of the request fields are invalid.", 400, false, {
      issues: r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
