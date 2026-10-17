import { describe, expect, it } from "vitest";
import { hedged } from "../ai/client";

/** A fake model call: resolves after `ms` unless aborted. Records how it ended. */
function call(ms: number, log: string[], name: string, fail = false) {
  return (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => (fail ? (log.push(`${name} failed`), reject(new Error(name))) : (log.push(`${name} done`), resolve(name))), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        log.push(`${name} aborted`);
        reject(new Error("aborted"));
      });
    });
}

describe("hedged requests", () => {
  it("uses the backup when the first request stalls, and aborts the stalled one", async () => {
    const log: string[] = [];
    let n = 0;
    const out = await hedged((s) => (n++ === 0 ? call(1000, log, "first")(s) : call(20, log, "backup")(s)), 30, new AbortController().signal);
    expect(out).toBe("backup");
    expect(log).toEqual(["backup done", "first aborted"]);
  });

  it("never starts a backup when the first answers in time", async () => {
    let n = 0;
    const out = await hedged((s) => (n++, call(10, [], "first")(s)), 100, new AbortController().signal);
    expect(out).toBe("first");
    await new Promise((r) => setTimeout(r, 120));
    expect(n).toBe(1);
  });

  it("reports a fast failure straight away instead of waiting for the backup", async () => {
    const t0 = Date.now();
    await expect(hedged(call(5, [], "first", true), 500, new AbortController().signal)).rejects.toThrow("first");
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it("the overall timeout aborts every request in flight", async () => {
    const log: string[] = [];
    const outer = new AbortController();
    setTimeout(() => outer.abort(), 60);
    let n = 0;
    await expect(hedged((s) => call(1000, log, `r${n++}`)(s), 20, outer.signal)).rejects.toThrow("aborted");
    expect(log.sort()).toEqual(["r0 aborted", "r1 aborted"]);
  });
});
