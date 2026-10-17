/**
 * Unit/dimension coverage for the widened dimension system (M, L, T, N, Θ, I).
 * The physics assertions at the bottom are ported from
 * src/lib/__tests__/validation.test.ts on purpose: they are the regression gate
 * proving the 3-tuple era behaviour is byte-identical after the widening.
 */
import { describe, expect, it } from "vitest";
import { DimensionError, evaluate } from "../expr";
import {
  celsiusToKelvin,
  DIMENSIONLESS,
  dimAdd,
  dimEqual,
  dimScale,
  dimSub,
  dimToString,
  kelvinToCelsius,
  OffsetUnitError,
  parseUnit,
} from "../units";

// Exponent slots, for readable expectations: [M, L, T, N, Θ, I] with the
// all-zero tail past T omitted (see the canonical form note in units.ts).
describe("dimension representation", () => {
  it("keeps purely mechanical dimensions as a bare [M, L, T] triple", () => {
    expect(parseUnit("kg").dim).toEqual([1, 0, 0]);
    expect(parseUnit("m/s").dim).toEqual([0, 1, -1]);
    expect(parseUnit("J").dim).toEqual([1, 2, -2]);
    expect(DIMENSIONLESS).toEqual([0, 0, 0]);
  });

  it("materialises higher slots only when they are used", () => {
    expect(parseUnit("mol").dim).toEqual([0, 0, 0, 1]);
    expect(parseUnit("K").dim).toEqual([0, 0, 0, 0, 1]);
    expect(parseUnit("A").dim).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("adds, subtracts and scales dims of different lengths without losing exponents", () => {
    expect(dimAdd([1, 0, 0], [0, 0, 0, -1])).toEqual([1, 0, 0, -1]); // kg * mol^-1
    expect(dimSub([1, 0, 0], [1, 0, 0, -1])).toEqual([0, 0, 0, 1]); // kg / (kg/mol) = mol
    expect(dimSub([0, 0, 0, 1], [0, 0, 0, 1])).toEqual([0, 0, 0]); // cancels back to a triple
    expect(dimScale([0, 0, 0, 0, 2], 0.5)).toEqual([0, 0, 0, 0, 1]);
  });

  it("compares short and long dims by treating the missing tail as zero", () => {
    expect(dimEqual([1, 0, 0], [1, 0, 0, 0, 0, 0])).toBe(true);
    expect(dimEqual([1, 0, 0], [1, 0, 0, 1])).toBe(false);
  });

  it("names the new dimensions when reporting", () => {
    expect(dimToString(parseUnit("mol").dim)).toBe("N");
    expect(dimToString(parseUnit("K").dim)).toBe("Θ");
    expect(dimToString(parseUnit("A").dim)).toBe("I");
    expect(dimToString(parseUnit("g/mol").dim)).toBe("M N^-1");
    expect(dimToString(DIMENSIONLESS)).toBe("dimensionless");
  });
});

describe("chemistry and biology units", () => {
  it("parses amount of substance", () => {
    expect(parseUnit("mol")).toEqual({ factor: 1, dim: [0, 0, 0, 1] });
    expect(parseUnit("mmol")).toEqual({ factor: 1e-3, dim: [0, 0, 0, 1] });
  });

  it("parses molar mass and molar energies", () => {
    expect(parseUnit("g/mol")).toEqual({ factor: 1e-3, dim: [1, 0, 0, -1] });
    expect(parseUnit("kg/mol")).toEqual({ factor: 1, dim: [1, 0, 0, -1] });
    expect(parseUnit("J/mol")).toEqual({ factor: 1, dim: [1, 2, -2, -1] });
    expect(parseUnit("kJ/mol")).toEqual({ factor: 1e3, dim: [1, 2, -2, -1] });
  });

  it("parses volumes, with the litre family folding onto m^3", () => {
    expect(parseUnit("L")).toEqual({ factor: 1e-3, dim: [0, 3, 0] });
    expect(parseUnit("l").factor).toBe(1e-3);
    expect(parseUnit("mL").factor).toBeCloseTo(1e-6, 12);
    expect(parseUnit("ml").factor).toBeCloseTo(1e-6, 12);
    expect(parseUnit("dm^3").factor).toBeCloseTo(1e-3, 12);
    expect(parseUnit("dm^3").dim).toEqual([0, 3, 0]);
    expect(parseUnit("cm^3").factor).toBeCloseTo(1e-6, 12);
    expect(parseUnit("m^3").factor).toBe(1);
  });

  it("parses molarity, in both spellings, to the same SI quantity", () => {
    const molar = parseUnit("mol/L");
    expect(molar.dim).toEqual([0, -3, 0, 1]);
    expect(molar.factor).toBeCloseTo(1e3, 9);
    expect(parseUnit("M")).toEqual(molar);
    expect(parseUnit("mol/dm^3").dim).toEqual(molar.dim);
    expect(parseUnit("mol/dm^3").factor).toBeCloseTo(molar.factor, 9);
    expect(parseUnit("mM").factor).toBeCloseTo(1, 9);
    expect(parseUnit("mmol/L").factor).toBeCloseTo(1, 9);
  });

  it("parses mass concentration and density", () => {
    expect(parseUnit("g/L")).toEqual({ factor: 1, dim: [1, -3, 0] });
    expect(parseUnit("mg/L").factor).toBeCloseTo(1e-3, 12);
    expect(parseUnit("g/cm^3").factor).toBeCloseTo(1e3, 9);
  });

  it("parses absolute temperature and pressures", () => {
    expect(parseUnit("K")).toEqual({ factor: 1, dim: [0, 0, 0, 0, 1] });
    expect(parseUnit("Pa").dim).toEqual([1, -1, -2]);
    expect(parseUnit("kPa").factor).toBe(1e3);
    expect(parseUnit("MPa").factor).toBe(1e6);
    expect(parseUnit("bar").factor).toBe(1e5);
    expect(parseUnit("atm").factor).toBe(101325);
    for (const u of ["kPa", "bar", "atm", "MPa"]) expect(parseUnit(u).dim).toEqual([1, -1, -2]);
  });

  it("parses the ideal-gas constant unit R = J/mol K as J/(mol·K)", () => {
    // Only one "/" is allowed, so everything after it is the denominator.
    expect(parseUnit("J/mol K").dim).toEqual([1, 2, -2, -1, -1]);
    expect(parseUnit("J/g K").factor).toBeCloseTo(1e3, 9);
    expect(() => parseUnit("J/(mol K)")).toThrow(/Unrecognized unit token/);
  });
});

describe("previously missing physics units", () => {
  it("parses electrical units", () => {
    expect(parseUnit("A").dim).toEqual([0, 0, 0, 0, 0, 1]);
    expect(parseUnit("mA").factor).toBe(1e-3);
    expect(parseUnit("C").dim).toEqual([0, 0, 1, 0, 0, 1]);
    expect(parseUnit("V").dim).toEqual([1, 2, -3, 0, 0, -1]);
    expect(parseUnit("Ω").dim).toEqual([1, 2, -3, 0, 0, -2]); // normalised to "ohm"
    expect(parseUnit("ohm").dim).toEqual(parseUnit("Ω").dim);
    // V·A = W and V/A = Ω, so the derived definitions are self-consistent.
    expect(parseUnit("V A").dim).toEqual(parseUnit("W").dim);
    expect(parseUnit("V/A").dim).toEqual(parseUnit("ohm").dim);
    expect(parseUnit("A s").dim).toEqual(parseUnit("C").dim);
  });

  it("parses power, frequency, torque and energy variants", () => {
    expect(parseUnit("W").dim).toEqual([1, 2, -3]);
    expect(parseUnit("kW").factor).toBe(1e3);
    expect(parseUnit("Hz").dim).toEqual([0, 0, -1]);
    expect(parseUnit("kHz").factor).toBe(1e3);
    expect(parseUnit("N·m").dim).toEqual(parseUnit("J").dim);
    expect(parseUnit("eV").factor).toBeCloseTo(1.602176634e-19, 25);
    expect(parseUnit("kcal").factor).toBe(4184);
    expect(parseUnit("mg").factor).toBeCloseTo(1e-6, 12);
    expect(parseUnit("nm").factor).toBe(1e-9);
    expect(parseUnit("µm").factor).toBeCloseTo(1e-6, 12); // µ normalised to "u"
  });

  it("handles negative unicode superscripts (longest-match-first)", () => {
    expect(parseUnit("m s⁻²").dim).toEqual([0, 1, -2]);
    expect(parseUnit("s⁻¹").dim).toEqual([0, 0, -1]);
    expect(parseUnit("mol dm⁻³").dim).toEqual([0, -3, 0, 1]);
  });
});

describe("deliberate symbol ambiguities", () => {
  it("reads M as molarity and L as litre, never as the mass/length dimension", () => {
    expect(parseUnit("M").dim).toEqual([0, -3, 0, 1]);
    expect(parseUnit("L").dim).toEqual([0, 3, 0]);
    // The clashing "M"/"L" symbols only ever appear in dimension formulas,
    // which are output-only and never parsed back.
    expect(dimToString(parseUnit("kg").dim)).toBe("M");
    expect(dimToString(parseUnit("m").dim)).toBe("L");
  });

  it("is case-sensitive, so lookalike units stay distinct", () => {
    expect(parseUnit("m").dim).toEqual([0, 1, 0]);
    expect(parseUnit("mm").factor).toBe(1e-3);
    expect(parseUnit("mM").dim).toEqual([0, -3, 0, 1]);
    expect(() => parseUnit("k")).toThrow(/Unknown unit "k"/);
    expect(() => parseUnit("Mol")).toThrow(/Unknown unit "Mol"/);
  });

  it("reads a bare C as coulomb, not Celsius", () => {
    expect(parseUnit("C").dim).toEqual([0, 0, 1, 0, 0, 1]);
  });
});

describe("Celsius is rejected, not mis-converted", () => {
  it("refuses °C/°F wherever they appear, with a message naming the fix", () => {
    for (const u of ["°C", "degC", "℃", "°F", "degF"]) {
      expect(() => parseUnit(u)).toThrow(OffsetUnitError);
    }
    expect(() => parseUnit("°C")).toThrow(/offset scale/);
    expect(() => parseUnit("°C")).toThrow(/273\.15/);
    // Also inside a compound, where a plausible-looking factor would be wrong.
    expect(() => parseUnit("J/g °C")).toThrow(OffsetUnitError);
  });

  it("accepts K for both absolute temperatures and differences", () => {
    expect(parseUnit("K").factor).toBe(1);
    expect(parseUnit("J/K").dim).toEqual([1, 2, -2, 0, -1]);
  });

  it("offers an explicit conversion for authors holding Celsius data", () => {
    expect(celsiusToKelvin(25)).toBeCloseTo(298.15, 9);
    expect(celsiusToKelvin(0)).toBeCloseTo(273.15, 9);
    expect(kelvinToCelsius(300)).toBeCloseTo(26.85, 9);
  });
});

describe("dimensional arithmetic over the new dimensions", () => {
  const q = (unit: string, value = 1) => {
    const u = parseUnit(unit);
    return { v: value * u.factor, d: u.dim };
  };

  it("mass / molar mass gives an amount of substance", () => {
    const r = evaluate("m/Mr", { m: q("g", 36), Mr: q("g/mol", 18) });
    expect(r.d).toEqual(parseUnit("mol").dim);
    expect(r.v / parseUnit("mol").factor).toBeCloseTo(2, 9);
  });

  it("molarity * volume gives an amount of substance", () => {
    const r = evaluate("c*V", { c: q("mol/L", 0.5), V: q("L", 2) });
    expect(r.d).toEqual(parseUnit("mol").dim);
    expect(r.v).toBeCloseTo(1, 9);
  });

  it("amount / volume gives a molarity, in M or mol/L alike", () => {
    const r = evaluate("n/V", { n: q("mol", 0.25), V: q("mL", 500) });
    expect(r.d).toEqual(parseUnit("M").dim);
    expect(r.v / parseUnit("mol/L").factor).toBeCloseTo(0.5, 9);
    expect(r.v / parseUnit("M").factor).toBeCloseTo(0.5, 9);
  });

  it("amount * molar mass gives back a mass", () => {
    const r = evaluate("n*Mr", { n: q("mol", 0.25), Mr: q("g/mol", 40) });
    expect(r.d).toEqual(parseUnit("kg").dim);
    expect(r.v / parseUnit("g").factor).toBeCloseTo(10, 9);
  });

  it("m * c * ΔT gives an energy (mass, temperature and energy composed)", () => {
    const r = evaluate("m*c*dT", { m: q("g", 100), c: q("J/g K", 4.18), dT: q("K", 20) });
    expect(r.d).toEqual(parseUnit("J").dim);
    expect(r.v / parseUnit("kJ").factor).toBeCloseTo(8.36, 9);
  });

  it("n * dH gives an energy from a molar enthalpy", () => {
    const r = evaluate("n*dH", { n: q("mol", 0.5), dH: q("kJ/mol", -286) });
    expect(r.d).toEqual(parseUnit("J").dim);
    expect(r.v / parseUnit("kJ").factor).toBeCloseTo(-143, 9);
  });

  it("still refuses to add quantities of different dimensions", () => {
    expect(() => evaluate("n + m", { n: q("mol"), m: q("kg") })).toThrow(DimensionError);
    expect(() => evaluate("T + V", { T: q("K"), V: q("L") })).toThrow(DimensionError);
    expect(() => evaluate("n + c", { n: q("mol"), c: q("mol/L") })).toThrow(DimensionError);
  });
});

describe("physics regressions (ported from src/lib/__tests__/validation.test.ts)", () => {
  it("parses compound units into SI factors and dimensions exactly as before", () => {
    expect(parseUnit("kg·m/s").dim).toEqual([1, 1, -1]);
    expect(parseUnit("N s").dim).toEqual([1, 1, -1]);
    expect(parseUnit("km/h").factor).toBeCloseTo(1 / 3.6);
    expect(parseUnit("m/s^2").dim).toEqual([0, 1, -2]);
    expect(parseUnit("").dim).toEqual([0, 0, 0]);
    expect(parseUnit("%").factor).toBe(0.01);
    expect(parseUnit("rad").dim).toEqual([0, 0, 0]);
    expect(() => parseUnit("furlong")).toThrow(/Unknown unit "furlong"/);
    expect(() => parseUnit("kg/m/s")).toThrow(/more than one/);
  });

  it("still rejects adding incompatible dimensions given raw 3-tuples", () => {
    expect(() => evaluate("m + v", { m: { v: 1, d: [1, 0, 0] }, v: { v: 1, d: [0, 1, -1] } })).toThrow(DimensionError);
  });

  it("sqrt halves every exponent, including the new slots", () => {
    expect(evaluate("sqrt(a)", { a: { v: 4, d: [2, 4, -4] } }).d).toEqual([1, 2, -2]);
    expect(evaluate("sqrt(a)", { a: { v: 4, d: [0, 0, 0, 0, 2] } }).d).toEqual([0, 0, 0, 0, 1]);
  });
});
