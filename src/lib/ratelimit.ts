import "server-only";
import { Errors } from "./errors";

/**
 * Per-instance sliding-window limiter for expensive operations. On Cloud Run
 * with several instances this is a per-instance limit, which is enough to
 * stop accidental loops and casual abuse. Use a shared store for strict quotas.
 */
const LIMITS = {
  upload: { max: 12, windowMs: 10 * 60_000 },
  analyze: { max: 8, windowMs: 10 * 60_000 },
  tutor: { max: 60, windowMs: 10 * 60_000 },
  followup: { max: 60, windowMs: 10 * 60_000 },
  video: { max: 3, windowMs: 60 * 60_000 },
  translate: { max: 300, windowMs: 10 * 60_000 },
  tts: { max: 120, windowMs: 10 * 60_000 },
} as const;

const hits = new Map<string, number[]>();

export function rateLimit(kind: keyof typeof LIMITS, key: string) {
  const { max, windowMs } = LIMITS[kind];
  const now = Date.now();
  const k = `${kind}:${key}`;
  const list = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    const retry = Math.ceil((windowMs - (now - list[0])) / 1000);
    throw Errors.rateLimited(retry);
  }
  list.push(now);
  hits.set(k, list);
}
