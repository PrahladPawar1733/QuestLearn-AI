import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Soft tinted capsules. Colour always comes with a text label. */
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 t-caption font-semibold [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-fill-3 text-muted",
      primary: "bg-tint/10 text-tint",
      cyan: "bg-blue/10 text-blue",
      success: "bg-success-fill/12 text-success",
      danger: "bg-danger-fill/10 text-danger",
      amber: "bg-amber-fill/14 text-amber",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
