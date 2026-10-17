"use client";

import { BarChart3, LayoutGrid, Menu, Plus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { Button } from "../ui/button";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/progress", label: "Progress", icon: BarChart3 },
];

/** Translucent nav bar: content scrolls underneath; a soft scroll-edge replaces the divider. */
export function AppNav({ aiAvailable }: { aiAvailable: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="material-chrome scroll-edge sticky top-0 z-40">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 t-subhead font-medium", active ? "bg-fill-3 text-ink" : "text-muted hover:text-ink")}
              >
                <l.icon className="size-4" /> {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ModeBadge aiAvailable={aiAvailable} />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/create">
              <Plus /> New Quest
            </Link>
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
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="px-4 pb-3 md:hidden"
          >
            <div className="surface overflow-hidden rounded-2xl">
              {[...LINKS, { href: "/create", label: "New Quest", icon: Plus }].map((l, i) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn("flex items-center gap-3 px-4 py-3.5 t-body text-ink active:bg-fill-4", i > 0 && "border-t border-line")}
                >
                  <l.icon className="size-5 text-tint" /> {l.label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function ModeBadge({ aiAvailable }: { aiAvailable: boolean }) {
  return aiAvailable ? (
    <span className="hidden items-center gap-1 rounded-full bg-success-fill/15 px-2.5 py-1 t-caption font-semibold text-success sm:inline-flex" title="Gemini on Vertex AI is configured">
      <Sparkles className="size-3.5" /> Live AI
    </span>
  ) : (
    <span
      className="inline-flex items-center rounded-full bg-amber-fill/15 px-2.5 py-1 t-caption font-semibold text-amber"
      title="No AI credentials are configured. The demo quest uses prepared, hand-checked content and template-generated follow-ups."
    >
      Demo mode
    </span>
  );
}
