/**
 * Minimal Web Audio fake. The test environment is `node`, so there is no
 * AudioContext at all; this records every node construction, connection and
 * AudioParam call so the tests can assert on the *shape* of the graph and on
 * the per-frame allocation contract.
 */

export interface ParamCall {
  method: string;
  args: number[];
}

export class FakeAudioParam {
  readonly calls: ParamCall[] = [];
  /** Counts `param.value = x` writes — the thing we forbid in a game loop. */
  directSets = 0;
  private _value: number;

  constructor(
    readonly name: string,
    initial = 0,
  ) {
    this._value = initial;
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this.directSets++;
    this._value = v;
  }

  private record(method: string, args: number[]): void {
    this.calls.push({ method, args });
  }

  setValueAtTime(v: number, t: number): this {
    this._value = v;
    this.record("setValueAtTime", [v, t]);
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this._value = v;
    this.record("linearRampToValueAtTime", [v, t]);
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this._value = v;
    this.record("exponentialRampToValueAtTime", [v, t]);
    return this;
  }

  setTargetAtTime(v: number, t: number, tau: number): this {
    this._value = v;
    this.record("setTargetAtTime", [v, t, tau]);
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.record("cancelScheduledValues", [t]);
    return this;
  }

  countOf(method: string): number {
    let n = 0;
    for (const c of this.calls) if (c.method === method) n++;
    return n;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  readonly inputs: FakeNode[] = [];
  readonly params: FakeAudioParam[] = [];
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  constructor(
    readonly kind: string,
    readonly ctx: FakeAudioContext,
  ) {}

  protected param(name: string, initial = 0): FakeAudioParam {
    const p = new FakeAudioParam(`${this.kind}.${name}`, initial);
    this.params.push(p);
    return p;
  }

  connect(dest: unknown): unknown {
    if (dest instanceof FakeNode) {
      this.outputs.push(dest);
      dest.inputs.push(this);
    } else if (dest instanceof FakeAudioParam) {
      this.ctx.paramConnections.push({ from: this, to: dest });
    }
    return dest;
  }

  disconnect(): void {
    for (const out of this.outputs) {
      const i = out.inputs.indexOf(this);
      if (i >= 0) out.inputs.splice(i, 1);
    }
    this.outputs.length = 0;
  }

  /** Total direct `.value =` writes across this node's params. */
  directSets(): number {
    let n = 0;
    for (const p of this.params) n += p.directSets;
    return n;
  }
}

class FakeGain extends FakeNode {
  readonly gain = this.param("gain", 1);
  constructor(ctx: FakeAudioContext) {
    super("gain", ctx);
  }
}

class FakeOscillator extends FakeNode {
  readonly frequency = this.param("frequency", 440);
  readonly detune = this.param("detune", 0);
  type: OscillatorType = "sine";
  constructor(ctx: FakeAudioContext) {
    super("oscillator", ctx);
  }
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
  }
}

class FakeBiquad extends FakeNode {
  readonly frequency = this.param("frequency", 350);
  readonly Q = this.param("Q", 1);
  readonly gain = this.param("gain", 0);
  type: BiquadFilterType = "lowpass";
  constructor(ctx: FakeAudioContext) {
    super("biquad", ctx);
  }
}

class FakeBufferSource extends FakeNode {
  readonly playbackRate = this.param("playbackRate", 1);
  buffer: unknown = null;
  loop = false;
  constructor(ctx: FakeAudioContext) {
    super("bufferSource", ctx);
  }
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
  }
}

class FakeCompressor extends FakeNode {
  readonly threshold = this.param("threshold", -24);
  readonly knee = this.param("knee", 30);
  readonly ratio = this.param("ratio", 12);
  readonly attack = this.param("attack", 0.003);
  readonly release = this.param("release", 0.25);
  constructor(ctx: FakeAudioContext) {
    super("compressor", ctx);
  }
}

class FakeWaveShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = "none";
  constructor(ctx: FakeAudioContext) {
    super("waveShaper", ctx);
  }
}

