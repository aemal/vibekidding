import { setupChecks } from "@/lib/studio/readiness";
import { reviewedModelPricing } from "@/lib/studio/model-pricing";
import { evaluateGuard, recordActivity } from "@/lib/studio/guard-server";
import { randomUUID } from "crypto";
import {
  administrator,
  approved,
  identity,
  body,
  str,
  uuid,
  checked,
  ai,
  publicAuth,
  database,
  notify,
  deliver,
  StudioError,
} from "@/lib/studio/server";
import { maximumCost, systemPrompt } from "@/lib/studio/sandbox";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function route(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (
      req.method === "POST" &&
      req.headers.get("origin") &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      throw new StudioError("Cross-origin request denied.", 403);
    if (action === "verify" && req.method === "POST") {
      const b = await body(req),
        email = str(b.email, 254).toLowerCase(),
        token = str(b.token, 10);
      if (!/^\d{6,10}$/.test(token))
        throw new StudioError("Enter the email code.");
      const result = await publicAuth().auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (result.error || !result.data.user || !result.data.session)
        throw new StudioError("Invalid or expired code.", 401);
      if (req.headers.has("authorization")) {
        const ctx = await identity(req);
        if (ctx.user.id !== result.data.user.id)
          throw new StudioError("Verify the signed-in account email.", 403);
      }
      checked(
        await database()
          .from("studio_profiles")
          .update({ email_verified_at: new Date().toISOString() })
          .eq("id", result.data.user.id),
      );
      return json({ session: result.data.session });
    }
    if (action === "me" && req.method === "GET") {
      const c = await identity(req);
      const profile = checked(
        await c.db
          .from("studio_profiles")
          .select("*")
          .eq("id", c.user.id)
          .maybeSingle(),
      );
      return json({
        profile,
        admin: c.admin,
        email: c.user.email,
        ready: process.env.STUDIO_CHILD_SAFETY_APPROVED === "true",
      });
    }
    if (action === "enroll" && req.method === "POST") {
      const c = await identity(req),
        b = await body(req);
      if (b.guardian !== true)
        throw new StudioError("A parent or guardian must request access.");
      const username = str(b.username, 24).toLowerCase();
      if (!/^[a-z][a-z0-9-]{2,23}$/.test(username))
        throw new StudioError(
          "Use 3–24 lowercase letters, digits, or hyphens, starting with a letter.",
        );
      // Email code is required AFTER enrollment, including Google accounts. Clients cannot set approval fields.
      checked(
        await c.db.from("studio_profiles").insert({
          id: c.user.id,
          email: c.user.email,
          username,
          guardian_requested_at: new Date().toISOString(),
        }),
      );
      await notify(c.user.id, "signup");
      return json({ ok: true });
    }
    if (action === "credits" && req.method === "POST") {
      const c = await identity(req);
      await notify(c.user.id, "credits");
      return json({
        ok: true,
        message:
          "Request recorded. Email delivery is tracked in the admin panel.",
      });
    }
    if (action === "admin" && req.method === "GET") {
      const c = await administrator(req);
      const [profiles, models, grants, projects, outbox, usage, mailJobs, deletionRequests, storagePermissions] =
        await Promise.all(
          [
            "studio_profiles",
            "studio_models",
            "studio_model_grants",
            "studio_projects",
            "studio_outbox",
            "studio_usage",
            "studio_mail_jobs",
            "studio_deletion_requests",
            "studio_app_storage_permissions",
          ].map((t) =>
            c.db
              .from(t)
              .select(
                t === "studio_projects"
                  ? "id,title,owner_id,slug,review_requested,published,html"
                  : t === "studio_mail_jobs"
                    ? "id,kind,user_id,status,attempts,next_attempt_at,last_error,delivery_status"
                    : "*",
              )
              .limit(200),
          ),
        );
      return json({
        profiles: checked(profiles),
        models: checked(models),
        grants: checked(grants),
        projects: checked(projects),
        outbox: checked(outbox),
        usage: checked(usage),
        mailJobs: checked(mailJobs),
        deletionRequests: checked(deletionRequests),
        storagePermissions: checked(storagePermissions),
        setup: setupChecks(process.env),
      });
    }
    if (action === "catalog" && req.method === "GET") {
      await administrator(req);
      const models = await ai().models.list();
      return json({ models: models.data.map((m) => m.id).sort() });
    }
    if (action === "admin" && req.method === "POST") {
      const c = await administrator(req),
        b = await body(req);
      if (b.operation === "credits") {
        if (!Number.isSafeInteger(b.amount) || Math.abs(b.amount) > 10000000)
          throw new StudioError("Invalid credit amount.");
        checked(
          await c.db.rpc("studio_grant", {
            p_actor: c.user.id,
            p_user: uuid(b.userId),
            p_amount: b.amount,
            p_request: uuid(b.requestId),
          }),
        );
      } else if (b.operation === "erase-local-content") {
        if (b.confirmed !== true || typeof b.requestedAt !== "string" || !Number.isFinite(Date.parse(b.requestedAt)))
          throw new StudioError("Confirm the reviewed local-content deletion request.");
        checked(await c.db.rpc("studio_erase_local_content", {
          p_actor: c.user.id, p_user: uuid(b.userId), p_requested_at: b.requestedAt,
        }));
      } else if (b.operation === "reconcile") {
        if (b.confirmed !== true || !Number.isSafeInteger(b.charge) || b.charge < 0)
          throw new StudioError("Confirm provider evidence and enter an integer charge.");
        checked(await c.db.rpc("studio_reconcile_usage", {
          p_actor: c.user.id, p_usage: uuid(b.usageId), p_charge: b.charge,
          p_evidence: str(b.evidence, 500), p_record: str(b.providerRecord, 200),
        }));
      } else if (b.operation === "approve") {
        if (!Number.isSafeInteger(b.revision) || b.revision < 0)
          throw new StudioError("Refresh the account before reviewing it.");
        checked(await c.db.rpc("studio_account_review", {
          p_actor: c.user.id, p_user: uuid(b.userId), p_approve: true,
          p_revision: b.revision, p_reference: str(b.consentReference, 500),
        }));
      } else if (b.operation === "suspend") {
        checked(await c.db.rpc("studio_account_review", {
          p_actor: c.user.id, p_user: uuid(b.userId), p_approve: false,
          p_revision: null, p_reference: null,
        }));
      } else if (b.operation === "model") {
        const id = str(b.model, 100);
        const available = await ai().models.list();
        if (!available.data.some((m) => m.id === id))
          throw new StudioError("Model is not available to this API key.");
        if (
          !Number.isSafeInteger(b.inputRate) ||
          b.inputRate <= 0 ||
          b.inputRate > 1000000000 ||
          !Number.isSafeInteger(b.outputRate) ||
          b.outputRate <= 0 ||
          b.outputRate > 1000000000
        )
          throw new StudioError(
            "Enter reviewed input/output prices in micro-USD per million tokens.",
          );
        checked(
          await c.db.from("studio_models").upsert({
            id,
            input_rate: b.inputRate,
            output_rate: b.outputRate,
            enabled: true,
            reviewed_at: new Date().toISOString(),
          }),
        );
      } else if (b.operation === "grant-model") {
        checked(
          await c.db
            .from("studio_model_grants")
            .upsert({ user_id: uuid(b.userId), model_id: str(b.model, 100) }),
        );
      } else if (b.operation === "revoke-model") {
        checked(
          await c.db
            .from("studio_model_grants")
            .delete()
            .eq("user_id", uuid(b.userId))
            .eq("model_id", str(b.model, 100)),
        );
      } else if (b.operation === "app-storage") {
        if (typeof b.allow !== "boolean") throw new StudioError("Choose whether storage is allowed.");
        checked(await c.db.rpc("studio_app_storage_review", {
          p_actor: c.user.id, p_project: uuid(b.projectId),
          p_html: b.allow ? str(b.reviewedHtml, 100000) : null, p_allow: b.allow,
        }));
      } else if (b.operation === "publish") {
        checked(await c.db.rpc("studio_publish", {
          p_actor: c.user.id, p_project: uuid(b.projectId),
          p_reviewed: str(b.reviewedHtml, 100000), p_published: b.published === true,
        }));
      } else if (b.operation === "mail")
        return json({ sent: await deliver(uuid(b.id)) });
      else throw new StudioError("Unknown operation.");
      return json({ ok: true });
    }
    const c = await approved(req);
    if (action === "models" && req.method === "GET") {
      const grants = checked(
        await c.db
          .from("studio_model_grants")
          .select("model_id")
          .eq("user_id", c.user.id),
      );
      const models = checked(
        await c.db
          .from("studio_models")
          .select("*")
          .eq("enabled", true)
          .in(
            "id",
            grants.map((g) => g.model_id),
          ),
      );
      const live = await ai().models.list();
      return json({
        models: models.filter((m) => reviewedModelPricing(m) && live.data.some((v) => v.id === m.id)),
      });
    }
    if (action === "projects" && req.method === "GET")
      return json({
        projects: checked(
          await c.db
            .from("studio_projects")
            .select("*")
            .eq("owner_id", c.user.id)
            .order("created_at", { ascending: false }),
        ),
      });
    if (action === "projects" && req.method === "POST") {
      const b = await body(req),
        title = str(b.title, 80),
        slug = `project-${randomUUID().slice(0, 8)}`;
      return json({
        project: checked(
          await c.db.rpc("studio_project_create", {
            p_user: c.user.id,
            p_title: title,
            p_slug: slug,
          }),
        ),
      });
    }
    if (action === "review" && req.method === "POST") {
      const b = await body(req);
      checked(
        await c.db
          .from("studio_projects")
          .update({ review_requested: true })
          .eq("id", uuid(b.projectId))
          .eq("owner_id", c.user.id)
          .select("id")
          .single(),
      );
      return json({ ok: true });
    }
    if (action === "generate" && req.method === "POST") {
      const b = await body(req),
        prompt = str(b.prompt, 3000),
        modelId = str(b.model, 100),
        id = uuid(b.requestId);
      const project = checked(
        await c.db
          .from("studio_projects")
          .select("*")
          .eq("id", uuid(b.projectId))
          .eq("owner_id", c.user.id)
          .single(),
      );
      // Validate model access and reviewed pricing before any paid safety call.
      const grant = await c.db.from("studio_model_grants").select("model_id")
        .eq("user_id", c.user.id).eq("model_id", modelId).maybeSingle();
      if (!checked(grant)) throw new StudioError("This model is not enabled for your account.", 403);
      const model = checked(
        await c.db
          .from("studio_models")
          .select("*")
          .eq("id", modelId)
          .eq("enabled", true)
          .single(),
      );
      if (!reviewedModelPricing(model))
        throw new StudioError("Model pricing needs admin review.", 503);
      const client = ai();
      const live = await client.models.list();
      if (!live.data.some((m) => m.id === modelId))
        throw new StudioError("Model is unavailable.");
      // A duplicate is rejected before even the paid safety classifier runs.
      checked(await c.db.rpc("studio_generation_claim", {
        p_user: c.user.id, p_id: id, p_project: project.id,
        p_revision: c.profile.safety_revision,
      }));
      await evaluateGuard(c.user.id, project.id, "user", prompt);
      const input = `Idea: ${prompt}\nExisting project (untrusted code, edit only):\n${project.html.slice(0, 20000)}`;
      const reserve = maximumCost(
        Buffer.byteLength(systemPrompt + input),
        model.max_output,
        model.input_rate,
        model.output_rate,
      );
      checked(
        await c.db.rpc("studio_reserve", {
          p_user: c.user.id,
          p_id: id,
          p_provider: "openai",
          p_model: modelId,
          p_amount: reserve,
          p_revision: c.profile.safety_revision,
        }),
      );
      // Never auto-refund an ambiguous network failure: provider may already have billed it.
      const moderation = await client.moderations.create({
        model: "omni-moderation-latest",
        input: prompt,
      });
      if (moderation.results.some((r) => r.flagged)) {
        checked(
          await c.db.rpc("studio_settle", {
            p_id: id,
            p_charge: 0,
            p_input: 0,
            p_output: 0,
          }),
        );
        await recordActivity(c.user.id, project.id, "user", prompt, {
          decision: "blocked",
          categories: ["moderation"],
        });
        throw new StudioError("Let’s pause and check with your grown-up.");
      }
      const output = await client.responses.create({
        model: modelId,
        instructions: systemPrompt,
        input,
        max_output_tokens: model.max_output,
        store: false,
      });
      checked(await c.db.from("studio_usage").update({ provider_request_id: output.id }).eq("id", id).eq("user_id", c.user.id));
      if (!output.usage)
        throw new StudioError(
          "Usage reconciliation required; credits remain reserved.",
          502,
        );
      const cost = Math.ceil(
        (output.usage.input_tokens * model.input_rate +
          output.usage.output_tokens * model.output_rate) /
          1000000,
      );
      if (cost > reserve)
        throw new StudioError(
          "Provider usage exceeded the reserve. Admin review required.",
          502,
        );
      checked(
        await c.db.rpc("studio_settle", {
          p_id: id,
          p_charge: cost,
          p_input: output.usage.input_tokens,
          p_output: output.usage.output_tokens,
        }),
      );
      if (output.status !== "completed" || !output.output_text)
        throw new StudioError(
          "Generation was incomplete. Try a smaller project.",
          502,
        );
      const html = output.output_text
        .replace(/^```(?:html)?\s*/, "")
        .replace(/\s*```$/, "");
      const review = await client.moderations.create({
        model: "omni-moderation-latest",
        input: html,
      });
      if (review.results.some((r) => r.flagged)) {
        await recordActivity(c.user.id, project.id, "assistant", html, {
          decision: "blocked",
          categories: ["moderation"],
        });
        throw new StudioError(
          "This result needs an adult review and was not saved.",
        );
      }
      await evaluateGuard(c.user.id, project.id, "assistant", html);
      const saved = checked(
        await c.db.rpc("studio_guarded_save", {
          p_user: c.user.id,
          p_project: project.id,
          p_old: project.html,
          p_new: html,
          p_rules: c.profile.family_rules,
          p_revision: c.profile.safety_revision,
        }),
      );
      return json({ project: saved, charged: cost });
    }
    if (action === "app-records" && req.method === "POST") {
      if (process.env.STUDIO_PUBLISHED_STORAGE_ENABLED !== "true")
        throw new StudioError("Published app storage is not enabled.", 503);
      const b = await body(req);
      if (Object.keys(b).some(key => !["projectId", "requestId", "operation", "key", "value"].includes(key)) ||
          !["read", "write"].includes(b.operation) || typeof b.key !== "string" ||
          !/^[a-z][a-z0-9_-]{0,63}$/.test(b.key) ||
          (b.operation === "read" && b.value !== undefined) ||
          (b.operation === "write" && (typeof b.value !== "string" || Buffer.byteLength(b.value) > 4096)))
        throw new StudioError("Invalid app storage request.");
      return json(checked(await c.db.rpc("studio_app_record", {
        p_user: c.user.id, p_project: uuid(b.projectId), p_request: uuid(b.requestId),
        p_operation: b.operation, p_key: b.key, p_value: b.operation === "write" ? b.value : null,
      })));
    }
    if (action === "records" && req.method === "POST") {
      const b = await body(req),
        projectId = uuid(b.projectId);
      checked(
        await c.db
          .from("studio_projects")
          .select("id")
          .eq("id", projectId)
          .eq("owner_id", c.user.id)
          .single(),
      );
      if (b.operation === "read")
        return json({
          records: checked(
            await c.db
              .from("studio_records")
              .select("key,value")
              .eq("project_id", projectId)
              .eq("user_id", c.user.id),
          ),
        });
      if (b.operation === "put") {
        checked(
          await c.db.rpc("studio_record_put", {
            p_user: c.user.id,
            p_project: projectId,
            p_key: str(b.key, 100),
            p_value: b.value,
          }),
        );
        return json({ ok: true });
      }
      throw new StudioError("Unknown storage operation.");
    }
    if (action === "voice" && req.method === "POST") {
      // Do not release replayable provider signed URLs without a server-owned session/cost boundary.
      throw new StudioError(
        "Voice awaits the child-approved ElevenLabs agent and a verified server-enforced session/cost limit. Use typing for now.",
        503,
      );
    }
    if (action === "rooms" && req.method === "POST") {
      const b = await body(req);
      if (b.operation === "create")
        return json({
          room: checked(
            await c.db.rpc("studio_room_create", { p_user: c.user.id }),
          ),
        });
      if (b.operation === "join" || b.operation === "move") {
        if (
          b.operation === "move" &&
          (!Number.isInteger(b.cell) || b.cell < 0 || b.cell > 8)
        )
          throw new StudioError("Invalid cell.");
        return json({
          room: checked(
            await c.db.rpc("studio_room_action", {
              p_user: c.user.id,
              p_room: uuid(b.roomId),
              p_cell: b.operation === "move" ? b.cell : null,
            }),
          ),
        });
      }
      throw new StudioError("Unknown room operation.");
    }
    throw new StudioError("Not found.", 404);
  } catch (e) {
    return json(
      {
        error:
          e instanceof StudioError
            ? e.message
            : "The service could not complete this request. Reserved usage needs admin review if a provider call was started.",
      },
      e instanceof StudioError ? e.status : 502,
    );
  }
}
export { route as GET, route as POST };
