import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons: a brand-gradient primary, white secondary, tinted and text variants.
 * Feedback happens on pointer-down (scale 0.97) and is instant.
 */
const buttonVariants = cva(
  "pressable inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[1.05em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Brand gradient with a soft glow: the one primary action on a screen. */
        primary: "bg-brand text-on-tint shadow-[0_8px_20px_-8px_rgb(91_69_240/0.7)] hover:brightness-110",
        /** Green: commit after a correct answer. */
        success: "bg-success-fill text-white shadow-[0_8px_20px_-8px_rgb(22_163_74/0.6)] hover:brightness-105",
        /** White with depth, for secondary actions. */
        secondary: "bg-surface text-ink shadow-[0_1px_2px_rgb(30_24_90/0.06),inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2",
        outline: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2",
        /** Soft brand tint. */
        tinted: "bg-tint/10 text-tint hover:bg-tint/15",
        ghost: "text-tint hover:bg-tint/8",
        plain: "text-muted hover:bg-fill-4 hover:text-ink",
        danger: "bg-danger-fill/10 text-danger hover:bg-danger-fill/15",
        amber: "bg-amber-fill/12 text-amber hover:bg-amber-fill/18",
      },
      size: {
        sm: "h-8 rounded-[10px] px-3 text-[0.8125rem]",
        md: "h-10 rounded-xl px-4 text-[0.9375rem]",
        lg: "h-12 rounded-[14px] px-6 text-[1rem]",
        icon: "size-9 rounded-xl",
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
