import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoHandlers } from "../src/lib/demo-server/handler";
import { demoAccessError, DemoUsage, DEMO_LIMITS } from "../src/lib/demo-server/access";
import { completeHtml, configuredProvider } from "../src/lib/demo-server/provider";
import { templateProject } from "../src/lib/demo-server/template";

const env = { NODE_ENV: "development", VIBEKIDDING_DEMO_ENABLED: "1" };
function request(body?: unknown, headers: Record<string, string> = {}, url = "http://localhost:3000/api/demo/generate") {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { host: new URL(url).host, origin: new URL(url).origin, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function handlers(extra: Parameters<typeof createDemoHandlers>[0] = {}) {
  return createDemoHandlers({ environment: () => env, ...extra });
}

test("demo requires explicit opt-in and rejects production, remote hosts and forwarding", () => {
  assert.ok(demoAccessError(request(), {}));
  assert.ok(demoAccessError(request(), { ...env, NODE_ENV: "production" }));
  assert.ok(demoAccessError(request(undefined, {}, "http://example.com/api/demo/generate"), env));
  const rejectedHeaders: Record<string, string>[] = [{ host: "evil.example" }, { origin: "https://evil.example" }, { origin: "null" }, { forwarded: "for=127.0.0.1" }, { "x-forwarded-for": "203.0.113.1" }, { "x-forwarded-for": "127.0.0.1, 203.0.113.1" }, { "x-forwarded-host": "evil.example" }, { "sec-fetch-site": "same-site" }];
  for (const headers of rejectedHeaders)
    assert.ok(demoAccessError(request(undefined, headers), env));
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    assert.equal(demoAccessError(request(undefined, {}, `http://${host}:3000/api/demo/generate`), env), undefined);
  assert.equal(demoAccessError(request(undefined, { "x-forwarded-for": "::ffff:127.0.0.1", "x-forwarded-host": "localhost:3000", "x-forwarded-port": "3000", "x-forwarded-proto": "http" }), env), undefined);
});

test("readiness is no-store and exposes configuration without keys or claiming validation", async () => {
  const h = handlers({ environment: () => ({ ...env, OPENAI_API_KEY: "secret-fixture" }) });
  const response = await h.GET(request());
  const body = await response.json();
  assert.equal(body.aiConfigured, true);
  assert.equal(body.providerVerified, false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(body).includes("secret-fixture"));
  assert.equal((await handlers({ environment: () => ({}) }).GET(request())).status, 403);
});

test("template generation and revision apply supported theme, color and difficulty changes", async () => {
  const h = handlers();
  const first = await (await h.POST(request({ prompt: "Make a space game" }))).json();
  assert.equal(first.mode, "template");
  assert.match(first.html, /Star Collector/);
  const next = await (await h.POST(request({ prompt: "Make it an ocean game, blue and harder", html: first.html }))).json();
  assert.match(next.html, /Ocean Explorer/);
  assert.match(next.html, /#2563eb/);
  assert.match(next.html, /"seconds":15,"goal":20/);
  assert.match(next.message, /not AI generation/);
});

test("fallback preserves custom HTML and honestly reports unapplied revisions", () => {
  const html = "<!DOCTYPE html><html><body>My original artwork</body></html>";
  const result = templateProject("Add a dragon", html);
  assert.equal(result.html, html);
  assert.match(result.message, /unchanged/);
  assert.equal(result.mode, "template");
});

test("template never interpolates prompts or forged metadata into executable HTML", () => {
  const payload = '</script><script>alert("injected")</script>';
  const result = templateProject(payload);
  assert.ok(!result.html.includes(payload));
  const forged = `<!--vibekidding-demo-template:${JSON.stringify({ theme: payload, color: "#8b5cf6", seconds: 30, goal: 10 })}-->`;
  assert.match(templateProject("revise", forged).message, /unchanged/);
});

test("malformed and oversized input fails before provider access", async () => {
  let calls = 0;
  const h = handlers({ fetcher: async () => { calls++; throw new Error("must not run"); } });
  for (const body of [null, [], {}, { prompt: " " }, { prompt: 42 }, { prompt: "a".repeat(2001) }, { prompt: "ok", html: 42 }, { prompt: "ok", html: "🌻".repeat(20001) }])
    assert.equal((await h.POST(request(body))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handlers().POST(request({ prompt: "ok" }, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await handlers().POST(request({ prompt: "a".repeat(DEMO_LIMITS.bodyBytes + 1) }))).status, 413);
});

test("AI path sends bounded server-side requests and preserves revision input", async () => {
  const original = "<!DOCTYPE html><html><body>original</body></html>";
  const generated = "<!DOCTYPE html><html><head><title>Rocket Garden</title></head><body>updated</body></html>";
  let calls = 0;
  const h = handlers({ environment: () => ({ ...env, OPENAI_API_KEY: "secret-fixture" }), fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.max_tokens, DEMO_LIMITS.outputTokens);
    assert.equal(JSON.parse(body.messages[1].content).existingProjectHtml, original);
    assert.ok(!JSON.stringify(body).includes("secret-fixture"));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: generated } }] });
  } });
  const result = await (await h.POST(request({ prompt: "add flowers", html: original }))).json();
  assert.deepEqual(result, { html: generated, title: "Rocket Garden", mode: "ai" });
  assert.equal(calls, 1);
  assert.equal((await (await h.GET(request())).json()).providerVerified, true);
});

