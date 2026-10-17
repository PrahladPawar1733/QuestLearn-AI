"use client";

/**
 * The Chapter Brief — what a student reads before they play.
 *
 * Every field shown here was already being extracted from the student's own
 * chapter and stored on the material (`ExtractedContent` in src/lib/types.ts):
 * a summary, the concepts, definitions, formulas, worked examples and an
 * honest list of anything the model could not read. None of it was ever
 * rendered. A student went straight from uploading a chapter to answering
 * questions about it, which is why the app felt like a quiz rather than
 * something that teaches.
 *
 * Two rules hold throughout:
 *  - Provenance is always visible. Anything the model added that was *not*
 *    in the student's notes is labelled, and anything it could not read is
 *    shown as a gap rather than quietly filled in.
 *  - Nothing here is required reading. It is a brief, not a wall: sections
 *    collapse, and the student can go straight to playing.
 */
import { AlertTriangle, BookOpen, ChevronDown, FlaskConical, Layers, Lightbulb, Sigma, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import type { ExtractedContent } from "@/lib/types";

interface Props {
  extracted: ExtractedContent;
  /**
   * Question counts per concept TITLE (lower-cased). Keyed by title because
   * `ExtractedContent.concepts[].key` is a generator key while stored
   * `Concept.id` is a prefixed id — the two never match.
   */
  conceptQuestionCounts?: Record<string, number>;
  /** Rendered under the summary — e.g. "Prepared demo content". */
  originNote?: React.ReactNode;
}

export function ChapterBrief({ extracted, conceptQuestionCounts, originNote }: Props) {
  const addedByAi = extracted.concepts.filter((c) => !c.fromNotes).length;

  return (
    <div className="space-y-5">
      {/* ---------------- summary ---------------- */}
      <section className="surface rounded-[1.5rem] p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-2 t-title3 text-ink">
          <BookOpen className="size-4 text-tint" />
          What this chapter is about
        </h2>
        <p className="t-body text-muted">{extracted.summary}</p>
        {originNote && <div className="mt-3">{originNote}</div>}
      </section>

      {/* ---------------- honesty: what we could not read ---------------- */}
      {extracted.uncertain.length > 0 && (
        <section className="rounded-[1.5rem] bg-amber-fill/10 p-4 ring-1 ring-amber/25 sm:p-5">
          <h2 className="mb-2 flex items-center gap-2 t-headline text-ink">
            <AlertTriangle className="size-4 text-amber" />
            Parts we could not read clearly
          </h2>
          <p className="mb-2 t-footnote text-muted">
            These were left out rather than guessed. Retake those pages if they matter for this chapter.
          </p>
          <ul className="space-y-1">
            {extracted.uncertain.map((u, i) => (
              <li key={i} className="t-subhead text-ink">
                <span className="font-semibold">{u.ref}:</span> {u.issue}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------- concepts ---------------- */}
      <Section
        icon={<Layers className="size-4 text-tint" />}
        title={`Key concepts (${extracted.concepts.length})`}
        subtitle={
          addedByAi > 0
            ? `${extracted.concepts.length - addedByAi} from your notes · ${addedByAi} added as background`
            : "All taken from your notes"
        }
        defaultOpen
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {extracted.concepts.map((c) => {
            const count = conceptQuestionCounts?.[c.title.trim().toLowerCase()];
            return (
              <li key={c.key} className="rounded-2xl bg-surface-2 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <h3 className="t-headline text-ink">{c.title}</h3>
                  <span className="rounded-full bg-fill-3 px-2 py-0.5 t-caption capitalize text-muted">{c.difficulty}</span>
                  {!c.fromNotes && (
                    <span className="flex items-center gap-1 rounded-full bg-tint/12 px-2 py-0.5 t-caption text-tint">
                      <Sparkles className="size-3" /> Added
                    </span>
                  )}
                </div>
                <p className="t-subhead text-muted">{c.description}</p>
                {count !== undefined && (
                  <p className="mt-1.5 t-caption text-faint">
                    {count} question{count === 1 ? "" : "s"} in this quest
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ---------------- formulas ---------------- */}
      {extracted.formulas.length > 0 && (
        <Section icon={<Sigma className="size-4 text-tint" />} title={`Formulas (${extracted.formulas.length})`} defaultOpen>
          <ul className="grid gap-2">
            {extracted.formulas.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl bg-surface-2 px-3 py-2.5">
                <RichText text={`$${f.latex}$`} className="t-headline text-ink" />
                <span className="min-w-0 flex-1 t-subhead text-muted">{f.meaning}</span>
                {!f.fromNotes && <span className="t-caption text-tint">added</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------------- definitions ---------------- */}
      {extracted.definitions.length > 0 && (
        <Section icon={<FlaskConical className="size-4 text-tint" />} title={`Definitions (${extracted.definitions.length})`}>
          <dl className="grid gap-2">
            {extracted.definitions.map((d, i) => (
              <div key={i} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                <dt className="t-headline text-ink">
                  {d.term}
                  {!d.fromNotes && <span className="ml-2 t-caption font-normal text-tint">added</span>}
                </dt>
                <dd className="t-subhead text-muted">
                  <RichText text={d.definition} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {/* ---------------- worked examples ---------------- */}
      {extracted.examples.length > 0 && (
        <Section icon={<Lightbulb className="size-4 text-tint" />} title={`Worked examples (${extracted.examples.length})`}>
          <ol className="grid gap-2">
            {extracted.examples.map((e, i) => (
              <li key={i} className="rounded-2xl bg-surface-2 p-3">
                <p className="t-subhead text-ink">
                  <RichText text={e.problem} />
                </p>
                {e.solution && <Solution text={e.solution} />}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ---------------- how ideas connect ---------------- */}
      {extracted.relationships.length > 0 && (
        <Section icon={<Layers className="size-4 text-tint" />} title="How these ideas connect">
          <ul className="flex flex-wrap gap-2">
            {extracted.relationships.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 t-footnote">
                <span className="font-semibold text-ink">{r.from}</span>
                <span className="text-faint">{r.relation}</span>
                <span className="font-semibold text-ink">{r.to}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** A worked example hides its solution until asked — reading the answer first teaches nothing. */
function Solution({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <p className="mt-2 border-l-2 border-tint/40 pl-3 t-subhead text-muted">
      <RichText text={text} />
    </p>
  ) : (
    <button type="button" onClick={() => setShown(true)} className="pressable mt-2 rounded-full bg-fill-3 px-3 py-1 t-caption font-semibold text-tint">
      Show the working
    </button>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = !!useReducedMotion();
  return (
    <section className="surface overflow-hidden rounded-[1.5rem]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pressable flex w-full items-center gap-2 p-4 text-left sm:px-5"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block t-headline text-ink">{title}</span>
          {subtitle && <span className="block t-caption text-faint">{subtitle}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? fade : spring.default}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
