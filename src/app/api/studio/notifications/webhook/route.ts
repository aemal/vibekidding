import { database, checked } from "@/lib/studio/server";
import { boundedWebhookBody, verifyMailEvent } from "@/lib/studio/mail-webhook";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured." }, { status: 503 });
  let event;
  try {
    event = verifyMailEvent(await boundedWebhookBody(req), {
      "svix-id": req.headers.get("svix-id") || "",
      "svix-timestamp": req.headers.get("svix-timestamp") || "",
      "svix-signature": req.headers.get("svix-signature") || "",
    }, secret);
  } catch {
    return Response.json({ error: "Invalid webhook." }, { status: 400 });
  }
  if (!event) return Response.json({ received: true });
  try {
    checked(await database().rpc("studio_mail_event", {
      p_id: event.id, p_provider: event.providerId, p_type: event.type, p_time: event.occurredAt,
    }));
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "Event could not be recorded." }, { status: 503 });
  }
}
