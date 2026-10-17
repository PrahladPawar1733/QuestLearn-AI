"use client";

import { AlertTriangle, ArrowRight, BookOpen, Check, ChevronDown, Film, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { RichText, Tex } from "@/components/math/rich-text";
import { Badge } from "@/components/ui/badge";
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
export function TutorHeader({ data, loading, actions }: { data: ExplainResult | null; loading: boolean; actions: TutorActions }) {
  return (
    <div className="px-5 pb-4 pt-1">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="tutor-heading" className="t-title3 text-ink">
            Let&apos;s understand this
          </h2>
          <p className="truncate t-footnote text-muted">{data ? data.tutor.conceptTitle : "Your mistake is a clue. Let's use it."}</p>
        </div>
        {data && <OriginBadge origin={data.origin} className="mt-1 shrink-0" />}
      </div>
      <div className="mt-3 flex gap-2">
        {actions.canFollowUp && (
          <Button className="min-w-0 flex-1 sm:flex-none" onClick={actions.onTrySimilar} disabled={actions.busy !== null || loading}>
            {actions.busy === "followup" ? <Loader2 className="animate-spin" /> : <Sparkles />} Try a similar question
          </Button>
        )}
        <Button variant="secondary" className="shrink-0 sm:flex-none" onClick={actions.onContinue} disabled={actions.busy !== null}>
          {actions.busy === "continue" ? <Loader2 className="animate-spin" /> : null} Continue<span className="hidden sm:inline"> quest</span>
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
    <div className="space-y-6 px-5 pb-6">
      {data.fallbackReason && <p className="rounded-xl bg-amber-fill/12 px-3 py-2 t-footnote text-amber">{data.fallbackReason}</p>}
      {t.simplified && (
        <p className="flex items-center gap-2 t-subhead font-semibold text-tint">
          <Sparkles className="size-4" /> Let&apos;s slow down. Here&apos;s a simpler way to see it.
        </p>
      )}

      {/* Your answer vs. the right one, side by side */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <AnswerTile tone="wrong" label="Your answer" id={data.selectedOption.id} text={data.selectedOption.text} />
        <AnswerTile tone="right" label="Correct answer" id={data.correctOption.id} text={data.correctOption.text} />
      </div>

      <Section title="Why that answer slipped">
        <RichText as="p" text={t.whyWrong} className="t-body text-ink" />
        {t.misconception.label !== "unclassified" && (
          <Badge tone="amber" className="mt-2" title={t.misconception.description}>
            Misconception: {t.misconception.label.replace(/-/g, " ")}
          </Badge>
        )}
      </Section>

      <Section title="The idea" icon={<BookOpen className="size-4" />}>
        <RichText as="p" text={t.simpleExplanation} className="t-body text-ink" />
      </Section>

      {t.keyEquations.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {t.keyEquations.map((k, i) => (
            <div key={i} className="rounded-2xl bg-surface-2 px-4 py-3">
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
              <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 rounded-2xl bg-surface-2 p-3.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tint t-caption font-bold text-on-tint">{i + 1}</span>
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
            <ChevronDown /> Next step ({stepsShown} of {t.steps.length})
          </Button>
        )}
      </Section>

      {t.uncertainty && (
        <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2 t-footnote text-muted">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber" /> {t.uncertainty}
        </p>
      )}
      <p className="t-caption text-faint">
        Grounded in: {t.grounding === "notes" ? "your chapter material" : t.grounding === "mixed" ? "your material + standard physics" : "standard subject knowledge"}
      </p>

      {videoEnabled && <VideoLesson conceptId={conceptId} />}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 t-eyebrow text-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function AnswerTile({ tone, label, id, text }: { tone: "wrong" | "right"; label: string; id: string; text: string }) {
  const right = tone === "right";
  return (
    <div className={right ? "rounded-2xl bg-success-fill/12 p-3.5" : "rounded-2xl bg-danger-fill/10 p-3.5"}>
      <p className={`mb-1 flex items-center gap-1.5 t-eyebrow ${right ? "text-success" : "text-danger"}`}>
        {right ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />} {label}
      </p>
      <p className="t-callout text-ink">
        <span className="mr-1.5 font-bold">{id}.</span>
        <RichText text={text} />
      </p>
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
