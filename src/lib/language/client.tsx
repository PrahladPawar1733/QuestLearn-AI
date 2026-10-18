"use client";

import { Globe, Loader2, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/**
 * Language + read-aloud on the client. Translation happens when content is shown (and is cached
 * here and on the server), so switching language never slows quest generation. English is the
 * source language and costs nothing.
 */
import { isLang, LANGUAGES, type Lang } from "./langs";

export type { Lang } from "./langs";
const KEY = "ql.lang";

/* ---------------- the chosen language (per device) ---------------- */

const listeners = new Set<() => void>();
function read(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return isLang(v) ? v : "en";
  } catch {
    return "en";
  }
}
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode: still switches for this page */
  }
  memory = l;
  listeners.forEach((f) => f());
}
let memory: Lang | null = null;
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => memory ?? read(),
    () => "en",
  );
}

/* ---------------- translated text ---------------- */

const cache = new Map<string, string>(); // `${lang}\u0000${text}` → translation

/**
 * Batching: every string requested in the same moment (a lesson's content plus all its labels)
 * goes out as ONE request, instead of one round trip per component.
 */
const queues = new Map<Lang, { texts: Set<string>; waiters: (() => void)[]; timer: ReturnType<typeof setTimeout> }>();

async function flush(lang: Lang) {
  const q = queues.get(lang);
  if (!q) return;
  queues.delete(lang);
  const texts = [...q.texts];
  try {
    for (let i = 0; i < texts.length; i += 80) {
      const chunk = texts.slice(i, i + 80);
      const r = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: chunk, target: lang }) });
      if (!r.ok) throw new Error("translate failed");
      const { texts: out } = (await r.json()) as { texts: string[] };
      chunk.forEach((t, j) => cache.set(`${lang}\u0000${t}`, out[j] ?? t));
    }
  } catch {
    // Leave them untranslated; the English stays on screen.
    texts.forEach((t) => cache.has(`${lang}\u0000${t}`) || cache.set(`${lang}\u0000${t}`, t));
  }
  q.waiters.forEach((w) => w());
}

function fetchTranslations(texts: string[], lang: Lang): Promise<void> {
  const missing = texts.filter((t) => t.trim() && !cache.has(`${lang}\u0000${t}`));
  if (!missing.length) return Promise.resolve();
  let q = queues.get(lang);
  if (!q) {
    q = { texts: new Set(), waiters: [], timer: setTimeout(() => void flush(lang), 15) };
    queues.set(lang, q);
  }
  missing.forEach((t) => q!.texts.add(t));
  return new Promise((resolve) => q!.waiters.push(resolve));
}

/**
 * Returns `texts` in the chosen language. Shows the English while a translation loads (a few
 * hundred ms the first time, instant after), and stays in English if translation fails.
 */
export function useTranslated(texts: string[]): { texts: string[]; pending: boolean } {
  const lang = useLang();
  const [, bump] = useState(0);
  const sig = texts.join("\u0001");
  const ready = lang === "en" || texts.every((t) => !t.trim() || cache.has(`${lang}\u0000${t}`));
  useEffect(() => {
    if (ready) return;
    let alive = true;
    fetchTranslations(sig.split("\u0001"), lang)
      .catch(() => undefined)
      .finally(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [sig, lang, ready]);
  const out = useMemo(() => (lang === "en" ? texts : texts.map((t) => cache.get(`${lang}\u0000${t}`) ?? t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig, lang, ready]);
  return { texts: out, pending: !ready };
}

/** Translate one string. */
export function useT(text: string): string {
  return useTranslated([text]).texts[0];
}

/* ---------------- switch ---------------- */

/** Compact language picker for game screens. Lessons and reports follow the same choice. */
export function LanguageSelect({ className, dark = false }: { className?: string; dark?: boolean }) {
  const lang = useLang();
  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-[12px] font-semibold",
        dark ? "bg-white/10 text-white" : "bg-fill-3 text-ink",
        className,
      )}
    >
      <Globe className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="sr-only">Language</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className={cn("cursor-pointer appearance-none bg-transparent pr-3 outline-none", dark ? "text-white" : "text-ink")}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="text-black">
            {l.label}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2 text-[9px] opacity-70">
        ▾
      </span>
    </label>
  );
}

/* ---------------- read aloud ---------------- */

const audioCache = new Map<string, string>(); // `${lang}\u0000${text}` → object URL
let current: HTMLAudioElement | null = null;

/** Plays `text` (already in the chosen language) with Cloud Text-to-Speech. */
export function ListenButton({ text, className, label = "Listen", dark = false }: { text: string; className?: string; label?: string; dark?: boolean }) {
  const lang = useLang();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const toggle = useCallback(async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    current?.pause(); // one voice at a time
    setState("loading");
    try {
      const key = `${lang}\u0000${text}`;
      let url = audioCache.get(key);
      if (!url) {
        const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
        if (!r.ok) throw new Error("tts failed");
        url = URL.createObjectURL(await r.blob());
        audioCache.set(key, url);
      }
      const a = new Audio(url);
      audio.current = a;
      current = a;
      a.onended = a.onpause = () => setState("idle");
      await a.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }, [state, lang, text]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state === "playing"}
      title={state === "error" ? "Couldn't play audio. Tap to try again." : undefined}
      className={cn(
        "pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold",
        dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-tint/10 text-tint hover:bg-tint/15",
        className,
      )}
    >
      {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : state === "playing" ? <Square className="size-3 fill-current" /> : <Volume2 className="size-3.5" />}
      {state === "playing" ? "Stop" : state === "error" ? "Try again" : label}
    </button>
  );
}

/** Inline translated label: <T>Worked solution</T>. */
export function T({ children }: { children: string }) {
  return <>{useT(children)}</>;
}

/** A question (text, options, concept, hint) in the chosen language. Option ids never change. */
export function useTranslatedQuestion<Q extends { text: string; options: { id: string; text: string }[]; conceptTitle?: string }>(
  q: Q | null | undefined,
  hint?: string,
): { q: Q | null | undefined; hint?: string } {
  const src = q ? [q.text, q.conceptTitle ?? "", hint ?? "", ...q.options.map((o) => o.text)] : [];
  const { texts } = useTranslated(src);
  if (!q) return { q, hint };
  return {
    q: { ...q, text: texts[0], conceptTitle: q.conceptTitle ? texts[1] : q.conceptTitle, options: q.options.map((o, i) => ({ ...o, text: texts[3 + i] })) },
    hint: hint ? texts[2] : hint,
  };
}
