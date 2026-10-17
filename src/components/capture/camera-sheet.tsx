"use client";

/**
 * Full-screen capture surface: shoot the pages of a chapter in one session.
 *
 * The shape of the flow is deliberate:
 *
 *  shutter -> normalize -> measure -> *review* -> accept or retake -> next page
 *
 * Nothing is accepted silently. After every shot the frame is measured with
 * `assessImageQuality`, and when the verdict is not "good" the student is shown
 * the specific fix ("hold steadier and tap to focus") with Retake as the
 * primary action and "Keep anyway" beside it. The product promise is that we
 * read what the student actually wrote, so asking for a better photo is the
 * honest move — inventing the content we cannot read is not an option, and a
 * 90-second model round trip that ends in "I couldn't read your notes" is a
 * worse way to find out.
 *
 * Camera lifetime: the stream is owned by the effect that opens it. It is
 * released when the sheet closes, when the component unmounts, when `start`
 * fails, and when the page is being hidden — a camera left running shows an
 * indicator on the student's phone and blocks every other app.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Crop, Images, Loader2, RefreshCw, SwitchCamera, X, Zap, ZapOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CAMERA_ERROR_MESSAGES,
  CameraError,
  CameraSession,
  classifyCameraError,
  type CameraErrorKind,
} from "@/lib/capture";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { fade, spring } from "@/lib/motion";
import { CropEditor } from "./crop-editor";
import { PageStrip } from "./page-strip";
import { preparePage } from "./prepare";
import { gateFor } from "./quality-gate";
import { movePage, removeAt, replaceAt } from "./page-order";
import { revokePage, revokePages, type CapturedPage } from "./types";

/** Map any thrown value onto a kind and the copy that goes with it. */
function failureOf(e: unknown): CameraFailure {
  const kind = e instanceof CameraError ? e.kind : classifyCameraError(e);
  return { kind, message: CAMERA_ERROR_MESSAGES[kind] };
}

/** Kinds where pressing the button again can plausibly work. */
const RETRYABLE: ReadonlySet<CameraErrorKind> = new Set<CameraErrorKind>(["in-use", "unknown"]);

export interface CameraSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the accepted pages, in order, when the student is done. */
  onDone: (pages: CapturedPage[]) => void;
  /** How many more files the batch has room for. */
  remainingSlots: number;
  /** Open the OS picker instead — the fallback when the camera cannot start. */
  onFallbackUpload: () => void;
}

export function CameraSheet({ open, onOpenChange, onDone, remainingSlots, onFallbackUpload }: CameraSheetProps) {
  const reduced = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 flex flex-col bg-black text-white"
                {...(reduced
                  ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
                  : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 16 }, transition: spring.default })}
              >
                <CaptureSurface
                  onClose={() => onOpenChange(false)}
                  onDone={(pages) => {
                    onDone(pages);
                    onOpenChange(false);
                  }}
                  remainingSlots={remainingSlots}
                  onFallbackUpload={() => {
                    onOpenChange(false);
                    onFallbackUpload();
                  }}
                />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */

type Phase = "starting" | "live" | "error";

interface CameraFailure {
  kind: CameraErrorKind;
  message: string;
}

