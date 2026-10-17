"use client";

import { Flame, Star } from "lucide-react";
import { useState } from "react";
import { OptionList } from "@/components/game/option-list";
import type { OptionId } from "@/components/game/types";
import { RichText } from "@/components/math/rich-text";
import { Badge } from "@/components/ui/badge";
import { CollisionDiagram } from "@/components/viz/collision-diagram";
import type { PublicQuestion } from "@/lib/types";

/**
 * Product shot built from the real quest components and the real demo
 * question. Selecting only highlights; scoring happens inside the quest.
 */
export function HeroPreview({ question }: { question: PublicQuestion }) {
  const [selected, setSelected] = useState<OptionId | null>("B");
  return (
    <div className="surface rounded-[2rem] p-4 shadow-[var(--shadow-float)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 gap-[3px]">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i < 3 ? "bg-success-fill" : i === 3 ? "bg-tint" : "bg-fill-2"}`} />
          ))}
        </div>
        <span className="flex items-center gap-1 rounded-full bg-amber-fill/15 px-2 py-0.5 font-rounded t-footnote font-semibold text-amber">
          <Flame className="size-3.5" fill="currentColor" />3
        </span>
        <span className="flex items-center gap-1 rounded-full bg-tint/14 px-2 py-0.5 font-rounded t-footnote font-semibold text-tint">
          <Star className="size-3.5" fill="currentColor" />
          340
        </span>
      </div>
      <div className="mb-3 flex gap-1.5">
        <Badge tone="primary">{question.conceptTitle}</Badge>
        <Badge tone="cyan">Medium</Badge>
      </div>
      <p className="mb-4 t-headline text-ink">
        <RichText text={question.text} />
      </p>
      {question.visual?.kind === "collision-1d" && (
        <div className="mb-4">
          <CollisionDiagram spec={question.visual} mode="before" />
        </div>
      )}
      <OptionList question={question} phase="answering" selected={selected} onSelect={setSelected} compact />
    </div>
  );
}
