"use client";

import { AlertTriangle, ArrowRight, ChevronDown, Film, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { RichText, Tex } from "@/components/math/rich-text";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/ui/origin-badge";
import { Visual } from "@/components/viz/visual";
import { api, type ApiError } from "@/lib/api-client";
import type { ExplainResult } from "@/lib/services/tutor";

export interface TutorActions {
  canFollowUp: boolean;
  onTrySimilar: () => void;
  onContinue: () => void;
  busy: "followup" | "continue" | null;
  followUpError: string | null;
}

/** Title + the two choices. Stays visible even when the sheet is pulled down to "peek". */
export function TutorHeader({ data, actions }: { data: ExplainResult | null; loading?: boolean; actions: TutorActions }) {
  return (
    <div className="px-5 pb-4 pt-1">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="tutor-heading" className="t-headline text-ink">
            Not quite
          </h2>
          <p className="truncate t-footnote text-muted">{data ? data.tutor.conceptTitle : "Here's what to look at."}</p>
        </div>
        {data && !data.pending && <OriginBadge origin={data.origin} className="mt-1 shrink-0 text-faint" />}
      </div>
      <div className="mt-3 flex gap-2">
        {actions.canFollowUp && (
          <Button className="min-w-0 flex-1 sm:flex-none" onClick={actions.onTrySimilar} disabled={actions.busy !== null}>
            {actions.busy === "followup" ? <Loader2 className="animate-spin" /> : null} Try a similar question
          </Button>
        )}
        <Button variant="secondary" className="shrink-0 sm:flex-none" onClick={actions.onContinue} disabled={actions.busy !== null}>
          {actions.busy === "continue" ? <Loader2 className="animate-spin" /> : null}
          <span>
            Continue<span className="hidden sm:inline"> quest</span>
          </span>
          {!actions.canFollowUp && <ArrowRight />}
        </Button>
      </div>
      {actions.followUpError && <p className="mt-2 t-footnote text-amber">{actions.followUpError}</p>}
    </div>
  );
}

/** The lesson itself: short sections, one idea each, steps revealed one at a time. */
export function TutorBody({
  data,
  error,
  loading,
  onRetry,
  videoEnabled,
  conceptId,
}: {
  data: ExplainResult | null;
  error: ApiError | null;
  loading: boolean;
  onRetry: () => void;
  videoEnabled: boolean;
  conceptId: string;
}) {
  const [stepsShown, setStepsShown] = useState(1);

  if (loading && !data) {
    return (
      <div className="space-y-3 px-5 pb-6" aria-busy="true" aria-live="polite">
        <p className="flex items-center gap-2 t-subhead text-muted">
          <Loader2 className="size-4 animate-spin" /> Preparing a lesson for your answer…
        </p>
        {[80, 95, 60].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded-full bg-fill-3" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="space-y-3 px-5 pb-6" role="alert">
        <p className="flex items-center gap-2 t-subhead text-danger">
          <AlertTriangle className="size-4" /> {error.message}
        </p>
        {error.retryable && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw /> Retry
          </Button>
        )}
      </div>
    );
  }
  if (!data) return null;
  const t = data.tutor;

  return (
    <motion.div key={data.pending ? "stored" : "full"} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-6 px-5 pb-6">
      {data.pending && (
        <p className="flex items-center gap-2 t-footnote text-muted" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" /> Writing a fuller explanation for your answer…
        </p>
      )}
      {data.fallbackReason && <p className="t-footnote text-amber">{data.fallbackReason}</p>}
      {t.simplified && (
        <p className="t-subhead font-medium text-ink">Here&apos;s a simpler way to see it.</p>
      )}

      {/* Your answer vs. the right one */}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AnswerTile tone="wrong" label="You chose" id={data.selectedOption.id} text={data.selectedOption.text} />
        <AnswerTile tone="right" label="Correct" id={data.correctOption.id} text={data.correctOption.text} />
      </dl>

      <Section title="Why it's tempting">
        <RichText as="p" text={t.whyWrong} className="t-body text-ink" />
        {t.misconception.label !== "unclassified" && (
          <p className="mt-2 t-footnote text-muted" title={t.misconception.description}>
            Common mix-up: {t.misconception.label.replace(/-/g, " ")}
          </p>
        )}
      </Section>

      <Section title="The idea">
        <RichText as="p" text={t.simpleExplanation} className="t-body text-ink" />
      </Section>

      {t.keyEquations.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {t.keyEquations.map((k, i) => (
            <div key={i} className="rounded-xl bg-surface-2 px-4 py-3">
              <Tex tex={k.latex} display className="block text-ink" />
              <p className="t-footnote text-muted">{k.meaning}</p>
            </div>
          ))}
        </div>
      )}

      {t.visual && <Visual spec={t.visual} />}

      <Section title="Worked solution">
        <ol className="space-y-2">
          <AnimatePresence initial={false}>
            {t.steps.slice(0, stepsShown).map((s, i) => (
              <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                <span className="w-4 shrink-0 pt-px t-callout text-faint tabular">{i + 1}</span>
                <div className="min-w-0">
                  {s.title && !/^Step \d+$/.test(s.title) && <p className="t-subhead font-semibold text-ink">{s.title}</p>}
                  <RichText as="div" text={s.body} className="t-callout text-ink" />
                  {s.latex && <Tex tex={s.latex} display className="block" />}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {stepsShown < t.steps.length && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setStepsShown((n) => n + 1)}>
            <ChevronDown /> Next step ({stepsShown + 1} of {t.steps.length})
          </Button>
        )}
      </Section>

      {t.uncertainty && (
        <p className="t-footnote text-muted">{t.uncertainty}</p>
      )}
      <p className="t-caption text-faint">
        Based on {t.grounding === "notes" ? "your notes" : t.grounding === "mixed" ? "your notes and standard subject knowledge" : "standard subject knowledge"}
      </p>

      {videoEnabled && <VideoLesson conceptId={conceptId} />}
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 t-eyebrow text-muted">{title}</h3>
      {children}
    </section>
  );
}

function AnswerTile({ tone, label, id, text }: { tone: "wrong" | "right"; label: string; id: string; text: string }) {
  const right = tone === "right";
  return (
    <div className={right ? "border-l-2 border-success-fill pl-3" : "border-l-2 border-danger-fill pl-3"}>
      <dt className={`t-footnote ${right ? "text-success" : "text-danger"}`}>{label}</dt>
      <dd className="t-callout text-ink">
        <span className="mr-1.5 font-medium">{id}.</span>
        <RichText text={text} />
      </dd>
    </div>
  );
}

function VideoLesson({ conceptId }: { conceptId: string }) {
  const [state, setState] = useState<{ status: string; url: string | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state?.status !== "processing") return;
    const t = setInterval(async () => {
      try {
        setState(await api(`/api/concepts/${encodeURIComponent(conceptId)}/video`));
      } catch {
        /* keep polling */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [state?.status, conceptId]);
  const start = async () => {
    setBusy(true);
    try {
      setState(await api(`/api/concepts/${encodeURIComponent(conceptId)}/video`, { method: "POST" }));
    } catch (e) {
      setState({ status: "failed", url: null, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="mb-2 flex items-center gap-2 t-subhead font-semibold text-ink">
        <Film className="size-4 text-tint" /> Short video lesson (Veo)
      </p>
      {state?.status === "ready" && state.url ? (
        <video src={state.url} controls className="w-full rounded-xl" />
      ) : state?.status === "processing" ? (
        <p className="flex items-center gap-2 t-subhead text-muted">
          <Loader2 className="size-4 animate-spin" /> Generating. This can take a minute or two. Keep playing; it will appear here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {state?.status === "failed" && <p className="t-subhead text-amber">{state.error ?? "Video generation failed."}</p>}
          <Button variant="tinted" size="sm" onClick={start} disabled={busy}>
            {state?.status === "failed" ? "Retry video" : "Generate video"}
          </Button>
        </div>
      )}
    </div>
  );
}
