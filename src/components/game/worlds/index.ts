import type { ComponentType } from "react";
import type { GameWorld } from "@/lib/types";
import type { WorldProps } from "../types";
import { BalloonsWorld } from "./balloons";
import { BubblesWorld } from "./bubbles";
import { CastleWorld } from "./castle";
import { ClassicWorld } from "./classic";
import { MazeWorld } from "./maze";
import { RocketWorld } from "./rocket";

export const WORLD_COMPONENTS: Record<GameWorld, ComponentType<WorldProps>> = {
  classic: ClassicWorld,
  balloons: BalloonsWorld,
  rocket: RocketWorld,
  maze: MazeWorld,
  bubbles: BubblesWorld,
  castle: CastleWorld,
};
