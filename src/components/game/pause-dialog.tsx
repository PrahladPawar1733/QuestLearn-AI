"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LayoutGrid, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fade, materialize, spring } from "@/lib/motion";

/**
 * Modal pause. The panel grows out of the pause button (transform-origin at
 * the trigger) and returns to it on close; a scrim dims the quest, which the
 * parent pushes back slightly.
 */
export function PauseDialog({
  open,
  onOpenChange,
  answered,
  total,
  origin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  answered: number;
  total: number;
  origin: { x: number; y: number } | null;
}) {
  const reduced = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-[var(--scrim)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduced ? fade : spring.snappy} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="material-thick fixed left-1/2 top-1/2 z-50 w-[min(92vw,22rem)] rounded-[1.75rem] p-6"
                style={{
                  x: "-50%",
                  y: "-50%",
                  transformOrigin: origin ? `${origin.x - window.innerWidth / 2 + 176}px ${origin.y - window.innerHeight / 2 + 120}px` : "center",
                }}
                {...(reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade } : { ...materialize, transition: spring.default })}
              >
                <Dialog.Title className="t-title2 text-ink">Quest paused</Dialog.Title>
                <Dialog.Description className="mt-1 t-subhead text-muted">
                  {answered} of {total} answered. Your progress is saved, so you can come back any time.
                </Dialog.Description>
                <div className="mt-6 grid gap-2">
                  <Button size="lg" onClick={() => onOpenChange(false)} autoFocus>
                    <Play fill="currentColor" /> Resume
                  </Button>
                  <Button asChild variant="secondary" size="lg">
                    <Link href="/dashboard">
                      <LayoutGrid /> Exit to Dashboard
                    </Link>
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
