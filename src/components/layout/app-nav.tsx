"use client";

import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { Button } from "../ui/button";

const LINKS = [
  { href: "/dashboard", label: "Chapters" },
  { href: "/progress", label: "Progress" },
];

/** Translucent bar, text links, one action. */
export function AppNav({ aiAvailable }: { aiAvailable: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="material-chrome sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 md:flex" aria-label="Main">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("t-subhead transition-colors", active ? "font-medium text-ink" : "text-muted hover:text-ink")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ModeBadge aiAvailable={aiAvailable} />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/create">New quest</Link>
          </Button>
          <Button variant="plain" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label="Mobile"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="border-t border-line px-4 pb-2 md:hidden"
          >
            {[...LINKS, { href: "/create", label: "New quest" }].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b border-line py-3.5 t-body text-ink last:border-0">
                {l.label}
              </Link>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Only worth saying when something is missing: live AI is the normal case. */
export function ModeBadge({ aiAvailable }: { aiAvailable: boolean }) {
  if (aiAvailable) return null;
  return (
    <span
      className="t-caption text-amber"
      title="No AI credentials are configured. The demo quest uses prepared, hand-checked content and template-generated follow-ups."
    >
      Demo mode
    </span>
  );
}
