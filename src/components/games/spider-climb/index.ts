/**
 * Spider Climb — the `GameModule`.
 *
 * Page layout: a canvas band for the swing, with the question as DOM beneath.
 * Works for any subject, because the only thing it needs from a chapter is a
 * multiple-choice question — the web anchor is just the chosen option.
 */
import type { GameModule } from "@/lib/game/module";
import { SpiderClimbGame, type SpiderHud } from "./game";
import { SpiderClimbHud } from "./hud";

const EMPTY_HUD: SpiderHud = {
  intent: "", conceptTitle: "", question: null, tried: [], selected: -1, phase: "move",
  hearts: 3, score: 0, streak: 0, bestStreak: 0, firstTry: 0, answered: 0, total: 8,
  banner: null, toast: null, hintKey: "run", miss: null, awaitingRetry: false,
};

export const spiderClimbModule: GameModule<SpiderHud> = {
  id: "spider-climb",
  tagline: "At every gap a question appears. Your answer picks the web anchor.",
  rewardLine: "The right answer holds and you swing to the next building.",
  controls: [
    { keys: "Click / tap", action: "Pick an anchor" },
    { keys: "Esc", action: "Pause" },
  ],
  touchHint: "tap the answer you think is right.",
  emptyHud: EMPTY_HUD,
  presentsOwnQuestions: true,
  layout: "page",
  create: (opts) => new SpiderClimbGame({ learningCheckpoints: opts.learningCheckpoints }),
  Hud: SpiderClimbHud,
};

export default spiderClimbModule;
