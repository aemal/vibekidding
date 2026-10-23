import "server-only";
import { readStudioBody, RequestBodyError } from "./request-body";
import { schemaReady } from "./schema-status";
import { sendQueuedMail } from "./mail-queue";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export class StudioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new StudioError(
      "Studio setup is required: Supabase is not configured.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function publicAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new StudioError("Supabase sign-in is not configured.", 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function adminId(id: string) {
  return (process.env.STUDIO_ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .includes(id);
}
export async function identity(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new StudioError("Please sign in.", 401);
  const db = database();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at)
    throw new StudioError("Verified sign-in required.", 401);
  return { db, user: data.user, admin: adminId(data.user.id) };
}
export async function approved(req: Request) {
  const ctx = await identity(req);
  const { data: p, error } = await ctx.db
    .from("studio_profiles")
    .select("*")
    .eq("id", ctx.user.id)
    .single();
  if (
    error ||
    !p ||
    p.status !== "approved" ||
    p.email !== ctx.user.email ||
    !p.email_verified_at ||
    !p.consent_reference
  )
    throw new StudioError(
      "Email verification and guardian/admin approval are required.",
      403,
    );
  if (process.env.STUDIO_CHILD_SAFETY_APPROVED !== "true")
    throw new StudioError(
      "Child privacy and provider consent review must be completed before studio access.",
      503,
    );
  if (!p.supervised_until || Date.parse(p.supervised_until) <= Date.now())
    throw new StudioError(
      "Ask your grown-up to start a supervised session in Parent controls.",
      403,
    );
  const schema = await ctx.db.rpc("studio_schema_status");
  if (schema.error || !schemaReady(schema.data))
    throw new StudioError("Studio database safety setup needs administrator review.", 503);
  return { ...ctx, profile: p };
}
export async function administrator(req: Request) {
  const ctx = await identity(req);
  if (!ctx.admin) throw new StudioError("Admin access required.", 403);
  return ctx;
}
export async function body(req: Request) {
  try {
    return await readStudioBody(req);
  } catch (error) {
    if (error instanceof RequestBodyError)
      throw new StudioError(error.message, error.status);
    throw error;
  }
}
export function str(value: unknown, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new StudioError("Invalid text.");
  return value.trim();
}
export function uuid(value: unknown) {
  const s = str(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s,
    )
  )
    throw new StudioError("Invalid identifier.");
  return s;
}
export function checked<T>(result: {
  data: T;
  error: unknown;
}): NonNullable<T> {
  if (result.error)
    throw new StudioError(
      "The database operation was rejected. Check permissions, limits, and setup.",
      409,
    );
  return result.data as NonNullable<T>;
}
export function ai() {
  if (!process.env.OPENAI_API_KEY)
    throw new StudioError("OpenAI is not configured.", 503);
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 45000,
  });
}
export async function notify(userId: string, kind: "signup" | "credits") {
  const db = database();
  const row = await db
    .from("studio_outbox")
    .upsert(
      { user_id: userId, kind, day: new Date().toISOString().slice(0, 10) },
      { onConflict: "user_id,kind,day", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  checked(row);
  // Durable outbox survives a missing mail provider or delivery failure. Admin can retry.
  if (row.data) await deliver(row.data.id).catch(() => false);
}
export async function deliver(id: string) {
  const db = database();
  const row = checked(
    await db.from("studio_outbox").select("*").eq("id", id).single(),
  );
  if (row.sent_at) return true;
  if (!process.env.RESEND_API_KEY || !process.env.STUDIO_MAIL_FROM)
    return false;
  return sendQueuedMail(db, id, "admin", {
    from: process.env.STUDIO_MAIL_FROM,
    to: ["a@aemalsayer.com"],
    subject: row.kind === "signup" ? "VibeKidding: guardian approval requested" : "VibeKidding: more credits requested",
    text: `An account needs review. User ID: ${row.user_id}. Open your VibeKidding admin panel. No action was automatically approved.`,
  });
}