test("provider failures hide upstream details and stop repeated calls", async () => {
  let calls = 0;
  const h = handlers({ environment: () => ({ ...env, OPENAI_API_KEY: "secret-fixture" }), fetcher: async () => {
    calls++;
    return Response.json({ error: "sensitive raw billing detail" }, { status: 401 });
  } });
  for (let index = 0; index < 2; index++) {
    const body = await (await h.POST(request({ prompt: "space game" }))).json();
    assert.equal(body.mode, "template");
    assert.ok(!JSON.stringify(body).includes("sensitive"));
  }
  assert.equal(calls, 1);
  assert.equal((await (await h.GET(request())).json()).mode, "template");
});

test("truncated or malformed AI output is not represented as a complete AI project", async () => {
  for (const fixture of [
    { choices: [{ finish_reason: "length", message: { content: "<!DOCTYPE html><html><body>partial</body></html>" } }] },
    { choices: [{ finish_reason: "stop", message: { content: "hello" } }] },
    { choices: null },
  ]) {
    const h = handlers({ environment: () => ({ ...env, OPENAI_API_KEY: "secret-fixture" }), fetcher: async () => Response.json(fixture) });
    assert.equal((await (await h.POST(request({ prompt: "space" }))).json()).mode, "template");
  }
  assert.equal(completeHtml("<!DOCTYPE html><html><body>"), undefined);
});

test("Anthropic request and response use the same public project contract", async () => {
  const html = "<!DOCTYPE html><html><body>game</body></html>";
  const h = handlers({ environment: () => ({ ...env, ANTHROPIC_API_KEY: "secret-fixture" }), fetcher: async (url, init) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(JSON.parse(init!.body as string).max_tokens, DEMO_LIMITS.outputTokens);
    return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: html }] });
  } });
  assert.equal((await (await h.POST(request({ prompt: "space" }))).json()).html, html);
});

test("concurrent requests and minute-level usage are bounded", async () => {
  const usage = new DemoUsage();
  assert.equal(usage.admit(0), true);
  assert.equal(usage.admit(1), false);
  usage.finish();
  for (let i = 1; i < 10; i++) { assert.equal(usage.admit(i), true); usage.finish(); }
  assert.equal(usage.admit(100), false);
  assert.equal(usage.admit(60000), true);
  usage.finish();
  for (let i = 0; i < 20; i++) assert.equal(usage.reserveProviderCall(), true);
  assert.equal(usage.reserveProviderCall(), false);
  const h = handlers({ usage });
  assert.equal(usage.admit(120000), true);
  assert.equal((await h.POST(request({ prompt: "space" }))).status, 429);
});

