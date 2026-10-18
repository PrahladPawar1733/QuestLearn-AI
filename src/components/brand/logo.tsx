import Link from "next/link";
import { cn } from "@/lib/cn";

/** Simple mark: an ink square with a play notch. Used for the favicon and small spots. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} aria-hidden>
      <defs>
        <linearGradient id="ql-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b45f0" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#ql-mark)" />
      <path d="m13 10.5 9 5.5-9 5.5z" fill="#fff" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-[1.0625rem] font-bold tracking-tight text-ink", className)} aria-label="QuestLearn home">
      <LogoMark className="size-7" />
      <span>QuestLearn</span>
    </Link>
  );
}
