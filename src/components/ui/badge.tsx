import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Quiet metadata label: plain small text, coloured only when the colour means something. */
const badgeVariants = cva("inline-flex items-center gap-1 t-caption font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "text-muted",
      primary: "text-muted",
      cyan: "text-muted",
      success: "text-success",
      danger: "text-danger",
      amber: "text-amber",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
