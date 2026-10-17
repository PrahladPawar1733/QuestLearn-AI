"use client";

import { OptionList } from "../option-list";
import type { WorldProps } from "../types";

/** Quest Arena: the focused default world. Progress is shown as checkpoints in the status bar. */
export function ClassicWorld(props: WorldProps) {
  return <OptionList {...props} />;
}
