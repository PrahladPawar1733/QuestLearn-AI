import "server-only";
import { db } from "./db";
import { newId, nowIso } from "./ids";
import type { AuditEntry } from "./types";

/**
 * Auditable record of AI workflow steps. Stores references (ids), outcome and
 * timing only. Never prompts, student text, file contents or credentials.
 */
export async function audit(entry: Omit<AuditEntry, "id" | "createdAt" | "retries"> & { retries?: number }): Promise<void> {
  const doc: AuditEntry = { ...entry, retries: entry.retries ?? 0, id: newId("aud"), createdAt: nowIso() };
  try {
    await db().set("audit", doc);
  } catch (e) {
    console.error("[audit] failed to persist", (e as Error).message);
  }
  console.info(
    JSON.stringify({ severity: entry.outcome === "error" ? "ERROR" : "INFO", component: "ai-workflow", ...doc }),
  );
}
