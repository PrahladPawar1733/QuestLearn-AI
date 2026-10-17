"use client";

/**
 * A speaker button that reads arbitrary text with `window.speechSynthesis`.
 *
 * Free, instant, unlimited, offline, and it uses the voice and rate the
 * student has already configured on their device — none of which a fixed
 * generated voice can do. This is the accessibility read-aloud for question
 * stems, options and tutor text; generated narration is only ever used for
 * authored, cacheable lines.
 *
 * The button renders `null` when the browser has no speech synthesis, so an
 * unsupported browser shows no dead control.
 */
import { Square, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { cancelSpeech, isSpeaking, primeVoices, speak, speechSupported } from "@/lib/lesson/speech";

/** Support never changes after load, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};
/** The server renders "unsupported": it has no `window` to ask. */
const supportedOnServer = () => false;

export function ReadAloudButton({
  text,
  label = "Read aloud",
  className,
}: {
  text: string;
  /** Accessible name; include what is being read, e.g. "Read option B aloud". */
  label?: string;
  className?: string;
}) {
  // A capability read, not component state: `useSyncExternalStore` gets it
  // from the browser after hydration without a cascading render.
  const supported = useSyncExternalStore(noSubscribe, speechSupported, supportedOnServer);
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Chromium loads the voice list asynchronously and only then fires
    // `voiceschanged`; this nudges it so the first press has voices.
    primeVoices();
    return () => {
      if (isSpeaking()) cancelSpeech();
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      // Always from a real press: Safari drops an utterance started from an
      // effect, and unprompted speech is startling in any case.
      onClick={() => {
        if (active) {
          cancelSpeech();
          setActive(false);
          return;
        }
        const started = speak(text, { onDone: () => setActive(false) });
        setActive(started);
      }}
      aria-label={active ? "Stop reading" : label}
      aria-pressed={active}
      className={cn("pressable rounded-full p-1.5 text-tint hover:bg-fill-4", className)}
    >
      {active ? <Square className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}
