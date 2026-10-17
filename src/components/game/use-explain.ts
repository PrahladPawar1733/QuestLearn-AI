"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { ExplainResult } from "@/lib/services/tutor";

/**
 * Loads the lesson for a wrong answer (cached server-side per attempt).
 * Two requests run together: the stored lesson comes back instantly, and the
 * tailored AI lesson replaces it when ready.
 */
export function useExplain(target: { sessionId: string; questionId: string; conceptId: string } | null) {
  const [data, setData] = useState<ExplainResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = target ? `${target.sessionId}:${target.questionId}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    let full = false;
    const k = `${target.sessionId}:${target.questionId}`;
    const url = `/api/concepts/${encodeURIComponent(target.conceptId)}/explain`;
    const body = { sessionId: target.sessionId, questionId: target.questionId };

    api<ExplainResult>(url, { method: "POST", json: { ...body, quick: true }, retries: 0 })
      .then((d) => {
        if (!alive || full) return;
        setData(d);
        setError(null);
        setLoadedKey(k);
      })
      .catch(() => {
        /* the full request below reports errors */
      });

    api<ExplainResult>(url, { method: "POST", json: body })
      .then((d) => {
        if (!alive) return;
        full = true;
        setData(d);
        setError(null);
        setLoadedKey(k);
      })
      .catch((e) => {
        if (!alive) return;
        full = true;
        // Keep the stored lesson if we have it; just stop saying a better one is coming.
        setData((prev) => (prev ? { ...prev, pending: false } : prev));
        setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't load the explanation.", 0, true));
        setLoadedKey(k);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const fresh = loadedKey === key;
  const retry = useCallback(() => {
    setLoadedKey(null);
    setAttempt((a) => a + 1);
  }, []);
  return { data: fresh ? data : null, error: fresh ? error : null, loading: !!target && !fresh, retry };
}
