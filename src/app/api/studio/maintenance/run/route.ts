import { database, checked } from "@/lib/studio/server";
import { validWorkerToken } from "@/lib/studio/worker-auth";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!validWorkerToken(req.headers.get("authorization"), process.env.STUDIO_WORKER_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const deleted = checked(await database().rpc("studio_privacy_maintenance"));
    return Response.json({ deleted }, { headers });
  } catch {
    return Response.json({ error: "Privacy maintenance is unavailable." }, { status: 503, headers });
  }
}
