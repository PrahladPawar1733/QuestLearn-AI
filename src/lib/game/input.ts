/**
 * Unified input for every game: keyboard, on-screen touch controls, gamepad
 * and (optionally) device tilt, collapsed into one small analog state.
 *
 * Games read `poll()` once per physics step. The returned object is *mutated
 * in place* and reused, because allocating an input snapshot 120 times a
 * second is exactly the kind of garbage that causes a visible hitch mid-corner.
 */

export interface InputState {
  /** -1 (full left) .. +1 (full right). */
  steer: number;
  /** 0 .. 1 */
  throttle: number;
  /** 0 .. 1 */
  brake: number;
  handbrake: boolean;
  nitro: boolean;
  /** Rising-edge flags, cleared by `consumeActions()`. */
  lookBack: boolean;
}

export type InputSource = "keyboard" | "touch" | "gamepad" | "tilt";

export interface InputOptions {
  /** Raised on Escape / gamepad Start, so the host can open the pause menu. */
  onPause?: () => void;
  /** Raised on R / gamepad Y — respawn at the last checkpoint. */
  onRespawn?: () => void;
  /** Tells the host which control scheme to show hints for. */
  onSourceChange?: (source: InputSource) => void;
}

/** Keys we own. Everything else is left alone so the page stays usable. */
const KEY_MAP: Record<string, keyof typeof DIGITAL | undefined> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "handbrake",
  ShiftLeft: "nitro",
  ShiftRight: "nitro",
  KeyC: "lookBack",
};

const DIGITAL = { up: false, down: false, left: false, right: false, handbrake: false, nitro: false, lookBack: false };

