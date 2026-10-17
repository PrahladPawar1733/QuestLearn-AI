"use client";

/**
 * `window.speechSynthesis` read-aloud.
 *
 * This is the accessibility channel for **arbitrary** text — a question stem,
 * an option, a tutor paragraph, an AI follow-up generated thirty seconds ago.
 * It is free, instant, unlimited, works offline, and uses the voice and rate
 * the student has already configured on their own device, none of which is
 * true of a generated clip. Generated narration is reserved for authored,
 * cacheable lines (`docs/audio-and-video-lessons.md:52`).
 *
 * Shape follows `src/lib/haptics.ts` and `src/lib/game/audio/context.ts`:
 * nothing touches `window` at module load, every entry point is guarded, and
 * an unsupported browser is a silent no-op rather than a thrown error.
 *
 * ## Known flakiness — read before relying on any of this
 *
 * The Web Speech API is the least consistently implemented API we use. All of
 * the following are real and all of them are worked around here:
 *
 *  - **`getVoices()` is empty on first call in Chromium.** The voice list
 *    loads asynchronously and only then fires `voiceschanged`. Code that
 *    reads voices once at startup gets an empty array. → {@link onVoicesChanged}
 *    and {@link primeVoices}.
 *  - **Safari (especially iOS) needs a user gesture** for the first utterance
 *    and silently drops it otherwise. → never call `speak()` from an effect;
 *    only from a click/press handler.
 *  - **`onend` sometimes never fires** (Chrome, long text; Android WebView on
 *    `cancel()`). A caller that awaits it hangs forever. → a watchdog timer
 *    estimated from the text length resolves the promise anyway.
 *  - **Long utterances cut off silently** in Chrome at a few hundred
 *    characters. → text is chunked on sentence boundaries and queued.
 *  - **`cancel()` can wedge the queue** if called while an utterance is
 *    starting, leaving `speaking === true` forever. → `cancel()` clears our
 *    own queue first and tolerates a throw.
 *  - **Rate is not comparable across engines**: 1.0 is noticeably faster on
 *    macOS than on Android. → rate is a student preference we persist, not a
 *    number we tune.
 *  - **`pause()`/`resume()` are unreliable on mobile.** Not exposed; stop and
 *    re-speak instead.
 *
 * If this ever needs to be dependable rather than best-effort, the answer is
 * a pre-generated clip, not more workarounds.
 */

export interface SpeechVoiceOption {
  /** `SpeechSynthesisVoice.voiceURI`, the only stable identifier. */
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export interface SpeechPrefs {
  enabled: boolean;
  /** `voiceURI`, or null for the platform default. */
  voiceId: string | null;
  /** 0.5..2. Browser default is 1. */
  rate: number;
  /** 0..2. Left at 1 unless a student asks. */
  pitch: number;
}

export interface SpeakOptions {
  voiceId?: string | null;
  rate?: number;
  pitch?: number;
  lang?: string;
  /** Fired once, when the whole text has been spoken, cancelled or given up on. */
  onDone?: (reason: "ended" | "cancelled" | "error" | "timeout") => void;
}

const PREFS_KEY = "ql.lesson.speech.v1";
/** Chrome truncates long utterances; keep each chunk comfortably short. */
const MAX_CHUNK_CHARS = 180;
/** Generous estimate for the watchdog: ~12 chars/second at rate 1. */
const WATCHDOG_MS_PER_CHAR = 85;
const WATCHDOG_FLOOR_MS = 2500;

const DEFAULT_PREFS: SpeechPrefs = { enabled: true, voiceId: null, rate: 1, pitch: 1 };

let prefs: SpeechPrefs | null = null;
let unsupported = false;
let voicesPrimed = false;
/** The chunks still to be spoken for the current call. */
let queue: string[] = [];
let activeDone: SpeakOptions["onDone"] | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;

function synth(): SpeechSynthesis | null {
  if (unsupported) return null;
  if (typeof window === "undefined") return null;
  try {
    // Reading the global can throw in hardened browsers, same as AudioContext.
    const s = window.speechSynthesis;
    if (!s || typeof s.speak !== "function" || typeof window.SpeechSynthesisUtterance !== "function") {
      unsupported = true;
      return null;
    }
    return s;
  } catch {
    unsupported = true;
    return null;
  }
}

/** True when read-aloud can work at all. Hide the control when false. */
export function speechSupported(): boolean {
  return synth() !== null;
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export function loadSpeechPrefs(): SpeechPrefs {
  if (prefs) return prefs;
  const next = { ...DEFAULT_PREFS };
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SpeechPrefs>;
      if (typeof parsed.enabled === "boolean") next.enabled = parsed.enabled;
      if (typeof parsed.voiceId === "string" || parsed.voiceId === null) next.voiceId = parsed.voiceId;
      if (typeof parsed.rate === "number") next.rate = clampRate(parsed.rate);
      if (typeof parsed.pitch === "number") next.pitch = clampPitch(parsed.pitch);
    }
  } catch {
    /* localStorage throws outright in some privacy modes; defaults are fine. */
  }
  prefs = next;
  return next;
}

