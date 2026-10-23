import { Webhook } from "svix";
import { readBoundedText } from "./request-body";
const eventTypes = ["email.delivered", "email.bounced", "email.complained", "email.failed", "email.delivery_delayed", "email.suppressed"] as const;
export type MailEvent = { id: string; providerId: string; type: typeof eventTypes[number]; occurredAt: string };
export function verifyMailEvent(raw: string, headers: Record<string, string>, secret: string): MailEvent | null {
  new Webhook(secret).verify(raw, headers);
  const body = JSON.parse(raw) as Record<string, unknown>;
  if (!body || typeof body !== "object") throw new Error("Invalid event");
  if (!eventTypes.includes(body.type as MailEvent["type"])) return null;
  const data = body.data as Record<string, unknown> | undefined;
  const id = headers["svix-id"];
  if (!id || id.length > 200 || typeof data?.email_id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(data.email_id) || typeof body.created_at !== "string" || !Number.isFinite(Date.parse(body.created_at))) throw new Error("Invalid event");
  if (Date.parse(body.created_at) > Date.now() + 300000) throw new Error("Invalid event time");
  // Discard recipients, subjects and all other provider metadata.
  return { id, providerId: data.email_id, type: body.type as MailEvent["type"], occurredAt: new Date(body.created_at).toISOString() };
}
export async function boundedWebhookBody(req: Request, limit = 65536, timeoutMs = 10000) {
  return readBoundedText(req, limit, timeoutMs);
}
