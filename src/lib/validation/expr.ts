/**
 * Safe arithmetic evaluator with dimensional analysis. No `eval`, no property
 * access, only numbers, named variables, + - * / ^, parentheses and a small
 * whitelist of functions. Every value carries its SI dimension, so adding
 * incompatible quantities (e.g. kg + m/s) is rejected.
 */
import { DIMENSIONLESS, dimAdd, dimEqual, dimScale, dimSub, dimToString, type Dim } from "./units";

export interface Quantity {
  v: number; // SI value
  d: Dim;
}

export class DimensionError extends Error {}
export class ExprError extends Error {}

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const s = src.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) {
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    if ("+-*/^(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character "${c}"`);
  }
  if (out.length > 200) throw new ExprError("Expression too long");
  return out;
}

const FUNCS: Record<string, (args: Quantity[]) => Quantity> = {
  sqrt: ([a]) => ({ v: Math.sqrt(a.v), d: dimScale(a.d, 0.5) }),
  abs: ([a]) => ({ v: Math.abs(a.v), d: a.d }),
  min: (args) => sameDims(args, "min") && { v: Math.min(...args.map((a) => a.v)), d: args[0].d },
  max: (args) => sameDims(args, "max") && { v: Math.max(...args.map((a) => a.v)), d: args[0].d },
};

function sameDims(args: Quantity[], fn: string): true {
  if (args.length === 0) throw new ExprError(`${fn}() needs arguments`);
  for (const a of args) if (!dimEqual(a.d, args[0].d)) throw new DimensionError(`${fn}() of mixed dimensions`);
  return true;
}

export function evaluate(expression: string, vars: Record<string, Quantity>): Quantity {
  const toks = tokenize(expression);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (v?: string) => {
    const t = toks[pos];
    if (!t || (v !== undefined && t.v !== v)) throw new ExprError(`Expected "${v ?? "token"}"`);
    pos++;
    return t;
  };

  function expr(): Quantity {
    let a = term();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = eat().v;
      const b = term();
      if (!dimEqual(a.d, b.d))
        throw new DimensionError(`Cannot ${op === "+" ? "add" : "subtract"} ${dimToString(a.d)} and ${dimToString(b.d)}`);
      a = { v: op === "+" ? a.v + b.v : a.v - b.v, d: a.d };
    }
    return a;
  }
  function term(): Quantity {
    let a = unary();
    while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const op = eat().v;
      const b = unary();
      // Dim arithmetic goes through units.ts: the two dims may have different
      // lengths (implicit-zero tail), so a positional map would drop exponents.
      a = op === "*" ? { v: a.v * b.v, d: dimAdd(a.d, b.d) } : { v: a.v / b.v, d: dimSub(a.d, b.d) };
    }
    return a;
  }
  function unary(): Quantity {
    if (peek()?.t === "op" && peek()!.v === "-") {
      eat();
      const a = unary();
      return { v: -a.v, d: a.d };
    }
    if (peek()?.t === "op" && peek()!.v === "+") {
      eat();
      return unary();
    }
    return power();
  }
  function power(): Quantity {
    const base = primary();
    if (peek()?.t === "op" && peek()!.v === "^") {
      eat();
      const exp = unary();
      if (!dimEqual(exp.d, DIMENSIONLESS)) throw new DimensionError("Exponent must be dimensionless");
      return { v: base.v ** exp.v, d: dimScale(base.d, exp.v) };
    }
    return base;
  }
  function primary(): Quantity {
    const t = peek();
    if (!t) throw new ExprError("Unexpected end of expression");
    if (t.t === "num") {
      eat();
      return { v: t.v, d: DIMENSIONLESS };
    }
    if (t.t === "id") {
      eat();
      if (peek()?.t === "op" && peek()!.v === "(") {
        const fn = FUNCS[t.v];
        if (!fn) throw new ExprError(`Unknown function ${t.v}`);
        eat("(");
        const args = [expr()];
        while (peek()?.v === ",") {
          eat(",");
          args.push(expr());
        }
        eat(")");
        return fn(args);
      }
      if (t.v === "pi") return { v: Math.PI, d: DIMENSIONLESS };
      const q = vars[t.v];
      if (!q) throw new ExprError(`Unknown variable "${t.v}"`);
      return q;
    }
    if (t.v === "(") {
      eat("(");
      const q = expr();
      eat(")");
      return q;
    }
    throw new ExprError(`Unexpected "${t.v}"`);
  }

  const result = expr();
  if (pos !== toks.length) throw new ExprError(`Unexpected "${toks[pos].v}"`);
  if (!Number.isFinite(result.v)) throw new ExprError("Result is not a finite number");
  return result;
}
