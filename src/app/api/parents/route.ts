import {
  identity,
  body,
  checked,
  publicAuth,
  str,
  uuid,
  StudioError,
} from "@/lib/studio/server";
import { parent, unlockParent, lockParent, parentAttempt } from "@/lib/studio/parent-server";
import { baselineRules } from "@/lib/studio/guard-policy";
import { deliverParentAlert } from "@/lib/studio/guard-server";
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
async function handler(req: Request) {
  try {
    if (
      req.method === "POST" &&
      req.headers.get("origin") &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      throw new StudioError("Cross-origin request denied.", 403);
    if (req.method === "GET") {
      const c = await parent(req);
      const [profile, history, alerts, mailJobs, inventory, deletion] = await Promise.all([
        c.db
          .from("studio_profiles")
          .select("username,status,supervised_until,family_rules")
          .eq("id", c.user.id)
          .single(),
        c.db
          .from("studio_activity")
          .select("*")
          .eq("user_id", c.user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        c.db
          .from("studio_parent_alerts")
          .select("*")
          .eq("user_id", c.user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        c.db.from("studio_mail_jobs").select("id,delivery_status,status").eq("user_id", c.user.id).eq("kind", "parent").limit(100),
        c.db.rpc("studio_privacy_inventory", { p_user: c.user.id }),
        c.db.from("studio_deletion_requests").select("requested_at,content_erased_at").eq("user_id", c.user.id).maybeSingle(),
      ]);
      const delivery = new Map(checked(mailJobs).map(job => [job.id, job]));
      return json({
        parentUnlockExpiresAt: c.parentUnlockExpiresAt,
        profile: checked(profile),
        history: checked(history),
        alerts: checked(alerts).map(alert => ({ ...alert, delivery_status: delivery.get(alert.id)?.delivery_status || "unknown" })),
        baselineRules,
        email: c.user.email,
        inventory: checked(inventory),
        deletionRequestedAt: checked(deletion)?.requested_at ?? null,
        localContentErasedAt: checked(deletion)?.content_erased_at ?? null,
      });
    }
    const b = await body(req);
    if (b.operation === "send-code") {
      const c = await identity(req);
      await parentAttempt(c, "send-code");
      const r = await publicAuth().auth.signInWithOtp({
        email: c.user.email!,
        options: { shouldCreateUser: false },
      });
      if (r.error)
        throw new StudioError(
          "Could not send code. Check email settings or wait before retrying.",
          429,
        );
      return json({ ok: true });
    }
    if (b.operation === "unlock") {
      await unlockParent(req, str(b.code, 10));
      return json({ ok: true });
    }
    if (b.operation === "lock") {
      await lockParent(req);
      return json({ ok: true });
    }
    // Anyone with the account can stop a session; only a freshly verified parent can restart it.
    if (b.operation === "pause") {
      const c = await identity(req);
      checked(
        await c.db
          .from("studio_profiles")
          .update({ supervised_until: null })
          .eq("id", c.user.id),
      );
      return json({ ok: true });
    }
    const c = await parent(req);
    if (b.operation === "start") {
      if (b.present !== true)
        throw new StudioError("Confirm you will stay with your child.");
      checked(await c.db.rpc("studio_parent_control", {
        p_user: c.user.id, p_hash: c.parentTokenHash, p_operation: "start", p_rules: null,
      }));
    } else if (b.operation === "rules") {
      if (!Array.isArray(b.rules) || b.rules.length > 10)
        throw new StudioError("Use up to ten additional rules.");
      const rules = b.rules.map((r: unknown) => str(r, 400));
      checked(await c.db.rpc("studio_parent_control", {
        p_user: c.user.id, p_hash: c.parentTokenHash, p_operation: "rules", p_rules: rules,
      }));
    } else if (b.operation === "request-deletion") {
      if (b.confirmed !== true) throw new StudioError("Confirm the account deletion review request.");
      checked(await c.db.rpc("studio_parent_control", { p_user: c.user.id, p_hash: c.parentTokenHash, p_operation: "request-deletion", p_rules: null }));
    } else if (b.operation === "withdraw-consent") {
      if (b.confirmed !== true)
        throw new StudioError("Confirm that you want to stop access and public sharing.");
      checked(await c.db.rpc("studio_parent_control", { p_user: c.user.id, p_hash: c.parentTokenHash, p_operation: "withdraw-consent", p_rules: null }));
    } else if (b.operation === "clear-history") {
      checked(await c.db.rpc("studio_parent_control", { p_user: c.user.id, p_hash: c.parentTokenHash, p_operation: "clear-history", p_rules: null }));
    } else if (b.operation === "retry-alert") {
      return json({ sent: await deliverParentAlert(uuid(b.id), c.user.id, c.parentTokenHash) });
    } else throw new StudioError("Unknown action.");
    return json({ ok: true });
  } catch (e) {
    return json(
      {
        error:
          e instanceof StudioError
            ? e.message
            : "Parent controls could not complete this request.",
      },
      e instanceof StudioError ? e.status : 503,
    );
  }
}
export { handler as GET, handler as POST };
