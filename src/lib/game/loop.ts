/**
 * Fixed-timestep game loop.
 *
 * Physics runs at a constant 120Hz regardless of display refresh rate, and
 * rendering interpolates between the last two physics states. Without this,
 * a 144Hz laptop and a 60Hz phone would produce different handling from the
 * same inputs — unacceptable when the car's grip model is tuned by feel.
 *
 * The loop deliberately *drops* simulation time it cannot afford (see
 * `maxSubSteps`) rather than entering a death spiral where catching up costs
 * more than the frame budget it was trying to recover.
 */

export interface GameLoopOptions {
  /** Advance the simulation by exactly `dt` seconds. Called 0..maxSubSteps times per frame. */
  update: (dt: number) => void;
  /**
   * Draw a frame. `alpha` is the fraction (0..1) between the previous and
   * current physics state, for interpolating visual positions.
   */
  render: (alpha: number, frameDt: number) => void;
  /** Simulation rate. 120Hz keeps tyre forces stable at high speed. */
  fixedHz?: number;
  /**
   * Hard cap on physics steps per frame. 4 steps at 120Hz covers a 33ms
   * frame; beyond that we let the clock slip, which looks like mild slow
   * motion instead of a freeze.
   */
  maxSubSteps?: number;
  /** Pause automatically when the tab is hidden. Default true. */
  pauseWhenHidden?: boolean;
  /** Called when the loop auto-pauses so the host can show its pause UI. */
  onAutoPause?: () => void;
}

export class GameLoop {
  private readonly opts: Required<Omit<GameLoopOptions, "onAutoPause">> & Pick<GameLoopOptions, "onAutoPause">;
  private readonly step: number;
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;
  private paused = false;
  private disposed = false;

  /** Smoothed frame time in ms, exposed for the perf overlay and auto-quality. */
  private frameMs = 16.7;
  private fpsEma = 60;

  constructor(options: GameLoopOptions) {
    this.opts = {
      fixedHz: 120,
      maxSubSteps: 4,
      pauseWhenHidden: true,
      ...options,
    };
    this.step = 1 / this.opts.fixedHz;
    if (this.opts.pauseWhenHidden && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
    }
  }

  get isRunning() {
    return this.running && !this.paused;
  }

  get fps() {
    return this.fpsEma;
  }

  get frameTimeMs() {
    return this.frameMs;
  }

  start() {
    if (this.disposed || this.running) return;
    this.running = true;
    this.paused = false;
    this.last = now();
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  /**
   * Stop advancing time. The accumulator is cleared on resume, not here, so
   * a long pause (a student reading a question for a minute) cannot be
   * "caught up" into a burst of simulation.
   */
  pause() {
    this.paused = true;
  }

  resume() {
    if (this.disposed || !this.running || !this.paused) return;
    this.paused = false;
    this.last = now();
    this.accumulator = 0;
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    this.disposed = true;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
  }

  private onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.hidden && this.isRunning) {
      this.pause();
      this.opts.onAutoPause?.();
    }
  };

  private tick = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const t = now();
    let frameDt = (t - this.last) / 1000;
    this.last = t;

    // A tab that was backgrounded, or a long main-thread stall, can report a
    // multi-second delta. Clamp it: we would rather lose time than teleport.
    if (frameDt > 0.25) frameDt = 0.25;

    // Exponential moving average: stable enough to drive auto-quality without
    // reacting to a single hitched frame.
    const instMs = frameDt * 1000;
    this.frameMs += (instMs - this.frameMs) * 0.1;
    if (instMs > 0) this.fpsEma += (1000 / instMs - this.fpsEma) * 0.1;

    if (this.paused) {
      // Still render so the paused scene stays on screen and resizes correctly.
      this.opts.render(1, frameDt);
      return;
    }

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.opts.maxSubSteps) {
      this.opts.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    // Discard unaffordable backlog so a slow device degrades smoothly.
    if (this.accumulator > this.step * this.opts.maxSubSteps) this.accumulator = 0;

    this.opts.render(this.accumulator / this.step, frameDt);
  };
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
