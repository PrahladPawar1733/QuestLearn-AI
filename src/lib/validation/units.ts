/**
 * Minimal dimensional analysis over mass (M), length (L), time (T).
 * Units are converted to SI so values can be compared across units.
 */
export type Dim = [number, number, number]; // [M, L, T]
export interface UnitInfo {
  factor: number; // multiply by this to get SI
  dim: Dim;
}

const ATOMS: Record<string, UnitInfo> = {
  kg: { factor: 1, dim: [1, 0, 0] },
  g: { factor: 1e-3, dim: [1, 0, 0] },
  m: { factor: 1, dim: [0, 1, 0] },
  cm: { factor: 1e-2, dim: [0, 1, 0] },
  mm: { factor: 1e-3, dim: [0, 1, 0] },
  km: { factor: 1e3, dim: [0, 1, 0] },
  s: { factor: 1, dim: [0, 0, 1] },
  ms: { factor: 1e-3, dim: [0, 0, 1] },
  min: { factor: 60, dim: [0, 0, 1] },
  h: { factor: 3600, dim: [0, 0, 1] },
  hr: { factor: 3600, dim: [0, 0, 1] },
  N: { factor: 1, dim: [1, 1, -2] },
  kN: { factor: 1e3, dim: [1, 1, -2] },
  J: { factor: 1, dim: [1, 2, -2] },
  kJ: { factor: 1e3, dim: [1, 2, -2] },
  W: { factor: 1, dim: [1, 2, -3] },
  Pa: { factor: 1, dim: [1, -1, -2] },
  rad: { factor: 1, dim: [0, 0, 0] },
  "%": { factor: 0.01, dim: [0, 0, 0] },
};

export const DIMENSIONLESS: Dim = [0, 0, 0];

const SUPERSCRIPTS: Record<string, string> = { "²": "^2", "³": "^3", "⁻¹": "^-1", "⁻²": "^-2" };

export function normalizeUnit(u: string): string {
  let s = u.trim();
  for (const [k, v] of Object.entries(SUPERSCRIPTS)) s = s.split(k).join(v);
  return s.replace(/·|⋅|\*/g, " ").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}

function parseProduct(part: string, sign: 1 | -1, acc: UnitInfo): UnitInfo {
  const tokens = part.split(" ").filter(Boolean);
  let { factor } = acc;
  const dim: Dim = [...acc.dim];
  for (const tok of tokens) {
    const m = /^([A-Za-z%]+)(?:\^(-?\d+))?$/.exec(tok);
    if (!m) throw new Error(`Unrecognized unit token "${tok}"`);
    const atom = ATOMS[m[1]];
    if (!atom) throw new Error(`Unknown unit "${m[1]}"`);
    const p = (m[2] ? Number(m[2]) : 1) * sign;
    factor *= atom.factor ** p;
    for (let i = 0; i < 3; i++) dim[i] += atom.dim[i] * p;
  }
  return { factor, dim };
}

/** Parse "kg m/s", "m/s^2", "N·s", "km/h", "" (dimensionless). Throws on unknown units. */
export function parseUnit(u: string): UnitInfo {
  const s = normalizeUnit(u);
  if (s === "" || s === "1" || s === "-") return { factor: 1, dim: [0, 0, 0] };
  const parts = s.split("/");
  if (parts.length > 2) throw new Error(`Ambiguous unit "${u}" (more than one "/")`);
  let info = parseProduct(parts[0], 1, { factor: 1, dim: [0, 0, 0] });
  if (parts[1] !== undefined) info = parseProduct(parts[1], -1, info);
  return info;
}

export function dimEqual(a: Dim, b: Dim): boolean {
  return a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
}

export function dimToString(d: Dim): string {
  const names = ["M", "L", "T"];
  const parts = d.map((p, i) => (Math.abs(p) < 1e-9 ? "" : p === 1 ? names[i] : `${names[i]}^${p}`)).filter(Boolean);
  return parts.length ? parts.join(" ") : "dimensionless";
}
