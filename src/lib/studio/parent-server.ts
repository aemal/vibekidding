import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { identity, checked, StudioError, publicAuth } from "./server";
const cookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-studio-parent"
    : "studio-parent";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function parent(req: Request) {
  const ctx = await identity(req);
  const token = (await cookies()).get(cookieName)?.value;
  if (!token)
    throw new StudioError(
      "Unlock parent controls with a fresh email code.",
      403,
    );
  const r = await ctx.db
    .from("studio_parent_sessions")
    .select("user_id,expires_at")
    .eq("token_hash", digest(token))
    .eq("user_id", ctx.user.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (r.error || !r.data)
    throw new StudioError(
      "Parent unlock expired. Please verify a new email code.",
      403,
    );
  return { ...ctx, parentTokenHash: digest(token), parentUnlockExpiresAt: r.data.expires_at };
}
export async function unlockParent(req: Request, token: string) {
  const ctx = await identity(req);
  await parentAttempt(ctx, "unlock");
  const snapshot = checked(await ctx.db.from("studio_profiles")
    .select("safety_revision").eq("id", ctx.user.id).single());
  const result = await publicAuth().auth.verifyOtp({
    email: ctx.user.email!,
    token,
    type: "email",
  });
  if (result.error || result.data.user?.id !== ctx.user.id ||
      result.data.user?.email?.toLowerCase() !== ctx.user.email?.toLowerCase())
    throw new StudioError("Invalid or expired parent code.", 401);
  const value = randomBytes(32).toString("hex");
  checked(
    await ctx.db.rpc("studio_parent_unlock", {
      p_user: ctx.user.id, p_hash: digest(value),
      p_email: ctx.user.email!, p_revision: snapshot.safety_revision,
    }),
  );
  (await cookies()).set(cookieName, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 900,
  });
}
export async function parentAttempt(ctx: Awaited<ReturnType<typeof identity>>, operation: "send-code" | "unlock") {
  const result = await ctx.db.rpc("studio_parent_attempt", { p_user: ctx.user.id, p_operation: operation });
  if (result.error)
    throw new StudioError("Parent verification limits are unavailable. Please try later.", 503);
  if (result.data !== true)
    throw new StudioError("Too many parent verification attempts. Please wait 15 minutes before trying again.", 429);
}
export async function lockParent(req: Request) {
  const ctx = await identity(req);
  const jar = await cookies(),
    token = jar.get(cookieName)?.value;
  if (token)
    checked(
      await ctx.db
        .from("studio_parent_sessions")
        .delete()
        .eq("token_hash", digest(token))
        .eq("user_id", ctx.user.id),
    );
  jar.delete(cookieName);
}
