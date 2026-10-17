"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { ExplainResult } from "@/lib/services/tutor";

/** Loads the lesson for a wrong answer (cached server-side per attempt). */
export function useExplain(target: { sessionId: string; questionId: string; conceptId: string } | null) {
  const [data, setData] = useState<ExplainResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = target ? `${target.sessionId}:${target.questionId}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    api<ExplainResult>(`/api/concepts/${encodeURIComponent(target.conceptId)}/explain`, {
      method: "POST",
      json: { sessionId: target.sessionId, questionId: target.questionId },
    })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        setLoadedKey(`${target.sessionId}:${target.questionId}`);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't load the explanation.", 0, true));
        setLoadedKey(`${target.sessionId}:${target.questionId}`);
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
