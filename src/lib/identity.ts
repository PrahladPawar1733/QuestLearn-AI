import "server-only";
import { cookies } from "next/headers";
import { AppError } from "./errors";

export const UID_COOKIE = "ql_uid";
const UID_RE = /^u_[a-z0-9-]{16,40}$/;

/**
 * Guest identity: an opaque random id in an httpOnly cookie, issued by
 * src/proxy.ts. No name, email or other personal data is collected.
 */
export async function currentUid(): Promise<string | null> {
  const v = (await cookies()).get(UID_COOKIE)?.value;
  return v && UID_RE.test(v) ? v : null;
}

export async function requireUid(): Promise<string> {
  const uid = await currentUid();
  if (!uid) throw new AppError("NO_SESSION", "Your guest session is missing. Please refresh the page.", 401, true);
  return uid;
}

export function isValidUid(v: string | undefined): v is string {
  return !!v && UID_RE.test(v);
}