function CaptureSurface({
  onClose,
  onDone,
  remainingSlots,
  onFallbackUpload,
}: {
  onClose: () => void;
  onDone: (pages: CapturedPage[]) => void;
  remainingSlots: number;
  onFallbackUpload: () => void;
}) {
  /**
   * `phase` is derived, not stored. A stored one would have to be reset to
   * "starting" from inside the open-the-camera effect, and setting state
   * synchronously in an effect is exactly the cascading render React warns
   * about. Two facts are enough: is a stream attached, and did it fail?
   */
  const [live, setLive] = useState(false);
  const [error, setError] = useState<CameraFailure | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [pages, setPages] = useState<readonly CapturedPage[]>([]);
  const [review, setReview] = useState<CapturedPage | null>(null);
  /** Set while re-shooting an existing page, so the new shot replaces it. */
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ page: CapturedPage; where: "review" | number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [shooting, setShooting] = useState(false);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [canSwitch, setCanSwitch] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const sessionRef = useRef<CameraSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Pages already handed to the parent must not be revoked on unmount. */
  const handedOff = useRef(false);
  const pagesRef = useRef<readonly CapturedPage[]>(pages);
  const reviewRef = useRef<CapturedPage | null>(review);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  const full = pages.length >= remainingSlots;

  const attachStream = useCallback((stream: MediaStream) => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    // Autoplay can still be refused (low power mode); the controls stay usable.
    void v.play().catch(() => undefined);
  }, []);

  /* ---- open the camera; this effect owns the stream ---- */
  useEffect(() => {
    let cancelled = false;
    const session = new CameraSession();
    sessionRef.current = session;
    (async () => {
      try {
        // Register the preview first: it is the fallback frame source when
        // ImageCapture is missing (Safari, Firefox).
        session.setVideoElement(videoRef.current);
        const stream = await session.start({ facingMode: "environment" });
        if (cancelled) {
          session.stop();
          return;
        }
        attachStream(stream);
        setTorch({ available: session.hasTorch(), on: session.isTorchOn });
        setLive(true);
        const cameras = await session.listCameras();
        if (!cancelled) setCanSwitch(cameras.length > 1);
      } catch (e) {
        if (cancelled) return;
        // Never leave a half-open stream behind on failure.
        session.stop();
        setError(failureOf(e));
      }
    })();

    return () => {
      cancelled = true;
      session.stop();
      sessionRef.current = null;
    };
  }, [attachStream, attempt]);

  /* ---- release the camera if the page goes away under us ---- */
  useEffect(() => {
    const release = () => sessionRef.current?.stop();
    /**
     * A page restored from the back/forward cache keeps its React state but
     * not its media tracks, so without this the student would come back to a
     * frozen preview. `persisted` is what distinguishes a restore from the
     * first load, which must not restart anything.
     */
    const resume = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setLive(false);
      setAttempt((a) => a + 1);
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", resume);
    return () => {
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", resume);
    };
  }, []);

  /* ---- drop preview URLs the parent never took ownership of ---- */
  useEffect(
    () => () => {
      if (handedOff.current) {
        revokePage(reviewRef.current);
        return;
      }
      revokePages(pagesRef.current);
      revokePage(reviewRef.current);
    },
    [],
  );

  /* ---- actions ---- */

  const shoot = async () => {
    const session = sessionRef.current;
    if (!session || shooting || (full && retakeIndex === null)) return;
    setShooting(true);
    setShotError(null);
    try {
      const raw = await session.capturePhoto();
      const page = await preparePage(raw, { source: "camera", index: pages.length });
      haptic("selection");
      setReview(page);
    } catch (e) {
      const kind = e instanceof CameraError ? e.kind : null;
      setShotError(kind ? CAMERA_ERROR_MESSAGES[kind] : "That photo didn't save. Try the shutter again.");
    } finally {
      setShooting(false);
    }
  };

  const acceptReview = (page: CapturedPage, kept: boolean) => {
    const next = { ...page, kept };
    if (retakeIndex !== null && retakeIndex < pages.length) {
      // The replaced page's preview URL is ours to release.
      revokePage(pages[retakeIndex]);
      setPages(replaceAt(pages, retakeIndex, next));
      setSelected(retakeIndex);
    } else {
      setPages([...pages, next]);
      setSelected(pages.length);
    }
    setRetakeIndex(null);
    setReview(null);
    haptic("success");
  };

  const discardReview = () => {
    revokePage(review);
    setReview(null);
    // A discarded retake leaves the original page alone.
    setRetakeIndex(null);
  };

  const toggleTorch = async () => {
    const session = sessionRef.current;
    if (!session) return;
    const on = await session.toggleTorch();
    setTorch({ available: session.hasTorch(), on });
  };

  const switchCamera = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setLive(false);
    try {
      const stream = await session.switchCamera();
      attachStream(stream);
      setTorch({ available: session.hasTorch(), on: session.isTorchOn });
      setLive(true);
    } catch (e) {
      session.stop();
      setError(failureOf(e));
    }
  };

  const cancel = () => {
    // The unmount cleanup revokes the previews; `handedOff` stays false.
    onClose();
  };

  const finish = () => {
    if (pages.length === 0) {
      cancel();
      return;
    }
    handedOff.current = true;
    onDone([...pages]);
  };

  const applyEdit = (edited: CapturedPage) => {
    if (!editing) return;
    if (editing.where === "review") {
      revokePage(review);
      setReview(edited);
    } else {
      const index = editing.where;
      if (index < pages.length) {
        revokePage(pages[index]);
        setPages(replaceAt(pages, index, edited));
      }
    }
    setEditing(null);
  };

  const phase: Phase = error ? "error" : live ? "live" : "starting";
  const gate = review ? gateFor(review.quality) : null;
  const pageNumber = (retakeIndex ?? pages.length) + 1;

  return (
    <div className="flex h-full flex-col">
      <Dialog.Title className="sr-only">Take photos of your notes</Dialog.Title>
      <Dialog.Description className="sr-only">
        Photograph one page at a time. Each photo is checked for sharpness and light before it is added, and you can reorder or retake any page before uploading.
      </Dialog.Description>

      <header className="flex items-center gap-2 px-2 py-2">
        <Button variant="plain" onClick={cancel} className="h-11 px-3 text-white hover:bg-white/15 hover:text-white">
          <X /> Cancel
        </Button>
        <p className="flex-1 text-center t-subhead font-semibold" aria-hidden>
          {retakeIndex !== null ? `Retaking page ${pageNumber}` : `Page ${pageNumber}`}
          <span className="text-white/60"> · {Math.max(0, remainingSlots - pages.length)} left</span>
        </p>
        <Button onClick={finish} disabled={pages.length === 0} className="h-11">
          <Check /> {pages.length === 0 ? "Use pages" : `Use ${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
        </Button>
      </header>

      {/* ---- viewfinder ---- */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className={cn("size-full object-contain", (phase !== "live" || !!review) && "opacity-0")}
        />

        {phase === "live" && !review && (
          <>
            <GuideFrame />
            <p className="absolute inset-x-0 bottom-2 text-center t-caption text-white/70">Fill the frame with one page, in even light</p>
          </>
        )}

        {phase === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 t-subhead text-white/80">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening the camera…
          </p>
        )}

        {phase === "error" && error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/10 text-danger-fill" aria-hidden>
              <AlertTriangle className="size-6" />
            </span>
            <p className="max-w-sm t-body">{error.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {RETRYABLE.has(error.kind) && (
                <Button
                  onClick={() => {
                    setError(null);
                    setLive(false);
                    setAttempt((a) => a + 1);
                  }}
                  className="h-11"
                >
                  <RefreshCw /> Try again
                </Button>
              )}
              {/* Always offered: this is the path that still works when the
                  camera is blocked, missing, or on an http:// origin. */}
              <Button variant="secondary" onClick={onFallbackUpload} className="h-11">
                <Images /> Upload a photo instead
              </Button>
            </div>
            {pages.length > 0 && (
              <p className="t-footnote text-white/70">
                The {pages.length} page{pages.length === 1 ? "" : "s"} you already took {pages.length === 1 ? "is" : "are"} safe — press “Use {pages.length}{" "}
                {pages.length === 1 ? "page" : "pages"}”.
              </p>
            )}
          </div>
        )}

        {review && gate && (
          <ReviewOverlay
            page={review}
            headline={gate.headline}
            advice={gate.advice}
            needsDecision={gate.needsDecision}
            tone={gate.tone}
            pageNumber={pageNumber}
            onRetake={discardReview}
            onKeep={() => acceptReview(review, gate.needsDecision)}
            onEdit={() => setEditing({ page: review, where: "review" })}
          />
        )}
      </div>

      {/* ---- announcements: the verdict and the page count, for screen readers ---- */}
      <p className="sr-only" aria-live="polite">
        {review && gate ? `${gate.headline}. ${gate.advice}` : `${pages.length} page${pages.length === 1 ? "" : "s"} captured.`}
      </p>

      {shotError && (
        <p role="alert" className="flex items-start gap-2 bg-danger-fill/20 px-4 py-2 t-footnote">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-fill" aria-hidden /> {shotError}
        </p>
      )}

      {/* ---- controls ---- */}
      <div className="space-y-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {pages.length > 0 && (
          <PageStrip
            pages={pages}
            selected={selected}
            onSelect={setSelected}
            onMove={(from, to) => {
              setPages((prev) => movePage(prev, from, to));
              setSelected(to);
            }}
            onDelete={(index) => {
              revokePage(pages[index]);
              const out = removeAt(pages, index);
              setPages(out);
              setSelected(out.length === 0 ? null : Math.min(index, out.length - 1));
            }}
            onRetake={(index) => {
              setRetakeIndex(index);
              setSelected(index);
            }}
            onEdit={(index) => setEditing({ page: pages[index], where: index })}
            onDarkSurface
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex w-24 justify-start">
            {torch.available && (
              <Button
                variant="plain"
                size="icon"
                onClick={toggleTorch}
                aria-pressed={torch.on}
                aria-label={torch.on ? "Turn the torch off" : "Turn the torch on"}
                className={cn("size-11 rounded-full text-white hover:bg-white/15 hover:text-white", torch.on && "bg-white text-black hover:bg-white hover:text-black")}
              >
                {torch.on ? <Zap /> : <ZapOff />}
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={shoot}
            disabled={phase !== "live" || shooting || !!review || (full && retakeIndex === null)}
            autoFocus
            aria-label={retakeIndex !== null ? `Retake page ${pageNumber}` : `Take a photo of page ${pageNumber}`}
            className="pressable flex size-[4.5rem] shrink-0 items-center justify-center rounded-full ring-4 ring-white/80 disabled:opacity-40"
          >
            <span className="flex size-[3.75rem] items-center justify-center rounded-full bg-white text-black" aria-hidden>
              {shooting ? <Loader2 className="size-6 animate-spin" /> : null}
            </span>
          </button>

          <div className="flex w-24 justify-end">
            {canSwitch && (
              <Button
                variant="plain"
                size="icon"
                onClick={switchCamera}
                aria-label="Switch between the front and back camera"
                className="size-11 rounded-full text-white hover:bg-white/15 hover:text-white"
              >
                <SwitchCamera />
              </Button>
            )}
          </div>
        </div>

        {full && retakeIndex === null && (
          <p className="text-center t-footnote text-white/70" role="status">
            That&apos;s the maximum number of files for one upload. Use these pages, or delete one to make room.
          </p>
        )}
      </div>

      <CropEditor open={!!editing} page={editing?.page ?? null} onOpenChange={(o) => !o && setEditing(null)} onApply={applyEdit} />
    </div>
  );
}

/** Corner brackets: where to put the page. Decorative. */
function GuideFrame() {
  const corner = "absolute size-10 border-white/70";
  return (
    <div className="pointer-events-none absolute inset-6 sm:inset-12" aria-hidden>
      <span className={cn(corner, "left-0 top-0 rounded-tl-xl border-l-4 border-t-4")} />
      <span className={cn(corner, "right-0 top-0 rounded-tr-xl border-r-4 border-t-4")} />
      <span className={cn(corner, "bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4")} />
      <span className={cn(corner, "bottom-0 right-0 rounded-br-xl border-b-4 border-r-4")} />
    </div>
  );
}

/**
 * The quality gate, on screen. A flagged frame makes Retake the primary
 * action, but "Keep anyway" is always present: the metrics are a proxy, and
 * refusing a student's only photo of tonight's homework would be worse than a
 * weaker quest. See the policy note in `quality-gate.ts`.
 */
function ReviewOverlay({
  page,
  headline,
  advice,
  needsDecision,
  tone,
  pageNumber,
  onRetake,
  onKeep,
  onEdit,
}: {
  page: CapturedPage;
  headline: string;
  advice: string;
  needsDecision: boolean;
  tone: "neutral" | "success" | "amber" | "danger";
  pageNumber: number;
  onRetake: () => void;
  onKeep: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={page.url} alt={`The photo you just took of page ${pageNumber}`} className="min-h-0 flex-1 object-contain" />
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
              tone === "danger" ? "bg-danger-fill/25 text-danger-fill" : tone === "amber" ? "bg-amber-fill/25 text-amber-fill" : "bg-success-fill/25 text-success-fill",
            )}
            aria-hidden
          >
            {needsDecision ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} />}
          </span>
          <div className="min-w-0">
            <p className="t-headline">{headline}</p>
            <p className="t-footnote text-white/75">{advice}</p>
            {page.tooSmall && <p className="t-footnote text-danger-fill">This photo is smaller than 200 px, which is too small to upload.</p>}
            {page.overBudget && <p className="t-footnote text-danger-fill">This photo is still over the 10 MB limit even after compression.</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {needsDecision ? (
            <>
              <Button onClick={onRetake} className="h-11 flex-1">
                <RefreshCw /> Retake
              </Button>
              <Button variant="secondary" onClick={onKeep} className="h-11">
                Keep anyway
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onKeep} className="h-11 flex-1">
                <Check /> Add this page
              </Button>
              <Button variant="secondary" onClick={onRetake} className="h-11">
                <RefreshCw /> Retake
              </Button>
            </>
          )}
          <Button variant="plain" onClick={onEdit} className="h-11 px-3 text-white hover:bg-white/15 hover:text-white">
            <Crop /> Crop
          </Button>
        </div>
      </div>
    </div>
  );
}
