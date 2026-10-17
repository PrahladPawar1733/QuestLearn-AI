/**
 * Dimensional analysis over the SI base dimensions this app actually needs:
 * mass (M), length (L), time (T), amount of substance (N), temperature (Θ)
 * and electric current (I). Units are converted to SI so values can be
 * compared across units.
 *
 * Representation choice: `Dim` is a plain `number[]` of exponents indexed by
 * `DIM_NAMES`, kept in a canonical form where (a) the three mechanical
 * exponents are always materialised and (b) higher exponents are dropped when
 * zero. So a purely mechanical unit is still exactly `[M, L, T]` — identical to
 * the 3-tuple this module exposed before. That matters: Dim literals are
 * written by callers and compared with deep equality in the test suite, and a
 * fixed-width 6-tuple would have silently invalidated every one of them.
 * Adding a 7th base dimension later costs one `DIM_NAMES` entry plus the atoms
 * that use it; no existing literal, comparison or test has to change. The
 * price is that Dim arithmetic must go through the helpers below rather than
 * `Array.map`, because two dims may have different lengths.
 */
export const DIM_NAMES = ["M", "L", "T", "N", "Θ", "I"] as const;
/** M, L, T are always present; exponents past this are an implicit-zero tail. */
const CORE = 3;
const EPS = 1e-9;

export type Dim = number[];

export interface UnitInfo {
  factor: number; // multiply by this to get SI
  dim: Dim;
}

/** Raised when a unit is a shifted scale (°C, °F) and so cannot be a factor. */
export class OffsetUnitError extends Error {}

const exp = (d: readonly number[], i: number) => d[i] ?? 0;

/** Trim the implicit-zero tail, pad the mechanical core. */
export function dimCanon(d: readonly number[]): Dim {
  let n = d.length;
  while (n > CORE && Math.abs(d[n - 1]) < EPS) n--;
  const out = d.slice(0, n);
  while (out.length < CORE) out.push(0);
  return out;
}

function zip(a: readonly number[], b: readonly number[], sign: 1 | -1): Dim {
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(exp(a, i) + sign * exp(b, i));
  return dimCanon(out);
}

/** Dimension of a*b. */
export const dimAdd = (a: readonly number[], b: readonly number[]): Dim => zip(a, b, 1);
/** Dimension of a/b. */
export const dimSub = (a: readonly number[], b: readonly number[]): Dim => zip(a, b, -1);
/** Dimension of a^k (k dimensionless; also used for sqrt with k = 1/2). */
export const dimScale = (d: readonly number[], k: number): Dim => dimCanon(d.map((x) => x * k));

/** Named builder so atom tables read as physics, not as positional zeros. */
function D(s: { m?: number; l?: number; t?: number; n?: number; th?: number; i?: number } = {}): Dim {
  return dimCanon([s.m ?? 0, s.l ?? 0, s.t ?? 0, s.n ?? 0, s.th ?? 0, s.i ?? 0]);
}

/**
 * Unit atoms. Compounds are built by the parser, so molar mass (`g/mol`),
 * molarity (`mol/L`), molar enthalpy (`kJ/mol`), density (`g/L`, `g/cm^3`),
 * volume (`dm^3`, `cm^3`) and torque (`N·m`) need no entries of their own.
 *
 * Lookup is case-sensitive, which is what resolves the symbol clashes:
 *  - `M` is molarity (mol/L). Mass is only ever spelled kg/g/mg as a *unit*;
 *    "M" appears as a mass *dimension* symbol in `dimToString` output, which is
 *    a dimension formula and is never fed back into the parser.
 *  - `L`/`l` is litre. Length is only ever spelled m/cm/mm/km/dm/um/nm as a
 *    unit; "L" is likewise only a dimension symbol.
 *  - `m` metre vs `M` molarity, `mm` millimetre vs `mM` millimolar, and
 *    `K` kelvin vs `k` (not a unit) therefore all stay distinct.
 *  - `C` is coulomb, never Celsius; Celsius must be written `°C`/`degC`, which
 *    is rejected on purpose (see OFFSET_UNITS).
 */
