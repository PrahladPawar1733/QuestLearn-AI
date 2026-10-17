/**
 * Ducking: how the gameplay mix gets out of the voice's way.
 *
 * The duck table and the hold logic live here, in `src/lib/lesson/`, because
 * `src/lib/game/audio/` is not ours to edit. The ducker applies its decisions
 * through an injected applier, so it is fully unit-testable with no
 * `AudioContext` and lands on the real mixer the moment the lead exports
 * `setBusDuck`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ## THE ONE REQUIRED CHANGE TO `src/lib/game/audio/context.ts`
 *
 * There is a real bug waiting in that file. `setBusVolume` ramps the bus gain
 * straight to the raw user pref (`context.ts:213`), and a duck would ramp the
 * *same* `AudioParam`. Two writers, one param: if a student nudges the music
 * slider while narration is playing, their slider move silently cancels the
 * duck and the voice is buried for the rest of the scene. Both paths must
 * funnel through one applier that multiplies pref × duck:
 *
 * ```ts
 * // 1. the new bus
 * export type BusName = "engine" | "sfx" | "ui" | "music" | "ambience" | "voice";
 * export const BUS_NAMES: readonly BusName[] = ["engine", "sfx", "ui", "music", "ambience", "voice"];
 * const DEFAULT_BUS_GAIN: Record<BusName, number> = { …, voice: 0.95 };
 *
 * // 2. the duck state — never persisted, never in prefs
 * const duck: Record<BusName, number> = { engine: 1, sfx: 1, ui: 1, music: 1, ambience: 1, voice: 1 };
 *
 * // 3. the single writer of a bus gain
 * function applyBus(name: BusName, seconds = VOLUME_RAMP): void {
 *   const rt = runtime;
 *   if (!rt) return;
 *   rampParam(rt.buses[name].gain, loadPrefs().buses[name] * duck[name], seconds, rt.ctx.currentTime);
 * }
 *
 * // 4. setBusVolume stops ramping directly
 * export function setBusVolume(name: BusName, v: number): void {
 *   const p = loadPrefs();
 *   p.buses[name] = clamp01(v);
 *   applyBus(name);          // was: rampParam(rt.buses[name].gain, p.buses[name], …)
 *   savePrefs();
 *   notify();
 * }
 *
 * // 5. the new export this module consumes
 * export function setBusDuck(name: BusName, factor: number, seconds: number): void {
 *   duck[name] = clamp01(factor);
 *   applyBus(name, seconds);
 * }
 * ```
 *
 * Three notes on that patch:
 *
 *  - **No prefs version bump.** `loadPrefs()` iterates `BUS_NAMES` and only
 *    overrides a default when the stored value is a number
 *    (`context.ts:76-81`), so an existing `ql.audio.prefs.v1` blob simply has
 *    no `voice` key and the 0.95 default applies. No migration, no `v2`.
 *  - **`savePrefs()` is unchanged.** A duck is transient state; persisting it
 *    would leave a student's music quiet forever after one scene.
 *  - **`rampParam`, not `smoothParam`.** `rampParam`
 *    (`src/lib/game/audio/util.ts:55-61`) anchors at the current value with
 *    `cancelScheduledValues` + `setValueAtTime` and is documented as being
 *    "for deliberate gestures" — which is exactly a duck. `smoothParam` is
 *    the every-frame tracking primitive and would fight the ramp.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** The gameplay buses narration ducks. `voice` itself is never ducked. */
export type DuckBus = "engine" | "sfx" | "ui" | "music" | "ambience";

export interface DuckSetting {
  /** Multiplier applied to the student's stored bus pref. */
  factor: number;
  /** Ramp time when the duck engages, in seconds. */
  attack: number;
  /** Ramp time when it releases, in seconds. */
  release: number;
  /** Why this number — kept with the number so it cannot drift. */
  reason: string;
}

/**
 * The duck table. Asymmetric on purpose: attack faster than release so the
 * first word is not buried, release slower so the mix does not pump back up
 * between two cues.
 */