export function setSpeechPrefs(patch: Partial<SpeechPrefs>): SpeechPrefs {
  const p = loadSpeechPrefs();
  if (patch.enabled !== undefined) p.enabled = patch.enabled;
  if (patch.voiceId !== undefined) p.voiceId = patch.voiceId;
  if (patch.rate !== undefined) p.rate = clampRate(patch.rate);
  if (patch.pitch !== undefined) p.pitch = clampPitch(patch.pitch);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  if (!p.enabled) cancelSpeech();
  return { ...p };
}

function clampRate(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(2, Math.max(0.5, v));
}

function clampPitch(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(2, Math.max(0, v));
}

/* ------------------------------------------------------------------ */
/* Voices                                                             */
/* ------------------------------------------------------------------ */

/**
 * The voices available right now. Can legitimately be empty on the first
 * call in Chromium — subscribe with {@link onVoicesChanged} rather than
 * assuming this is the final answer.
 */
export function listVoices(lang?: string): SpeechVoiceOption[] {
  const s = synth();
  if (!s) return [];
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = s.getVoices() ?? [];
  } catch {
    return [];
  }
  const match = lang ? voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.toLowerCase())) : voices;
  return (match.length ? match : voices).map((v) => ({
    id: v.voiceURI,
    name: v.name,
    lang: v.lang,
    localService: v.localService,
    default: v.default,
  }));
}

/** Subscribe to the async voice list. Returns an unsubscribe. */
export function onVoicesChanged(fn: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  try {
    s.addEventListener?.("voiceschanged", fn);
  } catch {
    return () => {};
  }
  return () => {
    try {
      s.removeEventListener?.("voiceschanged", fn);
    } catch {
      /* ignore */
    }
  };
}

/**
 * Nudge Chromium into loading the voice list. Safe to call repeatedly; does
 * nothing after the first call, and nothing at all where unsupported.
 */
export function primeVoices(): void {
  if (voicesPrimed) return;
  const s = synth();
  if (!s) return;
  voicesPrimed = true;
  try {
    s.getVoices();
  } catch {
    /* ignore */
  }
}

