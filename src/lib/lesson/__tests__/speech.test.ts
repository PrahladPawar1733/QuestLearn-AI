/**
 * `speechSynthesis` read-aloud.
 *
 * Runs in `environment: "node"`, which is the *unsupported* case — so these
 * tests prove the no-op contract: nothing throws, nothing is spoken, and
 * `speechSupported()` reports false so the UI can leave the control out.
 * The pure text helpers (chunking, LaTeX stripping) are covered properly.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetSpeechForTests,
  cancelSpeech,
  chunkForSpeech,
  isSpeaking,
  listVoices,
  loadSpeechPrefs,
  onVoicesChanged,
  primeVoices,
  setSpeechPrefs,
  speak,
  speechSupported,
  speechText,
} from "../speech";

afterEach(() => {
  __resetSpeechForTests();
});

describe("where speech synthesis is unavailable", () => {
  it("reports no support and speaks nothing, without throwing", () => {
    expect(speechSupported()).toBe(false);
    expect(speak("Two kilograms at six metres per second.")).toBe(false);
    expect(isSpeaking()).toBe(false);
    expect(listVoices()).toEqual([]);
    expect(() => {
      primeVoices();
      cancelSpeech();
    }).not.toThrow();
  });

  it("returns an unsubscribe that is safe to call", () => {
    const off = onVoicesChanged(() => {});
    expect(() => off()).not.toThrow();
  });
});

describe("preferences", () => {
  it("defaults to on at rate 1 with the platform voice", () => {
    expect(loadSpeechPrefs()).toEqual({ enabled: true, voiceId: null, rate: 1, pitch: 1 });
  });

  it("clamps rate and pitch to what every engine accepts", () => {
    expect(setSpeechPrefs({ rate: 99 }).rate).toBe(2);
    expect(setSpeechPrefs({ rate: 0 }).rate).toBe(0.5);
    expect(setSpeechPrefs({ pitch: -3 }).pitch).toBe(0);
    expect(setSpeechPrefs({ rate: Number.NaN }).rate).toBe(1);
  });

  it("switching read-aloud off makes speak() a no-op", () => {
    setSpeechPrefs({ enabled: false });
    expect(speak("anything")).toBe(false);
  });
});

describe("speechText", () => {
  it("strips the LaTeX delimiters a voice would read as dollars", () => {
    expect(speechText("Momentum is $p = mv$ here.")).toBe("Momentum is p = mv here.");
    expect(speechText("$$v = \\dfrac{m_1 u_1}{m_1 + m_2}$$")).toBe("v = m 1 u 1 m 1 + m 2");
  });

  it("collapses whitespace and leaves plain prose alone", () => {
    expect(speechText("  Twelve  over three\nis four. ")).toBe("Twelve over three is four.");
  });
});

describe("chunkForSpeech", () => {
  it("keeps a short line whole", () => {
    expect(chunkForSpeech("They stick together.")).toEqual(["They stick together."]);
  });

  it("returns nothing for empty text", () => {
    expect(chunkForSpeech("   ")).toEqual([]);
  });

  it("splits on sentence boundaries once Chrome's truncation point is near", () => {
    const text = `${"a".repeat(100)}. ${"b".repeat(100)}. ${"c".repeat(100)}.`;
    const chunks = chunkForSpeech(text, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120);
    expect(chunks.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });

  it("hard-wraps a single sentence with no punctuation to lean on", () => {
    const chunks = chunkForSpeech("x".repeat(500), 100);
    expect(chunks).toHaveLength(5);
    for (const c of chunks) expect(c.length).toBe(100);
  });

  it("packs several short sentences into one utterance", () => {
    // Fewer utterances means fewer chances for a missing `onend`.
    expect(chunkForSpeech("One. Two. Three. Four.", 60)).toEqual(["One. Two. Three. Four."]);
  });
});
