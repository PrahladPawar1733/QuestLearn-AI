"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { fade, materialize, spring } from "@/lib/motion";

/**
 * Destructive, irreversible action, so it gets a confirmation (and only this one).
 * The alert materializes out of the trigger and returns to it on close; a scrim dims the page.
 */
export function DeleteDataButton() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  // Grow from the trigger: convert its viewport position into the dialog's own box.
  const contentRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || !origin.current) return;
    const left = (window.innerWidth - el.offsetWidth) / 2;
    const top = (window.innerHeight - el.offsetHeight) / 2;
    el.style.transformOrigin = `${origin.current.x - left}px ${origin.current.y - top}px`;
  }, []);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (o) setError(null);
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="plain"
          size="sm"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }}
        >
          <Trash2 /> Delete my data
        </Button>
      </Dialog.Trigger>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduced ? fade : spring.snappy}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                ref={contentRef}
                className="material-thick fixed left-1/2 top-1/2 z-50 w-[min(92vw,24rem)] rounded-[1.75rem] p-6"
                style={{ x: "-50%", y: "-50%" }}
                {...(reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade } : { ...materialize, transition: spring.default })}
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-danger-fill/14 text-danger" aria-hidden>
                  <Trash2 className="size-5" />
                </span>
                <Dialog.Title className="mt-4 t-title2 text-ink">Delete all your data?</Dialog.Title>
                <Dialog.Description className="mt-1.5 t-subhead text-muted">
                  This permanently removes your uploaded files, generated quests, answers, XP and mastery records from the server. It can&apos;t be undone.
                </Dialog.Description>
                {error && (
                  <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-danger-fill/12 px-3 py-2.5 t-footnote text-ink">
                    <AlertTriangle className="mt-px size-4 shrink-0 text-danger" /> {error}
                  </p>
                )}
                <div className="mt-6 grid gap-2">
                  <Button
                    variant="danger"
                    size="lg"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await api("/api/me", { method: "DELETE", retries: 0 });
                        router.push("/");
                        router.refresh();
                      } catch (e) {
                        setError((e as Error).message);
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} {error ? "Try again" : "Delete everything"}
                  </Button>
                  <Dialog.Close asChild>
                    <Button variant="secondary" size="lg" disabled={busy} autoFocus>
                      Cancel
                    </Button>
                  </Dialog.Close>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
