import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Small tinted capsules. Color carries meaning together with the text label. */
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-caption font-semibold [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-fill-3 text-muted",
      primary: "bg-tint/14 text-tint",
      cyan: "bg-cyan/14 text-cyan",
      success: "bg-success-fill/16 text-success",
      danger: "bg-danger-fill/14 text-danger",
      amber: "bg-amber-fill/16 text-amber",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