export class InputManager {
  private readonly digital = { ...DIGITAL };
  private readonly state: InputState = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, lookBack: false };

  /** Analog values pushed by on-screen controls. null means "touch not in use". */
  private virtual: { steer: number | null; throttle: number | null; brake: number | null; handbrake: boolean; nitro: boolean } = {
    steer: null,
    throttle: null,
    brake: null,
    handbrake: false,
    nitro: false,
  };

  private tiltSteer: number | null = null;
  private gamepadIndex: number | null = null;
  private source: InputSource = "keyboard";
  private attached = false;
  /** Smoothed keyboard steering: digital keys would otherwise snap the wheel instantly. */
  private keySteer = 0;

  constructor(private readonly opts: InputOptions = {}) {}

  get activeSource() {
    return this.source;
  }

  attach(target: Window | HTMLElement = window) {
    if (this.attached || typeof window === "undefined") return;
    this.attached = true;
    target.addEventListener("keydown", this.onKeyDown as EventListener);
    target.addEventListener("keyup", this.onKeyUp as EventListener);
    window.addEventListener("blur", this.releaseAll);
    window.addEventListener("gamepadconnected", this.onGamepad as EventListener);
    window.addEventListener("gamepaddisconnected", this.onGamepadLost as EventListener);
  }

  detach(target: Window | HTMLElement = window) {
    if (!this.attached) return;
    this.attached = false;
    target.removeEventListener("keydown", this.onKeyDown as EventListener);
    target.removeEventListener("keyup", this.onKeyUp as EventListener);
    window.removeEventListener("blur", this.releaseAll);
    window.removeEventListener("gamepadconnected", this.onGamepad as EventListener);
    window.removeEventListener("gamepaddisconnected", this.onGamepadLost as EventListener);
    this.releaseAll();
  }

  /* -------------------- touch / on-screen controls -------------------- */

  /**
   * Called by the React touch overlay. Passing `null` for an axis hands
   * control back to the keyboard, so a student can use both.
   */
  setVirtual(patch: Partial<{ steer: number | null; throttle: number | null; brake: number | null; handbrake: boolean; nitro: boolean }>) {
    Object.assign(this.virtual, patch);
    if (patch.steer != null || patch.throttle != null || patch.brake != null || patch.handbrake || patch.nitro) {
      this.setSource("touch");
    }
  }

  /** Device-tilt steering, opt-in from settings. Expects a normalised -1..1. */
  setTilt(steer: number | null) {
    this.tiltSteer = steer;
    if (steer != null) this.setSource("tilt");
  }

  /* -------------------- polling -------------------- */

  poll(dt: number): InputState {
    this.pollGamepad();

    // Keyboard steering ramps toward the target instead of snapping. 6/s to
    // full lock feels responsive without being twitchy at speed.
    const keyTarget = (this.digital.left ? -1 : 0) + (this.digital.right ? 1 : 0);
    const rate = keyTarget === 0 ? 10 : 6;
    this.keySteer += (keyTarget - this.keySteer) * Math.min(1, rate * dt);
    if (Math.abs(this.keySteer) < 0.001) this.keySteer = 0;

    const s = this.state;
    // Precedence: an explicitly held analog control wins over the keyboard.
    s.steer = clamp(this.virtual.steer ?? this.tiltSteer ?? this.keySteer, -1, 1);
    s.throttle = clamp(this.virtual.throttle ?? (this.digital.up ? 1 : 0), 0, 1);
    s.brake = clamp(this.virtual.brake ?? (this.digital.down ? 1 : 0), 0, 1);
    s.handbrake = this.virtual.handbrake || this.digital.handbrake;
    s.nitro = this.virtual.nitro || this.digital.nitro;
    s.lookBack = this.digital.lookBack;
    return s;
  }

  /** Zero everything — used on pause so a held key does not keep the car moving. */
  releaseAll = () => {
    for (const k of Object.keys(this.digital) as (keyof typeof DIGITAL)[]) this.digital[k] = false;
    this.virtual = { steer: null, throttle: null, brake: null, handbrake: false, nitro: false };
    this.keySteer = 0;
    const s = this.state;
    s.steer = 0;
    s.throttle = 0;
    s.brake = 0;
    s.handbrake = false;
    s.nitro = false;
    s.lookBack = false;
  };

  /* -------------------- internals -------------------- */

  private setSource(next: InputSource) {
    if (this.source === next) return;
    this.source = next;
    this.opts.onSourceChange?.(next);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Never swallow typing in a form field (the question card has inputs).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    if (e.code === "Escape") {
      this.opts.onPause?.();
      return;
    }
    if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey) {
      this.opts.onRespawn?.();
      return;
    }
    const key = KEY_MAP[e.code];
    if (!key) return;
    // Space and arrows scroll the page otherwise, which is fatal in a racer.
    e.preventDefault();
    this.digital[key] = true;
    this.setSource("keyboard");
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = KEY_MAP[e.code];
    if (!key) return;
    e.preventDefault();
    this.digital[key] = false;
  };

  private onGamepad = (e: GamepadEvent) => {
    this.gamepadIndex = e.gamepad.index;
    this.setSource("gamepad");
  };

  private onGamepadLost = (e: GamepadEvent) => {
    if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
  };

  private pollGamepad() {
    if (this.gamepadIndex == null || typeof navigator === "undefined" || !navigator.getGamepads) return;
    const pad = navigator.getGamepads()[this.gamepadIndex];
    if (!pad) return;

    // Standard mapping: left stick X steers, RT accelerates, LT brakes.
    const stick = deadzone(pad.axes[0] ?? 0, 0.12);
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    if (Math.abs(stick) > 0 || rt > 0.05 || lt > 0.05) this.setSource("gamepad");

    if (Math.abs(stick) > 0) this.virtual.steer = stick;
    else if (this.source === "gamepad") this.virtual.steer = 0;
    if (rt > 0.05 || this.source === "gamepad") this.virtual.throttle = rt;
    if (lt > 0.05 || this.source === "gamepad") this.virtual.brake = lt;
    this.virtual.handbrake = !!pad.buttons[0]?.pressed;
    this.virtual.nitro = !!pad.buttons[1]?.pressed || !!pad.buttons[5]?.pressed;
    if (pad.buttons[9]?.pressed) this.opts.onPause?.();
    if (pad.buttons[3]?.pressed) this.opts.onRespawn?.();
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Sticks rest slightly off-centre; without a deadzone the car drifts on its own. */
function deadzone(v: number, dz: number) {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}
