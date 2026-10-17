import Link from "next/link";
import { cn } from "@/lib/cn";

/** Simple mark: an ink square with a play notch. Used for the favicon and small spots. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="m13 10.5 9 5.5-9 5.5z" fill="var(--bg)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight text-ink", className)} aria-label="QuestLearn home">
      <LogoMark className="size-5" />
      <span>QuestLearn</span>
    </Link>
  );
}
