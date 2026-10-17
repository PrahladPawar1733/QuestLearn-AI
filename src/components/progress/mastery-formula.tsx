import { MASTERY_CONFIG } from "@/lib/engine/mastery";
import { MasteryDisclaimer } from "./mastery-disclaimer";
import { reachableCeiling } from "./mastery-math";

/**
 * The formula, in words, with every number read out of `MASTERY_CONFIG` rather
 * than typed in — so this text cannot drift away from the engine.
 *
 * The transparency is the point: a student who knows the arithmetic can tell
 * the difference between "the app likes me" and "I answered three hard
 * questions right".
 */
export function MasteryFormula() {
  const c = MASTERY_CONFIG;
  const bands = c.levels.filter((l) => l.min > 0);
  const ceiling = reachableCeiling("hard", false);
  const ceilingWithFollowUps = reachableCeiling("hard", true);
  return (
    <div className="space-y-3 t-subhead text-muted">
      <p>
        For each concept we take your last {c.windowSize} answers. Newer answers count more — each step back is ×{c.recencyDecay}. Follow-up questions (the second
        chance after a mistake) count ×{c.followUpWeight}, because they test whether the mistake was really fixed. Hard questions count ×
        {c.difficultyWeight.hard}, easy ones ×{c.difficultyWeight.easy}.
      </p>
      <p>
        A correct answer taken with a hint earns {c.hintCredit * 100}% credit. Every concept also starts with a neutral {c.prior * 100}% at weight {c.priorWeight},
        which never leaves the sum — that is why one lucky answer cannot read as mastery, and why a run of {c.windowSize} perfect hard answers reaches {ceiling}%
        rather than 100%. Getting follow-ups right after a mistake is what pushes past it ({ceilingWithFollowUps}%).
      </p>
      <p>
        The bands:{" "}
        {bands.map((l, i) => (
          <span key={l.label}>
            {i > 0 ? ", " : ""}
            <span className="text-ink">{l.label}</span> needs {l.min}% and {l.minAttempts} {l.minAttempts === 1 ? "attempt" : "attempts"}
          </span>
        ))}
        . Below that it reads &ldquo;Needs revision&rdquo;.
      </p>
      <MasteryDisclaimer />
    </div>
  );
}
