/**
 * Force Rush — the `GameModule`.
 *
 * Page layout: the author's night-road canvas as a band at the top, with the
 * question panel as real DOM beneath it. Works for any subject, because all
 * the engine wants from a chapter is a multiple-choice question — the five
 * obstacles are the question's consequence, not its content.
 */
import type { GameModule } from "@/lib/game/module";
import { EMPTY_FORCE_RUSH_HUD, ForceRushGame, type ForceRushHud } from "./game";
import { ForceRushHudView } from "./hud";

export const forceRushModule: GameModule<ForceRushHud> = {
  id: "force-rush",
  tagline:
    "Every obstacle asks one question. The right answer opens the way. The wrong one costs you health, then shows you why.",
  rewardLine: "The right answer opens the gate, drops the bridge or powers the jump, and the car drives on.",
  controls: [
    { keys: "Click / tap", action: "Answer at the checkpoint" },
    { keys: "Esc", action: "Pause" },
  ],
  touchHint: "tap the answer you think is right. The car does the driving.",
  emptyHud: EMPTY_FORCE_RUSH_HUD,
  presentsOwnQuestions: true,
  layout: "page",
  create: (opts) => new ForceRushGame({ learningCheckpoints: opts.learningCheckpoints }),
  Hud: ForceRushHudView,
};

export default forceRushModule;
