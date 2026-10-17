import { handler, json } from "@/lib/http";
import { requireUid } from "@/lib/identity";
import { progressSnapshot } from "@/lib/services/progress";

export const GET = handler(async () => {
  const uid = await requireUid();
  return json(await progressSnapshot(uid));
});
