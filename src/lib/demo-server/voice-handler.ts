import { demoAccessError, publicTemplateDemo, type DemoEnvironment } from "./access";
import { readBoundedText, RequestBodyError } from "../studio/request-body";
import { validVoiceAgentId, voiceConfigErrors, VOICE_LIMITS } from "./voice-config";
import { validateVoiceSignedUrl, voiceProviderRequest } from "./voice-provider";

export class VoiceIssuanceLimit {
  private active = false;
  private attempts = 0;
  private nextAllowed = 0;
  admit(now = Date.now()) {
    if (this.active || this.attempts >= 3 || now < this.nextAllowed) return false;
    this.active = true; this.attempts++; this.nextAllowed = now + 60000;
    return true;
  }
  finish() { this.active = false; }
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function denied(request: Request, env: DemoEnvironment) {
  if (publicTemplateDemo(env) || env.NODE_ENV === "production" || env.VIBEKIDDING_SAMANTHA_DEMO_ENABLED !== "1") return "Local Samantha voice is disabled.";
  return demoAccessError(request, env);
}
function configured(env: DemoEnvironment) {
  return !!env.VIBEKIDDING_SAMANTHA_API_KEY?.trim() && validVoiceAgentId(env.VIBEKIDDING_SAMANTHA_AGENT_ID);
}
export function createVoiceHandlers(options: { environment?: () => DemoEnvironment; fetcher?: typeof fetch; usage?: VoiceIssuanceLimit; accessError?: (request: Request, env: DemoEnvironment) => string | null } = {}) {
  const environment = options.environment ?? (() => process.env), fetcher = options.fetcher ?? fetch, usage = options.usage ?? new VoiceIssuanceLimit();
  const accessError = options.accessError ?? denied;
  return {
    async GET(request: Request) {
      const env = environment(), reason = accessError(request, env);
      return json({ enabled: !reason, localOnly: true, configured: !reason && configured(env), ...VOICE_LIMITS,
        message: reason ?? (configured(env) ? "Local voice configured. Provider settings are verified when you explicitly start. Speech is processed by ElevenLabs." : "Dedicated Samantha demo credentials and a new reviewed agent are required.") });
    },
    async POST(request: Request) {
      const env = environment(), reason = accessError(request, env);
      if (reason) return json({ error: reason }, 403);
      if (!configured(env)) return json({ error: "Dedicated local voice configuration is missing." }, 503);
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "Send application/json." }, 415);
      try {
        const raw = await readBoundedText(request, 1024, 5000);
        let body;
        try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return json({ error: "Voice start accepts only an empty object; overrides are disabled." }, 400);
      } catch (error) { return json({ error: "Voice request could not be read." }, error instanceof RequestBodyError ? error.status : 400); }
      if (!usage.admit()) return json({ error: "Local voice start limit reached. Maximum three attempts per server process, at least one minute apart." }, 429);
      try {
        const key = env.VIBEKIDDING_SAMANTHA_API_KEY!, id = env.VIBEKIDDING_SAMANTHA_AGENT_ID!;
        const [agent, workspace] = await Promise.all([
          voiceProviderRequest(`/v1/convai/agents/${encodeURIComponent(id)}`, key, fetcher),
          voiceProviderRequest("/v1/convai/settings", key, fetcher),
        ]);
        if (agent.agent_id !== id) return json({ error: "Dedicated agent identity could not be verified." }, 503);
        const errors = voiceConfigErrors(agent, workspace);
        if (errors.length) return json({ error: "Local voice unavailable: " + errors.join(" ") }, 503);
        const query = new URLSearchParams({ agent_id: id, include_conversation_id: "true", debug_events_request: "false" });
        // Pin the immutable version returned by the provider when available.
        if (typeof agent.version_id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(agent.version_id)) query.set("version_id", agent.version_id);
        const signed = await voiceProviderRequest(`/v1/convai/conversation/get-signed-url?${query}`, key, fetcher);
        if (!validateVoiceSignedUrl(signed.signed_url, id)) return json({ error: "Voice provider returned an invalid single-use session." }, 502);
        return json({ signedUrl: signed.signed_url, maxDurationSeconds: 60, expiresInSeconds: 900 });
      } catch { return json({ error: "Voice provider is unavailable or its permissions could not be verified." }, 502); }
      finally { usage.finish(); }
    },
  };
}
