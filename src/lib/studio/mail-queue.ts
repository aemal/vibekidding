import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { submitMail, type MailPayload } from "./mail-provider";

export type ParentMailAuthority = { userId: string; tokenHash: string };
export function claimQueuedMail(db: SupabaseClient, id: string, kind: "admin" | "parent", payload: MailPayload | Record<string, never>, authority?: ParentMailAuthority) {
  if (authority) {
    if (kind !== "parent") throw new Error("Invalid parent mail kind");
    return db.rpc("studio_parent_mail_claim", { p_user: authority.userId, p_hash: authority.tokenHash, p_id: id, p_payload: payload });
  }
  return db.rpc("studio_mail_claim", { p_id: id, p_kind: kind, p_payload: payload });
}

// The database freezes the first payload and leases each attempt across workers.
export async function sendQueuedMail(db: SupabaseClient, id: string, kind: "admin" | "parent", payload: MailPayload, authority?: ParentMailAuthority) {
  if (!process.env.RESEND_API_KEY || !process.env.STUDIO_MAIL_FROM) return false;
  const claim = await claimQueuedMail(db, id, kind, payload, authority);
  if (claim.error) throw new Error("Notification queue is unavailable.");
  if (!claim.data) return false;
  const job = claim.data;
  const { providerId, error } = await submitMail(job.payload, id, process.env.RESEND_API_KEY);
  const finished = await db.rpc("studio_mail_finish", {
    p_id: id, p_token: job.lease_token, p_provider_id: providerId, p_error: providerId ? null : error,
  });
  if (finished.error) throw new Error("Notification result could not be recorded.");
  return !!providerId && finished.data === true;
}