const ATOMS: Record<string, UnitInfo> = {
  // mass
  kg: { factor: 1, dim: D({ m: 1 }) },
  g: { factor: 1e-3, dim: D({ m: 1 }) },
  mg: { factor: 1e-6, dim: D({ m: 1 }) },
  // length
  m: { factor: 1, dim: D({ l: 1 }) },
  dm: { factor: 1e-1, dim: D({ l: 1 }) },
  cm: { factor: 1e-2, dim: D({ l: 1 }) },
  mm: { factor: 1e-3, dim: D({ l: 1 }) },
  um: { factor: 1e-6, dim: D({ l: 1 }) },
  nm: { factor: 1e-9, dim: D({ l: 1 }) },
  km: { factor: 1e3, dim: D({ l: 1 }) },
  // time
  s: { factor: 1, dim: D({ t: 1 }) },
  ms: { factor: 1e-3, dim: D({ t: 1 }) },
  min: { factor: 60, dim: D({ t: 1 }) },
  h: { factor: 3600, dim: D({ t: 1 }) },
  hr: { factor: 3600, dim: D({ t: 1 }) },
  // amount of substance
  mol: { factor: 1, dim: D({ n: 1 }) },
  mmol: { factor: 1e-3, dim: D({ n: 1 }) },
  // thermodynamic temperature (absolute only)
  K: { factor: 1, dim: D({ th: 1 }) },
  // electric current and its derived units
  A: { factor: 1, dim: D({ i: 1 }) },
  mA: { factor: 1e-3, dim: D({ i: 1 }) },
  C: { factor: 1, dim: D({ t: 1, i: 1 }) },
  V: { factor: 1, dim: D({ m: 1, l: 2, t: -3, i: -1 }) },
  mV: { factor: 1e-3, dim: D({ m: 1, l: 2, t: -3, i: -1 }) },
  kV: { factor: 1e3, dim: D({ m: 1, l: 2, t: -3, i: -1 }) },
  ohm: { factor: 1, dim: D({ m: 1, l: 2, t: -3, i: -2 }) },
  // volume (litre family; SI base is m^3)
  L: { factor: 1e-3, dim: D({ l: 3 }) },
  l: { factor: 1e-3, dim: D({ l: 3 }) },
  mL: { factor: 1e-6, dim: D({ l: 3 }) },
  ml: { factor: 1e-6, dim: D({ l: 3 }) },
  // molarity (amount per volume)
  M: { factor: 1e3, dim: D({ l: -3, n: 1 }) },
  mM: { factor: 1, dim: D({ l: -3, n: 1 }) },
  // force
  N: { factor: 1, dim: D({ m: 1, l: 1, t: -2 }) },
  kN: { factor: 1e3, dim: D({ m: 1, l: 1, t: -2 }) },
  // energy
  J: { factor: 1, dim: D({ m: 1, l: 2, t: -2 }) },
  kJ: { factor: 1e3, dim: D({ m: 1, l: 2, t: -2 }) },
  cal: { factor: 4.184, dim: D({ m: 1, l: 2, t: -2 }) },
  kcal: { factor: 4184, dim: D({ m: 1, l: 2, t: -2 }) },
  eV: { factor: 1.602176634e-19, dim: D({ m: 1, l: 2, t: -2 }) },
  // power
  W: { factor: 1, dim: D({ m: 1, l: 2, t: -3 }) },
  mW: { factor: 1e-3, dim: D({ m: 1, l: 2, t: -3 }) },
  kW: { factor: 1e3, dim: D({ m: 1, l: 2, t: -3 }) },
  // pressure
  Pa: { factor: 1, dim: D({ m: 1, l: -1, t: -2 }) },
  kPa: { factor: 1e3, dim: D({ m: 1, l: -1, t: -2 }) },
  MPa: { factor: 1e6, dim: D({ m: 1, l: -1, t: -2 }) },
  bar: { factor: 1e5, dim: D({ m: 1, l: -1, t: -2 }) },
  atm: { factor: 101325, dim: D({ m: 1, l: -1, t: -2 }) },
  // frequency
  Hz: { factor: 1, dim: D({ t: -1 }) },
  kHz: { factor: 1e3, dim: D({ t: -1 }) },
  MHz: { factor: 1e6, dim: D({ t: -1 }) },
  // dimensionless
  rad: { factor: 1, dim: D() },
  "%": { factor: 0.01, dim: D() },
};

