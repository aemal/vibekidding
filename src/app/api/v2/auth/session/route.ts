import { needsSetup, requireV2Session } from "@/lib/v2-auth/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return Response.json({ user: await requireV2Session(request), setupRequired: needsSetup() }, { headers: { "Cache-Control": "no-store" } });
}
