import { describe, expect, it } from "vitest";
import type { ImageQuality, QualityVerdict } from "@/lib/capture";
import { countNeedingAttention, gateFor, qualitySummary, severityRank, worstGate } from "../quality-gate";

/** A well-exposed, sharp page; override one field per test. */
function frame(over: Partial<ImageQuality> = {}): ImageQuality {
  return {
    blurScore: 800,
    luminance: 170,
    contrast: 0.22,
    glareFraction: 0.002,
    coverage: 0.72,
    coverageConfidence: 0.8,
    verdict: "good",
    advice: "Looks good. Go ahead and capture.",
    ...over,
  };
}

describe("gateFor", () => {
  it("passes a good frame without asking anything", () => {
    const g = gateFor(frame());
    expect(g.severity).toBe("ok");
    expect(g.needsDecision).toBe(false);
    expect(g.tone).toBe("success");
  });

  it("asks about a soft frame but keeps it usable", () => {
    const g = gateFor(frame({ verdict: "soft", blurScore: 90, advice: "Almost there — hold still for a second and tap to focus." }));
    expect(g.severity).toBe("warn");
    expect(g.needsDecision).toBe(true);
    // The advice is the pipeline's own words, not re-written here.
    expect(g.advice).toContain("tap to focus");
  });

  it.each<[QualityVerdict, string]>([
    ["blurry", "Too blurry to read"],
    ["dark", "Too dark to read"],
    ["bright", "Washed out by light"],
    ["low-contrast", "Can't make out any writing"],
  ])("flags a %s frame as poor and asks for a retake", (verdict, headline) => {
    const g = gateFor(frame({ verdict }));
    expect(g.severity).toBe("poor");
    expect(g.headline).toBe(headline);
    expect(g.needsDecision).toBe(true);
    expect(g.tone).toBe("danger");
  });

  it("never blocks, for any verdict — the policy this file exists to hold", () => {
    const verdicts: QualityVerdict[] = ["good", "soft", "blurry", "dark", "bright", "low-contrast"];
    for (const verdict of verdicts) expect(gateFor(frame({ verdict })).canKeep).toBe(true);
    expect(gateFor(null).canKeep).toBe(true);
  });

  it("says 'not checked' rather than 'fine' when the measurement could not run", () => {
    const g = gateFor(null);
    expect(g.severity).toBe("unknown");
    expect(g.verdict).toBeNull();
    // No claim about the photo itself: we have no evidence either way.
    expect(g.needsDecision).toBe(false);
    expect(g.badge).toBe("Not checked");
  });

  it("treats glare on a sharp frame as worth asking about", () => {
    // Glare removes content outright, which sharpness alone cannot reveal.
    const g = gateFor(frame({ glareFraction: 0.09, advice: "Shiny spot on the page — tilt it slightly to kill the glare." }));
    expect(g.severity).toBe("warn");
    expect(g.needsDecision).toBe(true);
    expect(g.badge).toBe("Glare");
  });

  it("mentions a distant page without interrupting for it", () => {
    const g = gateFor(frame({ coverage: 0.2, coverageConfidence: 0.7 }));
    expect(g.severity).toBe("warn");
    expect(g.needsDecision).toBe(false);
  });

  it("ignores a coverage reading the detector is not confident about", () => {
    // Low separability means the page/background split is a guess; acting on it
    // would nag students photographing a page that fills the frame.
    const g = gateFor(frame({ coverage: 0.2, coverageConfidence: 0.1 }));
    expect(g.severity).toBe("ok");
  });
});

describe("batch helpers", () => {
  const good = gateFor(frame());
  const soft = gateFor(frame({ verdict: "soft" }));
  const blurry = gateFor(frame({ verdict: "blurry" }));
  const unchecked = gateFor(null);

  it("ranks severities so the worst page surfaces", () => {
    expect(severityRank("poor")).toBeGreaterThan(severityRank("warn"));
    expect(severityRank("warn")).toBeGreaterThan(severityRank("unknown"));
    expect(severityRank("unknown")).toBeGreaterThan(severityRank("ok"));
    expect(worstGate([good, soft, blurry, unchecked])?.severity).toBe("poor");
    expect(worstGate([])).toBeNull();
  });

  it("counts only the pages it would ask about", () => {
    // "Not checked" is not a problem, so it is not counted.
    expect(countNeedingAttention([good, unchecked, soft, blurry])).toBe(2);
  });

  it("summarises with counts, not adjectives", () => {
    expect(qualitySummary([good, good])).toBeNull();
    expect(qualitySummary([good, blurry, soft])).toContain("1 of 3");
    expect(qualitySummary([good, soft])).toContain("readable");
    // A poor page outranks a soft one in the summary.
    expect(qualitySummary([blurry, soft])).toContain("too hard to read");
  });
});