function resolveVoice(voiceId: string | null | undefined, lang?: string): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  try {
    const voices = s.getVoices() ?? [];
    if (voiceId) {
      const exact = voices.find((v) => v.voiceURI === voiceId);
      if (exact) return exact;
    }
    if (lang) {
      const byLang = voices.find((v) => v.lang?.toLowerCase().startsWith(lang.toLowerCase()));
      if (byLang) return byLang;
    }
    return null; // let the engine pick its default
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Speaking                                                           */
/* ------------------------------------------------------------------ */

/**
 * Split on sentence boundaries, then on commas, then hard-wrap. Chunking is
 * what keeps Chrome from truncating a long paragraph, and it also makes
 * `cancel()` land within a sentence instead of a whole page.
 */
export function chunkForSpeech(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const out: string[] = [];
  let buffer = "";
  const sentences = clean.split(/(?<=[.!?;:])\s+/);
  const push = (piece: string) => {
    if (!piece) return;
    if ((buffer + " " + piece).trim().length <= maxChars) {
      buffer = (buffer + " " + piece).trim();
    } else {
      if (buffer) out.push(buffer);
      buffer = piece;
    }
  };
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      push(sentence);
      continue;
    }
    for (const clause of sentence.split(/(?<=,)\s+/)) {
      if (clause.length <= maxChars) {
        push(clause);
        continue;
      }
      for (let i = 0; i < clause.length; i += maxChars) push(clause.slice(i, i + maxChars));
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

/**
 * Strip the things a screen reader would mangle: `$...$` LaTeX delimiters and
 * markdown emphasis. The maths itself is read as-is — poorly, but a student
 * who needs read-aloud is better served by "v one equals" than by silence.
 */
export function speechText(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, " $1 ")
    .replace(/\$([^$\n]+?)\$/g, " $1 ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[_^{}\\*`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Speak `text`. Returns `false` when nothing will be spoken (unsupported,
 * switched off, or empty text) so the caller can leave the control out.
 *
 * **Call this from a user gesture.** Safari drops the first utterance
 * otherwise, and an unprompted voice is startling in any case.
 */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  const s = synth();
  if (!s) return false;
  const p = loadSpeechPrefs();
  if (!p.enabled) return false;
  const chunks = chunkForSpeech(speechText(text));
  if (!chunks.length) return false;

  cancelSpeech();
  queue = chunks;
  activeDone = options.onDone ?? null;
  speakNext(s, options);
  return true;
}

function speakNext(s: SpeechSynthesis, options: SpeakOptions): void {
  const next = queue.shift();
  if (next === undefined) {
    finish("ended");
    return;
  }
  const p = loadSpeechPrefs();
  let utterance: SpeechSynthesisUtterance;
  try {
    utterance = new window.SpeechSynthesisUtterance(next);
  } catch {
    finish("error");
    return;
  }
  const voice = resolveVoice(options.voiceId ?? p.voiceId, options.lang);
  if (voice) utterance.voice = voice;
  if (options.lang) utterance.lang = options.lang;
  utterance.rate = clampRate(options.rate ?? p.rate);
  utterance.pitch = clampPitch(options.pitch ?? p.pitch);

  utterance.onend = () => {
    clearWatchdog();
    speakNext(s, options);
  };
  utterance.onerror = () => {
    clearWatchdog();
    // An error on one chunk should not silence the rest of the sentence.
    if (queue.length) speakNext(s, options);
    else finish("error");
  };

  // The watchdog: `onend` genuinely does not always fire.
  const budget = Math.max(WATCHDOG_FLOOR_MS, next.length * WATCHDOG_MS_PER_CHAR) / utterance.rate;
  watchdog = setTimeout(() => {
    watchdog = null;
    if (queue.length) speakNext(s, options);
    else finish("timeout");
  }, budget);

  try {
    s.speak(utterance);
  } catch {
    clearWatchdog();
    finish("error");
  }
}

function clearWatchdog(): void {
  if (watchdog !== null) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

function finish(reason: "ended" | "cancelled" | "error" | "timeout"): void {
  const done = activeDone;
  activeDone = null;
  queue = [];
  clearWatchdog();
  try {
    done?.(reason);
  } catch {
    /* a broken callback must not break the next utterance */
  }
}

/** Stop immediately. Safe to call when nothing is speaking. */
export function cancelSpeech(): void {
  const s = synth();
  const wasActive = activeDone !== null || queue.length > 0;
  // Clear our own queue *before* cancel(), so the `onend` that cancel fires
  // cannot start the next chunk.
  queue = [];
  clearWatchdog();
  if (wasActive) finish("cancelled");
  if (!s) return;
  try {
    s.cancel();
  } catch {
    /* some WebViews throw if nothing is speaking */
  }
}

export function isSpeaking(): boolean {
  const s = synth();
  if (!s) return false;
  try {
    return s.speaking || s.pending || queue.length > 0;
  } catch {
    return false;
  }
}

/** Test seam: forget cached prefs and the unsupported flag. */
export function __resetSpeechForTests(): void {
  cancelSpeech();
  prefs = null;
  unsupported = false;
  voicesPrimed = false;
}
