"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RichText } from "@/components/math/rich-text";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/ui/origin-badge";
import { api, ApiError } from "@/lib/api-client";
import { LanguageSelect, ListenButton, T, useTranslated } from "@/lib/language/client";
import type { SessionReport as Report } from "@/lib/services/report";

/** End-of-run coaching report: what to learn, why answers went wrong, what to do next. Loads after the page. */
export function SessionReport({ sessionId }: { sessionId: string }) {
  const reduced = useReducedMotion();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const src = report ? [report.summary, report.strengths, ...report.focus.flatMap((f) => [f.title, f.whatWentWrong, f.keyIdea, ...f.nextSteps])] : [];
  const { texts: tr } = useTranslated(src);
  let k = 2;
  const view = report && {
    ...report,
    summary: tr[0],
    strengths: tr[1],
    focus: report.focus.map((f) => ({ ...f, title: tr[k++], whatWentWrong: tr[k++], keyIdea: tr[k++], nextSteps: f.nextSteps.map(() => tr[k++]) })),
  };

  useEffect(() => {
    let alive = true;
    api<Report>(`/api/sessions/${sessionId}/report`, { method: "POST", retries: 1 })
      .then((r) => alive && (setReport(r), setError(null)))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Couldn't write your report.", 0, true)));
    return () => {
      alive = false;
    };
  }, [sessionId, attempt]);

  return (
    <section aria-labelledby="report-h" aria-busy={!report && !error}>
      <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 id="report-h" className="t-headline text-ink">
          <T>Your report</T>
        </h2>
        {report && <OriginBadge origin={report.origin} />}
      </div>

      {!report && !error && (
        <p className="flex items-center gap-2 py-4 t-subhead text-muted" aria-live="polite">
          <Loader2 className="size-4 animate-spin" /> Looking over your answers…
        </p>
      )}

      {error && !report && (
        <div className="flex flex-wrap items-center gap-3 py-4" role="alert">
          <p className="t-subhead text-muted">{error.message}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
          >
            <RefreshCw /> Try again
          </Button>
        </div>
      )}

      {view && (
        <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="pt-3">
          {view!.fallbackReason && <p className="mb-2 t-footnote text-amber">{view!.fallbackReason}</p>}
          <RichText as="p" text={view!.summary} className="t-body text-ink" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ListenButton
              label="Listen to your report"
              text={[view!.summary, ...view!.focus.map((f) => `${f.title}. ${f.whatWentWrong} ${f.keyIdea} ${f.nextSteps.join(" ")}`)].join(" ")}
            />
            <LanguageSelect />
          </div>

          {view!.focus.length > 0 && (
            <ol className="mt-2 divide-y divide-line">
              {view!.focus.map((f, i) => (
                <li key={f.conceptId} className="py-5">
                  <div className="flex items-baseline gap-3">
                    <span className="t-footnote text-faint tabular">{i + 1}</span>
                    <h3 className="min-w-0 flex-1 t-headline text-ink">{f.title}</h3>
                    <Link href={`/learn/${encodeURIComponent(f.conceptId)}`} className="shrink-0 t-footnote text-ink hover:opacity-70">
                      Review
                    </Link>
                  </div>
                  <dl className="mt-3 space-y-3 pl-6">
                    <div>
                      <dt className="t-footnote text-muted">
                        <T>What went wrong</T>
                      </dt>
                      <dd className="t-callout text-ink">
                        <RichText text={f.whatWentWrong} />
                      </dd>
                    </div>
                    {f.keyIdea && (
                      <div>
                        <dt className="t-footnote text-muted">
                        <T>The idea to learn</T>
                      </dt>
                        <dd className="t-callout text-ink">
                          <RichText text={f.keyIdea} />
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="t-footnote text-muted">
                        <T>What to do</T>
                      </dt>
                      <dd>
                        <ul className="mt-0.5 space-y-1 t-callout text-ink">
                          {f.nextSteps.map((s, j) => (
                            <li key={j} className="flex gap-2">
                              <span aria-hidden className="text-faint">
                                –
                              </span>
                              <RichText text={s} />
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          )}

          {view!.strengths && <p className="mt-1 border-t border-line pt-4 t-subhead text-muted">{view!.strengths}</p>}
        </motion.div>
      )}
    </section>
  );
}