export const NARRATION_DUCK: Record<DuckBus, DuckSetting> = {
  music: {
    factor: 0.22,
    attack: 0.18,
    release: 0.4,
    reason: "The generative bed is pure mood; it loses the most. ≈ -13 dB.",
  },
  engine: {
    factor: 0.55,
    attack: 0.25,
    release: 0.4,
    reason:
      "Never below x0.5: the engine note IS the speed cue the student steers by, driven from real rpm/load every frame. Silencing it is a gameplay change, not a mix change. Slower attack because a fast duck on a sustained tonal source pumps audibly.",
  },
  ambience: {
    factor: 0.3,
    attack: 0.18,
    release: 0.4,
    reason: "Wind bed; nothing is lost. ≈ -10.5 dB.",
  },
  sfx: {
    factor: 0.8,
    attack: 0.12,
    release: 0.25,
    reason:
      "A trim only. A muffled collision reads as a bug, not as politeness — in a physics game about collisions the crash must stay legible over the voice. ≈ -1.9 dB.",
  },
  ui: {
    factor: 1,
    attack: 0,
    release: 0,
    reason: "Taps are feedback for the student's own finger. Never duck feedback.",
  },
};

export const DUCK_BUSES = Object.keys(NARRATION_DUCK) as DuckBus[];

/**
 * How long the release waits after the last cue stops. A three-cue scene must
 * duck once, not three times, so the release only fires if nothing new has
 * started within this window.
 */
export const DUCK_RELEASE_HOLD_MS = 250;

/** The one method this module needs from the mixer. See the patch above. */
export interface BusDuckApplier {
  setBusDuck(bus: DuckBus, factor: number, seconds: number): void;
}

export interface NarrationDuckerOptions {
  holdMs?: number;
  /** Injected for tests; defaults to `setTimeout`/`clearTimeout`. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * Engages and releases the duck, with the hold that makes a multi-cue scene
 * duck exactly once.
 *
 * Every call is safe with a `null` applier — which is the state today, before
 * `setBusDuck` exists — so the React layer can construct one unconditionally
 * and the lesson is simply un-ducked rather than broken.
 */
export class NarrationDucker {
  private applier: BusDuckApplier | null;
  private holdMs: number;
  private schedule: (fn: () => void, ms: number) => unknown;
  private cancelTimer: (handle: unknown) => void;
  private pending: unknown = null;
  private engaged = false;

  constructor(applier: BusDuckApplier | null, options: NarrationDuckerOptions = {}) {
    this.applier = applier;
    this.holdMs = options.holdMs ?? DUCK_RELEASE_HOLD_MS;
    this.schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancelTimer = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get ducked(): boolean {
    return this.engaged;
  }

  /** The applier can arrive later (after the mixer exists). */
  setApplier(applier: BusDuckApplier | null): void {
    this.applier = applier;
    if (this.engaged) this.write(true);
  }

  /**
   * Duck now. Idempotent: calling it for cue 2 while cue 1's duck is still
   * engaged cancels any pending release and writes nothing new.
   */
  engage(): void {
    this.clearPending();
    if (this.engaged) return;
    this.engaged = true;
    this.write(true);
  }

  /** Release after the hold, unless {@link engage} is called again first. */
  release(): void {
    if (!this.engaged) return;
    this.clearPending();
    if (this.holdMs <= 0) {
      this.releaseNow();
      return;
    }
    this.pending = this.schedule(() => {
      this.pending = null;
      this.releaseNow();
    }, this.holdMs);
  }

  /** Release immediately — a checkpoint opening, a pause, a dispose. */
  releaseNow(): void {
    this.clearPending();
    if (!this.engaged) return;
    this.engaged = false;
    this.write(false);
  }

  dispose(): void {
    this.releaseNow();
    this.applier = null;
  }

  private clearPending(): void {
    if (this.pending === null) return;
    try {
      this.cancelTimer(this.pending);
    } catch {
      /* ignore */
    }
    this.pending = null;
  }

  private write(on: boolean): void {
    const applier = this.applier;
    if (!applier) return;
    for (const bus of DUCK_BUSES) {
      const setting = NARRATION_DUCK[bus];
      if (setting.factor === 1) continue; // `ui`: nothing to write, ever
      try {
        applier.setBusDuck(bus, on ? setting.factor : 1, on ? setting.attack : setting.release);
      } catch {
        /* a mixer that throws must not stop the lesson */
      }
    }
  }
}
