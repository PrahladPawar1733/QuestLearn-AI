import type { ComponentType } from "react";
import type { SkinWorld } from "@/lib/types";
import type { WorldProps } from "../types";
import { ClassicWorld } from "./classic";

/**
 * The 2D experience. Five decorative "worlds" were retired (see WORLDS in
 * ../types.ts for why); their ids still map here so a session saved under an
 * old world id resumes in Focus instead of failing to render.
 */
export const WORLD_COMPONENTS: Record<SkinWorld, ComponentType<WorldProps>> = {
  classic: ClassicWorld,
  balloons: ClassicWorld,
  rocket: ClassicWorld,
  maze: ClassicWorld,
  bubbles: ClassicWorld,
  castle: ClassicWorld,
};
