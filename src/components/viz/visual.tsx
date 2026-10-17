import type { VisualSpec } from "@/lib/types";
import { BounceDiagram } from "./bounce-diagram";
import { CollisionDiagram } from "./collision-diagram";
import { MomentumBars } from "./momentum-bars";

export function Visual({ spec, mode = "full" }: { spec: VisualSpec; mode?: "before" | "full" }) {
  switch (spec.kind) {
    case "collision-1d":
      return <CollisionDiagram spec={spec} mode={mode} />;
    case "bounce":
      return <BounceDiagram spec={spec} hideAnswer={mode === "before"} />;
    case "momentum-bars":
      return <MomentumBars spec={spec} />;
  }
}
