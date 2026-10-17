import { NextResponse } from "next/server";
import { handler } from "@/lib/http";
import { requireUid, UID_COOKIE } from "@/lib/identity";
import { deleteAllUserData } from "@/lib/services/materials";

/** Deletes all uploaded material and learning data for this guest, then clears the cookie. */
export const DELETE = handler(async () => {
  const uid = await requireUid();
  await deleteAllUserData(uid);
  const res = NextResponse.json({ deleted: true });
  res.cookies.delete(UID_COOKIE);
  return res;
});