class FakePanner extends FakeNode {
  readonly pan = this.param("pan", 0);
  constructor(ctx: FakeAudioContext) {
    super("stereoPanner", ctx);
  }
}

export type NodeKind =
  | "gain"
  | "oscillator"
  | "biquad"
  | "bufferSource"
  | "compressor"
  | "waveShaper"
  | "stereoPanner"
  | "buffer";

export class FakeAudioContext {
  static last: FakeAudioContext | null = null;

  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState = "suspended";
  readonly destination = new FakeNode("destination", this);
  readonly nodes: FakeNode[] = [];
  readonly counts: Record<string, number> = {};
  readonly paramConnections: { from: FakeNode; to: FakeAudioParam }[] = [];
  readonly listeners = new Map<string, Set<() => void>>();
  closed = false;

  constructor(readonly options?: AudioContextOptions) {
    FakeAudioContext.last = this;
  }

  /** Total nodes/buffers constructed; the allocation counter the tests use. */
  get totalCreations(): number {
    let n = 0;
    for (const k of Object.keys(this.counts)) n += this.counts[k];
    return n;
  }

  private tally<T>(kind: NodeKind, node: T): T {
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    if (node instanceof FakeNode) this.nodes.push(node);
    return node;
  }

  createGain(): FakeGain {
    return this.tally("gain", new FakeGain(this));
  }
  createOscillator(): FakeOscillator {
    return this.tally("oscillator", new FakeOscillator(this));
  }
  createBiquadFilter(): FakeBiquad {
    return this.tally("biquad", new FakeBiquad(this));
  }
  createBufferSource(): FakeBufferSource {
    return this.tally("bufferSource", new FakeBufferSource(this));
  }
  createDynamicsCompressor(): FakeCompressor {
    return this.tally("compressor", new FakeCompressor(this));
  }
  createWaveShaper(): FakeWaveShaper {
    return this.tally("waveShaper", new FakeWaveShaper(this));
  }
  createStereoPanner(): FakePanner {
    return this.tally("stereoPanner", new FakePanner(this));
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const data: Float32Array[] = [];
    for (let i = 0; i < channels; i++) data.push(new Float32Array(length));
    return this.tally("buffer", {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (i: number) => data[i],
    });
  }

  async resume(): Promise<void> {
    this.state = "running";
    this.emit("statechange");
  }

  async suspend(): Promise<void> {
    this.state = "suspended";
    this.emit("statechange");
  }

  async close(): Promise<void> {
    this.closed = true;
    this.state = "closed";
  }

  addEventListener(type: string, fn: () => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  private emit(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }

  /** All nodes that feed `node`, transitively (for wiring assertions). */
  upstream(node: unknown): FakeNode[] {
    const out: FakeNode[] = [];
    if (!(node instanceof FakeNode)) return out;
    const seen = new Set<FakeNode>();
    const stack = [...node.inputs];
    while (stack.length) {
      const n = stack.pop() as FakeNode;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      stack.push(...n.inputs);
    }
    return out;
  }
}

interface FakeWindow {
  AudioContext: typeof FakeAudioContext;
}

const store = new Map<string, string>();

export const fakeLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get size() {
    return store.size;
  },
};

/** Install the fake globals the audio module looks for. */
export function installFakeAudio(opts: { localStorage?: boolean } = {}): void {
  FakeAudioContext.last = null;
  const g = globalThis as unknown as { window?: FakeWindow; localStorage?: unknown };
  g.window = { AudioContext: FakeAudioContext };
  if (opts.localStorage !== false) g.localStorage = fakeLocalStorage;
  else delete g.localStorage;
}

export function uninstallFakeAudio(): void {
  const g = globalThis as unknown as { window?: FakeWindow; localStorage?: unknown };
  delete g.window;
  delete g.localStorage;
  fakeLocalStorage.clear();
  FakeAudioContext.last = null;
}

/** The context the module under test created, typed for assertions. */
export function ctx(): FakeAudioContext {
  const c = FakeAudioContext.last;
  if (!c) throw new Error("no FakeAudioContext was created");
  return c;
}