/**
 * Celsius and Fahrenheit are offset (affine) scales, not scalings: 20 °C is
 * 293.15 K, not 20 K, so there is no `factor` that makes them compose inside a
 * product of units. Rather than quietly computing a wrong answer we refuse them
 * and say what to do instead. Absolute temperature (`K`) works everywhere, and
 * a temperature *difference* is numerically identical in °C and K, so "J/K" is
 * the correct spelling of a heat capacity. Authors holding Celsius data should
 * convert it with `celsiusToKelvin` before putting it in a CalcSpec variable.
 */
const OFFSET_UNITS: Record<string, string> = {
  "°C": "Celsius",
  degC: "Celsius",
  "°F": "Fahrenheit",
  degF: "Fahrenheit",
};

export const celsiusToKelvin = (c: number) => c + 273.15;
export const kelvinToCelsius = (k: number) => k - 273.15;

export const DIMENSIONLESS: Dim = D();

// Longest keys first: "⁻²" must be rewritten before "²", or it would be left
// as a stray "⁻" that no token can match.
const SUPERSCRIPTS: Record<string, string> = {
  "⁻¹": "^-1",
  "⁻²": "^-2",
  "⁻³": "^-3",
  "¹": "^1",
  "²": "^2",
  "³": "^3",
};

/** Symbols students and models type that mean an ASCII atom above. */
const ALIASES: Record<string, string> = { "Ω": "ohm", "℃": "°C", "℉": "°F", µ: "u", μ: "u" };

export function normalizeUnit(u: string): string {
  let s = u.trim();
  for (const [k, v] of Object.entries(SUPERSCRIPTS)) s = s.split(k).join(v);
  for (const [k, v] of Object.entries(ALIASES)) s = s.split(k).join(v);
  return s.replace(/·|⋅|\*/g, " ").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}

function parseProduct(part: string, sign: 1 | -1, acc: UnitInfo): UnitInfo {
  const tokens = part.split(" ").filter(Boolean);
  let { factor } = acc;
  let dim: Dim = acc.dim;
  for (const tok of tokens) {
    const m = /^([A-Za-z%°]+)(?:\^(-?\d+))?$/.exec(tok);
    if (!m) throw new Error(`Unrecognized unit token "${tok}"`);
    const scale = OFFSET_UNITS[m[1]];
    if (scale) {
      throw new OffsetUnitError(
        `${scale} ("${m[1]}") is an offset scale, not a multiple of a base unit, so it cannot be used in a calculation. Use K for an absolute temperature (0 °C = 273.15 K), or K for a temperature difference, which has the same numeric value.`,
      );
    }
    const atom = ATOMS[m[1]];
    if (!atom) throw new Error(`Unknown unit "${m[1]}"`);
    const p = (m[2] ? Number(m[2]) : 1) * sign;
    factor *= atom.factor ** p;
    dim = dimAdd(dim, dimScale(atom.dim, p));
  }
  return { factor, dim };
}

/** Parse "kg m/s", "m/s^2", "N·s", "km/h", "g/mol", "" (dimensionless). Throws on unknown units. */
export function parseUnit(u: string): UnitInfo {
  const s = normalizeUnit(u);
  if (s === "" || s === "1" || s === "-") return { factor: 1, dim: D() };
  const parts = s.split("/");
  if (parts.length > 2) throw new Error(`Ambiguous unit "${u}" (more than one "/")`);
  let info = parseProduct(parts[0], 1, { factor: 1, dim: D() });
  // Everything after the single "/" is a denominator, so "J/mol K" is J/(mol·K).
  if (parts[1] !== undefined) info = parseProduct(parts[1], -1, info);
  return info;
}

export function dimEqual(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (Math.abs(exp(a, i) - exp(b, i)) >= EPS) return false;
  }
  return true;
}

export function dimToString(d: readonly number[]): string {
  const parts = d.map((p, i) => {
    const name = DIM_NAMES[i] ?? `?${i}`;
    return Math.abs(p) < EPS ? "" : p === 1 ? name : `${name}^${p}`;
  });
  return parts.filter(Boolean).join(" ") || "dimensionless";
}
