import { database, checked, deliver } from "@/lib/studio/server";
import { deliverParentAlert } from "@/lib/studio/guard-server";
import { validWorkerToken } from "@/lib/studio/worker-auth";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!validWorkerToken(req.headers.get("authorization"), process.env.STUDIO_WORKER_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.STUDIO_MAIL_FROM) {
    return Response.json({ error: "Email provider is not configured." }, { status: 503 });
  }
  try {
    checked(await database().rpc("studio_mail_reconcile_events"));
    const rows = checked(await database().rpc("studio_mail_pending"));
    let accepted = 0;
    for (const row of rows) {
      const sent = await (row.kind === "parent" ? deliverParentAlert(row.id, row.user_id) : deliver(row.id)).catch(() => false);
      if (sent) accepted++;
    }
    checked(await database().rpc("studio_mail_reconcile_events"));
    return Response.json({ examined: rows.length, accepted }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Notification queue is unavailable." }, { status: 503 });
  }
}
