import Link from "next/link";
import { cn } from "@/lib/cn";

/** App icon: a continuous-corner tile in the app tint with a play-lens glyph. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="qlg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d7aff" />
          <stop offset="1" stopColor="#5856d6" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="8" fill="url(#qlg)" />
      <path d="M16 7.5a8.5 8.5 0 1 0 5.4 15.06l2.6 2.6 2.1-2.1-2.6-2.6A8.5 8.5 0 0 0 16 7.5Zm0 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" fill="#fff" />
      <path d="m14.6 13.2 4 2.8-4 2.8z" fill="#fff" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("pressable flex items-center gap-2 t-headline text-ink", className)} aria-label="QuestLearn AI home">
      <LogoMark />
      <span>QuestLearn</span>
    </Link>
  );
}
