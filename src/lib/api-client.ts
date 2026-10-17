"use client";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * fetch wrapper for the app's JSON API. Network failures are retried with
 * backoff (safe because mutating endpoints are idempotent), and errors are
 * surfaced as ApiError with a student-friendly message.
 */
export async function api<T>(url: string, init?: RequestInit & { retries?: number; json?: unknown }): Promise<T> {
  const { retries = 2, json, ...rest } = init ?? {};
  const opts: RequestInit = { ...rest, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers } };
  if (json !== undefined) opts.body = JSON.stringify(json);
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const e = body?.error;
        throw new ApiError(e?.code ?? "HTTP_" + res.status, e?.message ?? "Something went wrong. Please try again.", res.status, !!e?.retryable);
      }
      return body as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof ApiError) throw e;
      // network error: retry
      if (i < retries) await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw new ApiError("NETWORK", "You seem to be offline. Check your connection and try again.", 0, true);
  void lastErr;
}