test("unknown provider and missing credentials stay on the free template path", () => {
  assert.equal(configuredProvider({ OPENAI_API_KEY: "your-openai-key" }), "template");
  assert.equal(configuredProvider({ VIBEKIDDING_DEMO_PROVIDER: "unknown", OPENAI_API_KEY: "fixture" }), "template");
  assert.equal(configuredProvider({ VIBEKIDDING_DEMO_PROVIDER: "anthropic", OPENAI_API_KEY: "fixture" }), "template");
  assert.equal(configuredProvider({ VIBEKIDDING_DEMO_PROVIDER: "template", OPENAI_API_KEY: "fixture" }), "template");
});

test("explicit public production mode forces templates despite provider keys and local AI flags", async () => {
  let calls = 0;
  const usage = new DemoUsage();
  const h = handlers({ usage, environment: () => ({
    ...env, NODE_ENV: "production", VIBEKIDDING_PUBLIC_TEMPLATE_DEMO: "1",
    VIBEKIDDING_DEMO_PROVIDER: "openai", OPENAI_API_KEY: "secret-fixture", ANTHROPIC_API_KEY: "secret-fixture",
  }), fetcher: async () => { calls++; throw new Error("Public demo must never call a provider"); } });
  const publicRequest = (body?: unknown) => request(body, {
    "x-forwarded-for": "203.0.113.1", "x-forwarded-proto": "https", "sec-fetch-site": "same-origin",
  }, "https://demo.example/api/demo/generate");
  const readiness = await (await h.GET(publicRequest())).json();
  assert.equal(readiness.enabled, true);
  assert.equal(readiness.localOnly, false);
  assert.equal(readiness.publicTemplateOnly, true);
  assert.equal(readiness.provider, "template");
  assert.equal(readiness.aiConfigured, false);
  assert.equal(readiness.providerVerified, false);
  assert.equal(readiness.providerCallsRemaining, 0);
  assert.match(readiness.message, /Public template-only/);
  assert.ok(!JSON.stringify(readiness).includes("secret-fixture"));
  const created = await (await h.POST(publicRequest({ prompt: "space game" }))).json();
  const revised = await (await h.POST(publicRequest({ prompt: "ocean blue easier", html: created.html }))).json();
  assert.equal(created.mode, "template");
  assert.equal(revised.mode, "template");
  assert.match(revised.html, /Ocean Explorer/);
  assert.match(revised.html, /"seconds":60,"goal":5/);
  assert.equal(calls, 0);
  assert.equal(usage.remainingProviderCalls(), DEMO_LIMITS.providerCallsPerProcess);
});

test("public production access remains disabled without the exact opt-in", async () => {
  for (const flag of [undefined, "0", "true"]) {
    const h = handlers({ environment: () => ({ ...env, NODE_ENV: "production", VIBEKIDDING_PUBLIC_TEMPLATE_DEMO: flag }) });
    const url = "https://demo.example/api/demo/generate";
    assert.equal((await h.GET(request(undefined, {}, url))).status, 403);
    assert.equal((await h.POST(request({ prompt: "space" }, {}, url))).status, 403);
  }
});

test("public templates retain origin, body and usage bounds", async () => {
  const h = handlers({ environment: () => ({ NODE_ENV: "production", VIBEKIDDING_PUBLIC_TEMPLATE_DEMO: "1" }) });
  const url = "https://demo.example/api/demo/generate";
  assert.equal((await h.POST(request({ prompt: "space" }, { origin: "https://evil.example" }, url))).status, 403);
  assert.equal((await h.POST(request({ prompt: "x".repeat(2001) }, {}, url))).status, 400);
  assert.equal((await h.POST(request({ prompt: "x".repeat(DEMO_LIMITS.bodyBytes + 1) }, {}, url))).status, 413);
  for (let i = 0; i < 8; i++) assert.equal((await h.POST(request({ prompt: "space" }, {}, url))).status, 200);
  assert.equal((await h.POST(request({ prompt: "space" }, {}, url))).status, 429);
});
