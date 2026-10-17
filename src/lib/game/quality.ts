/**
 * Graphics quality tiers and device detection.
 *
 * The goal stated in the brief is "smooth performance on ordinary student
 * devices" — in India that means a 3-4 year old mid-range Android, not a
 * flagship. So the default is chosen *pessimistically* from device hints and
 * then raised or lowered at runtime by measured frame time, rather than
 * trusting a UA string.
 */
import type { QualitySettings, QualityTier, MotionPreferences } from "./types";

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: "low",
    // 1.0 means "render at CSS pixels". On a 3x phone this is a 9x fill-rate
    // saving and is the single biggest win available.
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 0,
    drawDistance: 260,
    sceneryDensity: 0.45,
    antialias: false,
    reflections: false,
    particles: false,
    targetFps: 60,
  },
  medium: {
    tier: "medium",
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    drawDistance: 420,
    sceneryDensity: 0.75,
    antialias: true,
    reflections: false,
    particles: true,
    targetFps: 60,
  },
  high: {
    tier: "high",
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    drawDistance: 650,
    sceneryDensity: 1,
    antialias: true,
    reflections: true,
    particles: true,
    targetFps: 60,
  },
};

/**
 * Best-effort initial tier. Deliberately conservative: starting low and
 * ramping up is invisible, while starting high and stuttering for three
 * seconds is the first thing a student notices.
 */
export function detectQualityTier(): QualityTier {
  if (typeof navigator === "undefined") return "medium";

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 4;
  // deviceMemory is Chrome-only and coarse (0.25..8), but when it is present
  // and low it is a reliable signal of a budget device.
  const memory = nav.deviceMemory ?? 0;
  const coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const saveData = !!nav.connection?.saveData;

  if (saveData) return "low";
  if (memory && memory <= 2) return "low";
  if (cores <= 4 && coarsePointer) return "low";
  if (coarsePointer) return "medium";
  if (cores >= 8 && memory >= 8) return "high";
  return cores >= 8 ? "high" : "medium";
}

export function defaultMotionPreferences(): MotionPreferences {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    reducedMotion: reduced,
    // Shake and blur are the two effects students most often report as
    // uncomfortable, so reduced motion turns them off by default while
    // leaving the game fully playable.
    cameraShake: !reduced,
    motionBlur: !reduced,
    speedEffects: !reduced,
  };
}

/**
 * Runtime quality governor. Watches smoothed frame time and steps the tier
 * down when the device clearly cannot hold the target, or up when it has
 * obvious headroom. Hysteresis and a cooldown stop it oscillating.
 */
export class QualityGovernor {
  private cooldownUntil = 0;
  private belowSince = 0;
  private aboveSince = 0;

  constructor(
    private tier: QualityTier,
    private readonly onChange: (settings: QualitySettings) => void,
    /** Set false to honour an explicit student choice and stop auto-adjusting. */
    public auto = true,
  ) {}

  get current(): QualitySettings {
    return QUALITY_PRESETS[this.tier];
  }

  setTier(tier: QualityTier, fromUser: boolean) {
    if (fromUser) this.auto = false;
    if (tier === this.tier) return;
    this.tier = tier;
    this.onChange(QUALITY_PRESETS[tier]);
  }

  /** Call once per frame with the loop's smoothed fps. */
  sample(fps: number, nowMs: number) {
    if (!this.auto || nowMs < this.cooldownUntil) return;

    // 50fps is the floor where motion still reads as smooth; below it we drop.
    if (fps < 50) {
      this.aboveSince = 0;
      if (!this.belowSince) this.belowSince = nowMs;
      else if (nowMs - this.belowSince > 2500) this.stepDown(nowMs);
      return;
    }
    // Only climb when there is real headroom, and only after a sustained period.
    if (fps > 58 && this.tier !== "high") {
      this.belowSince = 0;
      if (!this.aboveSince) this.aboveSince = nowMs;
      else if (nowMs - this.aboveSince > 8000) this.stepUp(nowMs);
      return;
    }
    this.belowSince = 0;
    this.aboveSince = 0;
  }

  private stepDown(nowMs: number) {
    const next: QualityTier | null = this.tier === "high" ? "medium" : this.tier === "medium" ? "low" : null;
    this.belowSince = 0;
    if (!next) return;
    this.tier = next;
    this.cooldownUntil = nowMs + 6000;
    this.onChange(QUALITY_PRESETS[next]);
  }

  private stepUp(nowMs: number) {
    const next: QualityTier | null = this.tier === "low" ? "medium" : this.tier === "medium" ? "high" : null;
    this.aboveSince = 0;
    if (!next) return;
    this.tier = next;
    // Longer cooldown going up: if we were wrong, stepping back down costs a stutter.
    this.cooldownUntil = nowMs + 12000;
    this.onChange(QUALITY_PRESETS[next]);
  }
}

const STORAGE_KEY = "ql.game.prefs.v1";

export interface StoredGamePrefs {
  tier: QualityTier | "auto";
  audio: boolean;
  musicVolume: number;
  sfxVolume: number;
  cameraShake: boolean;
  motionBlur: boolean;
  speedEffects: boolean;
}

export const DEFAULT_GAME_PREFS: StoredGamePrefs = {
  tier: "auto",
  audio: true,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  cameraShake: true,
  motionBlur: true,
  speedEffects: true,
};

/** localStorage throws in some privacy modes, so every access is guarded. */
export function loadGamePrefs(): StoredGamePrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_GAME_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_PREFS };
    return { ...DEFAULT_GAME_PREFS, ...(JSON.parse(raw) as Partial<StoredGamePrefs>) };
  } catch {
    return { ...DEFAULT_GAME_PREFS };
  }
}

export function saveGamePrefs(prefs: StoredGamePrefs) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore: a student in private mode still gets a working game, just no memory */
  }
}
