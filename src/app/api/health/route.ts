import { publicStatus } from "@/lib/config";
import { json } from "@/lib/http";


export async function GET() {
  return json({ ok: true, service: "questlearn-ai", time: new Date().toISOString(), ...publicStatus() });
}
