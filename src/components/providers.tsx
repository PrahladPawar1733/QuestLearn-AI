"use client";

import { MotionConfig } from "motion/react";
import { spring } from "@/lib/motion";

/**
 * App-wide motion defaults: every Motion animation is a critically damped
 * spring unless it says otherwise, and the OS reduced-motion setting is honored.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={spring.default}>
      {children}
    </MotionConfig>
  );
}
