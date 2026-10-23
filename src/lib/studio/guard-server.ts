import "server-only";
import { sendQueuedMail, claimQueuedMail } from "./mail-queue";
import { checkGuardProvider } from "./guard-provider";
import { randomUUID } from "crypto";
import { database, checked, StudioError } from "./server";
import {
  guardRequest,
  localGuard,
  type GuardDecision,
} from "./guard-policy";
export async function deliverParentAlert(id: string, userId: string, parentTokenHash?: string) {
  const db = database();
  const alert = checked(
    await db
      .from("studio_parent_alerts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single(),
  );
  if (alert.sent_at) return true;
  const user = await db.auth.admin.getUserById(userId);
  if (user.error) return false;
  if (!user.data.user?.email_confirmed_at || !user.data.user.email) {
    const claim = checked(await claimQueuedMail(db, id, "parent", {}, parentTokenHash ? { userId, tokenHash: parentTokenHash } : undefined));
    if (claim) checked(await db.rpc("studio_mail_finish", {
      p_id: id, p_token: claim.lease_token, p_provider_id: null, p_error: "recipient_unverified",
    }));
    return false;
  }
  if (!process.env.RESEND_API_KEY || !process.env.STUDIO_MAIL_FROM)
    return false;
  return sendQueuedMail(db, id, "parent", {
    from: process.env.STUDIO_MAIL_FROM,
    to: [user.data.user.email],
    subject: "VibeKidding: a project conversation needs your attention",
    text: "The studio paused a request or result for safety review. Please open Parent controls in your VibeKidding studio and verify your email code to review what was discussed. Your child may need support; a flag is not a judgment about them. Conversation content is not included in this email.",
  }, parentTokenHash ? { userId, tokenHash: parentTokenHash } : undefined);
}

export async function recordActivity(
  userId: string,
  projectId: string,
  role: "user" | "assistant",
  text: string,
  result: GuardDecision,
) {
  const db = database();
  const event = checked(
    await db.rpc("studio_activity_record", {
      p_user: userId,
      p_project: projectId,
      p_role: role,
      p_content: text.slice(0, 24000),
      p_decision: result.decision,
      p_categories: result.categories,
    }),
  );
  if (event.alert_id)
    await deliverParentAlert(event.alert_id, userId).catch(() => false);
}
export async function evaluateGuard(
  userId: string,
  projectId: string,
  role: "user" | "assistant",
  text: string,
) {
  const db = database();
  let result: GuardDecision | null =
    text.length > 24000
      ? { decision: "blocked", categories: ["content_too_large"] }
      : localGuard(text);
  if (!result) {
    const p = checked(
      await db
        .from("studio_profiles")
        .select("family_rules,supervised_until,safety_revision")
        .eq("id", userId)
        .single(),
    );
    if (!p.supervised_until || Date.parse(p.supervised_until) <= Date.now())
      throw new StudioError(
        "Ask your grown-up to start a supervised session.",
        403,
      );
    const rows = checked(
      await db
        .from("studio_activity")
        .select("role,content")
        .eq("user_id", userId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(6),
    );
    const key = process.env.TYPESAFE_API_KEY,
      model = process.env.TYPESAFE_MODEL;
    const budget = Number(process.env.TYPESAFE_MAX_CHECK_MICRO_USD);
    if (
      !key ||
      !model ||
      !Number.isSafeInteger(budget) ||
      budget <= 0 ||
      budget > 1000000
    )
      result = {
        decision: "unavailable",
        categories: ["guard_setup_required"],
      };
    else {
      const reservation = randomUUID();
      checked(
        await db.rpc("studio_reserve", {
          p_user: userId,
          p_id: reservation,
          p_provider: "typesafe",
          p_model: model,
          p_amount: budget,
          p_revision: p.safety_revision,
        }),
      );
      try {
        const evaluation = await checkGuardProvider(guardRequest(
          role, text, p.family_rules,
          rows.reverse().map(r => ({ ...r, content: r.content.slice(0, 1200) })), model,
        ), key);
        if (evaluation.requestId) checked(await db.from("studio_usage").update({ provider_request_id: evaluation.requestId }).eq("id", reservation).eq("user_id", userId));
        result = evaluation.result;
        // Keep the conservative reserve until verified provider usage reconciliation.
      } catch {
        result = {
          decision: "unavailable",
          categories: ["provider_unavailable"],
        };
      }
    }
  }
  await recordActivity(userId, projectId, role, text, result);
  if (result.decision !== "clear")
    throw new StudioError(
      "Let’s pause and ask your grown-up to check this together. Your parent can review the details in Parent controls.",
      403,
    );
}
