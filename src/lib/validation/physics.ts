/**
 * Deterministic physics reference calculations used to (a) build template
 * questions and (b) independently verify AI-generated numerical questions.
 */

/** Final velocities of a 1D collision with coefficient of restitution e. */
export function collide1D(m1: number, m2: number, u1: number, u2: number, e: number) {
  const M = m1 + m2;
  const v1 = (m1 * u1 + m2 * u2 - m2 * e * (u1 - u2)) / M;
  const v2 = (m1 * u1 + m2 * u2 + m1 * e * (u1 - u2)) / M;
  return { v1, v2 };
}

export const momentum = (m: number, v: number) => m * v;
export const kineticEnergy = (m: number, v: number) => 0.5 * m * v * v;

/** e from the bounce heights of a ball dropped onto a rigid floor. */
export const restitutionFromHeights = (h0: number, h1: number) => Math.sqrt(h1 / h0);

export interface CollisionCheckResult {
  ok: boolean;
  issues: string[];
  checks: string[];
}

/**
 * Verifies the physical invariants of a 1D two-body collision:
 * momentum conserved, kinetic energy not created, no pass-through,
 * coefficient of restitution within [0, 1].
 *
 * These are mechanics-only invariants and must stay opt-in: callers reach them
 * exclusively through a question's optional `physicsCheck` (a CollisionCheck
 * with kind "collision-1d"), never by subject or by "has a calc spec". A
 * chemistry or biology question therefore never pays the momentum/KE/e checks,
 * whose inputs (m1, u1, v1 …) would be meaningless for it.
 */
export function checkCollision(c: { m1: number; m2: number; u1: number; u2: number; v1: number; v2: number }): CollisionCheckResult {
  const issues: string[] = [];
  const checks: string[] = [];
  const pBefore = c.m1 * c.u1 + c.m2 * c.u2;
  const pAfter = c.m1 * c.v1 + c.m2 * c.v2;
  const scale = Math.max(1e-9, Math.abs(c.m1 * c.u1) + Math.abs(c.m2 * c.u2));
  if (Math.abs(pBefore - pAfter) / scale > 0.01) issues.push(`Momentum not conserved (${pBefore.toFixed(3)} → ${pAfter.toFixed(3)})`);
  else checks.push("momentum-conserved");

  const keBefore = kineticEnergy(c.m1, c.u1) + kineticEnergy(c.m2, c.u2);
  const keAfter = kineticEnergy(c.m1, c.v1) + kineticEnergy(c.m2, c.v2);
  if (keAfter > keBefore * 1.01 + 1e-9) issues.push("Kinetic energy increased in a collision without an energy source");
  else checks.push("energy-not-created");

  const approach = c.u1 - c.u2;
  if (Math.abs(approach) < 1e-12) {
    issues.push("Bodies are not approaching each other, so no collision occurs");
  } else {
    const e = (c.v2 - c.v1) / approach;
    if (e < -0.01 || e > 1.01) issues.push(`Coefficient of restitution ${e.toFixed(3)} is outside [0, 1]`);
    else checks.push("restitution-in-range");
  }
  return { ok: issues.length === 0, issues, checks };
}
