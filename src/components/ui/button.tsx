import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Apple-style buttons: filled (prominent), tinted, gray and plain.
 * Feedback happens on pointer-down (scale 0.97) and is instant.
 */
const buttonVariants = cva(
  "pressable inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Filled with the app tint: the one primary action on a screen. */
        primary: "bg-tint text-on-tint hover:brightness-110 active:bg-primary-strong",
        /** Filled green: commit after success (e.g. Continue). */
        success: "bg-success-fill text-white hover:brightness-105",
        /** Tinted: secondary prominent actions. */
        tinted: "bg-tint/15 text-tint hover:bg-tint/20",
        /** Gray: neutral secondary actions. */
        secondary: "bg-fill-3 text-ink hover:bg-fill-2",
        /** Plain text button in tint. */
        ghost: "text-tint hover:bg-fill-4",
        /** Plain neutral (e.g. toolbar icons). */
        plain: "text-muted hover:bg-fill-4 hover:text-ink",
        outline: "bg-fill-4 text-ink hover:bg-fill-3",
        danger: "bg-danger/12 text-danger hover:bg-danger/18",
        amber: "bg-amber-fill/15 text-amber hover:bg-amber-fill/22",
      },
      size: {
        sm: "h-8 rounded-full px-3.5 text-[0.8125rem]",
        md: "h-11 rounded-xl px-5 text-[0.9375rem]",
        lg: "h-[3.125rem] rounded-[0.875rem] px-6 text-[1.0625rem]",
        icon: "size-9 rounded-full",
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
