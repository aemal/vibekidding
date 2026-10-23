import { readBoundedText, RequestBodyError } from "../studio/request-body";
import { demoAccessError, DEMO_LIMITS, DemoUsage, publicTemplateDemo, type DemoEnvironment } from "./access";
import { configuredProvider, generateWithProvider, projectTitle } from "./provider";
import { templateProject } from "./template";

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

export function createDemoHandlers(options: {
  environment?: () => DemoEnvironment;
  usage?: DemoUsage;
  fetcher?: typeof fetch;
} = {}) {
  const environment = options.environment ?? (() => process.env);
  const usage = options.usage ?? new DemoUsage();
  // Do not repeatedly bill or retry a broken provider during this local process.
  let providerUnavailable = false;
  let providerVerified = false;
  return {
    async GET(request: Request) {
      const env = environment();
      const denied = demoAccessError(request, env);
      if (denied) return response({ error: denied, enabled: false }, 403);
      const isPublic = publicTemplateDemo(env);
      const provider = isPublic ? "template" : configuredProvider(env);
      const aiConfigured = provider !== "template";
      const aiAvailable = aiConfigured && !providerUnavailable && usage.remainingProviderCalls() > 0;
      return response({
        enabled: true, localOnly: !isPublic, publicTemplateOnly: isPublic, provider, mode: aiAvailable ? "ai" : "template",
        aiConfigured, providerVerified: !isPublic && providerVerified && !providerUnavailable,
        message: isPublic ? "Public template-only demo. No AI provider is called and projects are not stored on the server." : aiAvailable ? "AI credentials are configured but availability is checked only when generating. A labeled template is used on failure." : "Offline templates are available. AI is not available in this demo process.",
        limits: DEMO_LIMITS, providerCallsRemaining: isPublic ? 0 : usage.remainingProviderCalls(),
      });
    },
    async POST(request: Request) {
      const env = environment();
      const denied = demoAccessError(request, env);
      if (denied) return response({ error: denied }, 403);
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
        return response({ error: "Send application/json." }, 415);
      if (!usage.admit()) return response({ error: "The demo is busy or its rate limit was reached. Try again in a minute." }, 429);
      try {
        const text = await readBoundedText(request, DEMO_LIMITS.bodyBytes);
        let body;
        try { body = JSON.parse(text); } catch { return response({ error: "Invalid JSON." }, 400); }
        if (!body || Array.isArray(body) || typeof body !== "object" || typeof body.prompt !== "string" ||
          !body.prompt.trim() || body.prompt.length > DEMO_LIMITS.promptCharacters ||
          (body.html !== undefined && (typeof body.html !== "string" || Buffer.byteLength(body.html, "utf8") > DEMO_LIMITS.htmlBytes)))
          return response({ error: "Provide a prompt of 1-2000 characters and optional HTML up to 80000 bytes." }, 400);
        const input = { prompt: body.prompt.trim(), html: body.html || undefined };
        // This branch must precede provider selection/reservation: public mode is
        // non-billable even when local AI flags and real credentials are configured.
        if (publicTemplateDemo(env)) return response(templateProject(input.prompt, input.html));
        const provider = configuredProvider(env);
        if (provider !== "template" && !providerUnavailable && usage.reserveProviderCall()) {
          try {
            const html = await generateWithProvider(provider, env, input, options.fetcher);
            providerVerified = true;
            return response({ html, title: projectTitle(html), mode: "ai" });
          } catch {
            providerUnavailable = true;
          }
        }
        return response(templateProject(input.prompt, input.html));
      } catch (error) {
        if (error instanceof RequestBodyError) return response({ error: error.message }, error.status);
        return response({ error: "The demo could not process this request." }, 500);
      } finally { usage.finish(); }
    },
  };
}
