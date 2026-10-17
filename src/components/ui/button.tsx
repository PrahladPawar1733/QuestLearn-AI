import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons: one filled (primary), the rest hairline or text.
 * Feedback happens on pointer-down (scale 0.97) and is instant.
 */
const buttonVariants = cva(
  "pressable inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.05em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Ink on paper: the one primary action on a screen. */
        primary: "bg-tint text-on-tint hover:bg-primary-strong",
        /** Green: commit after a correct answer. */
        success: "bg-success-fill text-white hover:brightness-105",
        /** Hairline buttons for everything secondary. */
        secondary: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-fill-4",
        tinted: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-fill-4",
        outline: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-fill-4",
        /** Text-only. */
        ghost: "text-ink hover:bg-fill-4",
        plain: "text-muted hover:bg-fill-4 hover:text-ink",
        danger: "text-danger shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-danger-fill/8",
        amber: "text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-fill-4",
      },
      size: {
        sm: "h-8 rounded-lg px-3 text-[0.8125rem]",
        md: "h-10 rounded-[10px] px-4 text-[0.9375rem]",
        lg: "h-11 rounded-[10px] px-5 text-[0.9375rem]",
        icon: "size-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

export { buttonVariants };
