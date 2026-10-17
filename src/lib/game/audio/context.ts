"use client";

/**
 * The one shared AudioContext and its mixer.
 *
 * Shape follows `src/lib/haptics.ts`: every entry point is guarded and a no-op
 * when the capability is missing, because this is called from a 60 fps game
 * loop where a thrown error would take the whole frame down.
 *
 * Nothing here touches `window` at module load — the context is built on the
 * first call from the browser, which also satisfies the autoplay policy: the
 * context is created suspended and only `unlock()` (from a user gesture)
 * resumes it.
 */
import { clamp01, rampParam } from "./util";

export type BusName = "engine" | "sfx" | "ui" | "music" | "ambience";

export const BUS_NAMES: readonly BusName[] = ["engine", "sfx", "ui", "music", "ambience"];

/** Per-bus headroom, chosen so a full race (engine + sfx + music) cannot clip. */
const DEFAULT_BUS_GAIN: Record<BusName, number> = {
  engine: 0.6,
  sfx: 0.85,
  ui: 0.7,
  music: 0.4,
  ambience: 0.5,
};

const STORAGE_KEY = "ql.audio.prefs.v1";
/** Volume changes glide instead of stepping, otherwise the gain node zippers. */
const VOLUME_RAMP = 0.06;

export interface AudioRuntime {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly buses: Readonly<Record<BusName, GainNode>>;
}

export interface AudioPrefs {
  master: number;
  muted: boolean;
  enabled: boolean;
  buses: Record<BusName, number>;
}

export interface AudioSnapshot extends AudioPrefs {
  /** `null` until a context exists (SSR, or before the first unlock attempt). */
  state: AudioContextState | null;
  available: boolean;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

let runtime: AudioRuntime | null = null;
let prefs: AudioPrefs | null = null;
/** Sticky: once the constructor is missing or throws, stop retrying every frame. */
let unsupported = false;
const listeners = new Set<(snapshot: AudioSnapshot) => void>();

function defaultPrefs(): AudioPrefs {
  return { master: 0.8, muted: false, enabled: true, buses: { ...DEFAULT_BUS_GAIN } };
}

function loadPrefs(): AudioPrefs {
  if (prefs) return prefs;
  const next = defaultPrefs();
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
      if (typeof parsed.master === "number") next.master = clamp01(parsed.master);
      if (typeof parsed.muted === "boolean") next.muted = parsed.muted;
      if (typeof parsed.enabled === "boolean") next.enabled = parsed.enabled;
      if (parsed.buses) {
        for (const name of BUS_NAMES) {
          const v = parsed.buses[name];
          if (typeof v === "number") next.buses[name] = clamp01(v);
        }
      }
    }
  } catch {
    /* localStorage throws outright in some privacy modes; defaults are fine. */
  }
  prefs = next;
  return next;
}

function savePrefs(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadPrefs()));
  } catch {
    /* ignore */
  }
}

function resolveCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  try {
    // Even *reading* the global can throw in hardened/privacy browsers.
    const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

/** Effective master gain: mute and the global kill switch both collapse to 0. */
function masterTarget(p: AudioPrefs): number {
  return p.enabled && !p.muted ? p.master : 0;
}

/**
 * The runtime, created on first use. Returns `null` on the server, when the
 * browser has no Web Audio, or when audio is switched off — callers treat
 * `null` as "do nothing", which is what makes every play call cheap.
 */
export function getRuntime(): AudioRuntime | null {
  if (runtime) return runtime;
  if (unsupported) return null;
  const Ctor = resolveCtor();
  if (!Ctor) {
    unsupported = true;
    return null;
  }
  try {
    const p = loadPrefs();
    // `interactive` asks for the smallest buffer the device will give us; a
    // racing game is unplayable with 100 ms of output latency.
    const ctx = new Ctor({ latencyHint: "interactive" });
    const limiter = ctx.createDynamicsCompressor();
    // Soft knee well below 0 dBFS: this is a safety net that leans on the mix,
    // not a loudness maximiser. Fast attack catches collision transients.
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = masterTarget(p);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    const buses = {} as Record<BusName, GainNode>;
    for (const name of BUS_NAMES) {
      const g = ctx.createGain();
      g.gain.value = p.buses[name];
      g.connect(master);
      buses[name] = g;
    }
    runtime = { ctx, master, limiter, buses };
    try {
      ctx.addEventListener?.("statechange", notify);
    } catch {
      /* ignore */
    }
    return runtime;
  } catch {
    unsupported = true;
    return null;
  }
}

/** The bus a voice should connect to, or `null` if there is nothing to play into. */
export function getBus(name: BusName): GainNode | null {
  const rt = getRuntime();
  return rt ? rt.buses[name] : null;
}

/** True when it is worth building/driving voices at all. */
export function isAudioReady(): boolean {
  return loadPrefs().enabled && getRuntime() !== null;
}

export function isEnabled(): boolean {
  return loadPrefs().enabled;
}

/**
 * Call from a real user gesture (tap "Start race"). Creating the context is
 * allowed anywhere; *resuming* it is what the autoplay policy gates.
 */
export async function unlock(): Promise<boolean> {
  const rt = getRuntime();
  if (!rt) return false;
  try {
    if (rt.ctx.state !== "running") await rt.ctx.resume();
  } catch {
    return false;
  }
  notify();
  return rt.ctx.state === "running";
}

export function state(): AudioContextState | null {
  return runtime ? runtime.ctx.state : null;
}

export function setMasterVolume(v: number): void {
  const p = loadPrefs();
  p.master = clamp01(v);
  applyMaster();
  savePrefs();
  notify();
}

export function setBusVolume(name: BusName, v: number): void {
  const p = loadPrefs();
  p.buses[name] = clamp01(v);
  const rt = runtime;
  if (rt) rampParam(rt.buses[name].gain, p.buses[name], VOLUME_RAMP, rt.ctx.currentTime);
  savePrefs();
  notify();
}

export function mute(): void {
  setMuted(true);
}

export function unmute(): void {
  setMuted(false);
}

export function setMuted(muted: boolean): void {
  loadPrefs().muted = muted;
  applyMaster();
  savePrefs();
  notify();
}

/**
 * The global kill switch the settings UI owns. Switching off also silences the
 * master immediately, so voices that are already running stop being audible
 * without every caller having to tear them down.
 */
export function setEnabled(enabled: boolean): void {
  loadPrefs().enabled = enabled;
  applyMaster();
  savePrefs();
  notify();
}

function applyMaster(): void {
  const rt = runtime;
  if (!rt) return;
  rampParam(rt.master.gain, masterTarget(loadPrefs()), VOLUME_RAMP, rt.ctx.currentTime);
}

/** Park the context when the tab/game is hidden; cheap and reversible. */
export async function suspend(): Promise<void> {
  if (!runtime) return;
  try {
    if (runtime.ctx.state === "running") await runtime.ctx.suspend();
  } catch {
    /* ignore */
  }
  notify();
}

export async function resume(): Promise<void> {
  await unlock();
}

/** Tear everything down (route change, unmount). Safe to call twice. */
export function dispose(): void {
  const rt = runtime;
  runtime = null;
  if (!rt) return;
  try {
    rt.ctx.removeEventListener?.("statechange", notify);
  } catch {
    /* ignore */
  }
  try {
    rt.master.disconnect();
    rt.limiter.disconnect();
    for (const name of BUS_NAMES) rt.buses[name].disconnect();
  } catch {
    /* ignore */
  }
  try {
    void rt.ctx.close();
  } catch {
    /* ignore */
  }
  notify();
}

export function snapshot(): AudioSnapshot {
  const p = loadPrefs();
  return {
    master: p.master,
    muted: p.muted,
    enabled: p.enabled,
    buses: { ...p.buses },
    state: state(),
    available: runtime !== null || (!unsupported && resolveCtor() !== null),
  };
}

/** For a mixer UI; returns an unsubscribe. */
export function subscribe(fn: (snapshot: AudioSnapshot) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  if (listeners.size === 0) return;
  const snap = snapshot();
  for (const fn of listeners) {
    try {
      fn(snap);
    } catch {
      /* a broken subscriber must not break audio */
    }
  }
}

/** Test seam: forget the context and cached prefs. */
export function __resetAudioForTests(): void {
  dispose();
  prefs = null;
  unsupported = false;
  listeners.clear();
}
