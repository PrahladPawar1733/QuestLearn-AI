import { cn } from "@/lib/cn";

/**
 * The framing the README insists on, rendered wherever a mastery number is.
 *
 * It lives in its own module so every screen can import it without pulling in
 * anything else, and so it is one edit rather than five if the wording changes.
 * A mastery score is a practice guide; saying so is part of showing it.
 */
export function MasteryDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("t-footnote text-faint", className)}>
      Mastery is a practice guide, not a validated psychometric score and not a prediction of exam performance. It describes your recent answers in this app and
      nothing else.
    </p>
  );
}
