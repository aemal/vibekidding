import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createVoiceHandlers, VoiceIssuanceLimit } from "../src/lib/demo-server/voice-handler";
import { voiceAgentPayload, voiceConfigErrors } from "../src/lib/demo-server/voice-config";
import { validateVoiceSignedUrl, VoiceProviderError, voiceProviderRequest, voiceSetupDiagnostic } from "../src/lib/demo-server/voice-provider";

const env = { NODE_ENV: "development", VIBEKIDDING_DEMO_ENABLED: "1", VIBEKIDDING_SAMANTHA_DEMO_ENABLED: "1", VIBEKIDDING_SAMANTHA_API_KEY: "fixture-secret", VIBEKIDDING_SAMANTHA_AGENT_ID: "agent_demo_fixture" };
const agent = () => ({ ...voiceAgentPayload("fixture-model", "voice_fixture"), agent_id: env.VIBEKIDDING_SAMANTHA_AGENT_ID, version_id: "version_fixture" });
const signedUrl = "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_demo_fixture&conversation_signature=fixture&conversation_id=conv_fixture";
const request = (body?: unknown, url = "http://localhost:3000/api/demo/voice") => new Request(url, { method: body === undefined ? "GET" : "POST", headers: { host: new URL(url).host, origin: new URL(url).origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("voice is denied in public template mode, production, remote origins and without explicit flags", async () => {
  let calls = 0;
  for (const overrides of [{ VIBEKIDDING_PUBLIC_TEMPLATE_DEMO: "1" }, { NODE_ENV: "production" }, { VIBEKIDDING_DEMO_ENABLED: "0" }, { VIBEKIDDING_SAMANTHA_DEMO_ENABLED: "0" }]) {
    const h = createVoiceHandlers({ environment: () => ({ ...env, ...overrides }), fetcher: async () => { calls++; throw new Error(); } });
    const ready = await h.GET(request());
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).enabled, false);
    assert.equal((await h.POST(request({}))).status, 403);
  }
  const h = createVoiceHandlers({ environment: () => env });
  assert.equal((await h.POST(request({}, "https://example.com/api/demo/voice"))).status, 403);
  assert.equal(calls, 0);
});

test("readiness exposes no keys and does not call provider or borrow business credentials", async () => {
  const h = createVoiceHandlers({ environment: () => env, fetcher: async () => { throw new Error("must not fetch"); } });
  const response = await h.GET(request());
  const body = await response.json();
  assert.equal(body.configured, true);
  assert.equal(body.maxDurationSeconds, 60);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(body).includes("fixture-secret"));
  const missing = createVoiceHandlers({ environment: () => ({ ...env, VIBEKIDDING_SAMANTHA_API_KEY: undefined, ELEVENLABS_API_KEY: "business" }) });
  assert.equal((await missing.POST(request({}))).status, 503);
});

test("effective limits, tools, workflow, language overrides and inherited hooks fail closed", () => {
  assert.deepEqual(voiceConfigErrors(agent(), {}), []);
  const mutate: Array<(value: ReturnType<typeof agent>) => void> = [
    a => { a.conversation_config.conversation.max_duration_seconds = 600; },
    a => { a.platform_settings.auth.enable_auth = false; },
    a => { a.platform_settings.call_limits.daily_limit = 10; },
    a => { a.platform_settings.call_limits.bursting_enabled = true; },
    a => { a.platform_settings.queueing_config.enabled = true; },
    a => { a.platform_settings.privacy.record_voice = true; },
    a => { Object.assign(a.conversation_config.agent.prompt, { tool_ids: ["business-tool"] }); },
    a => { Object.assign(a.conversation_config.agent.prompt.built_in_tools, { transfer_to_agent: { type: "system" } }); },
    a => { Object.assign(a, { workflow: { nodes: { tool: { tools: ["remote"] } } } }); },
    a => { Object.assign(a.conversation_config.language_presets, { fr: { overrides: { conversation: { max_duration_seconds: 600 } } } }); },
    a => { a.platform_settings.overrides.enable_procedure_ids_from_client = true; },
  ];
  for (const change of mutate) { const a = agent(); change(a); assert.ok(voiceConfigErrors(a, {}).length); }
  assert.ok(voiceConfigErrors(agent(), { conversation_initiation_client_data_webhook: { url: "https://business.invalid" } }).length);
  assert.ok(voiceConfigErrors(agent(), { webhooks: { post_call_webhook_id: "business" } }).length);
  assert.ok(voiceConfigErrors(agent(), null).length);
});

test("provider inert start-node and endpoint-free webhook metadata are allowed narrowly", () => {
  const normalized = {
    ...agent(),
    workflow: { edges: {}, nodes: { start_node: { type: "start", position: { x: 0, y: 0 }, edge_order: [], parent_subgraph_id: null } }, subgraphs: {}, prevent_subagent_loops: false },
  };
  const hooks = { post_call_webhook_id: null, events: ["transcript"], transcript_format: "json", exclude_transcript: false, send_audio: false };
  Object.assign(normalized.platform_settings, { workspace_overrides: { webhooks: hooks } });
  assert.deepEqual(voiceConfigErrors(normalized, { webhooks: hooks }), []);
  for (const change of [
    (a: typeof normalized) => Object.assign(a.workflow.edges, { start_to_tool: { target: "tool" } }),
    (a: typeof normalized) => Object.assign(a.workflow.nodes, { tool: { type: "tool", tools: ["business"] } }),
    (a: typeof normalized) => Object.assign(a.workflow.subgraphs, { sub: { nodes: {} } }),
    (a: typeof normalized) => Object.assign(a.workflow.nodes.start_node, { tools: ["business"] }),
    (a: typeof normalized) => { a.workflow.nodes.start_node.type = "tool"; },
    (a: typeof normalized) => Object.assign(a.platform_settings, { workspace_overrides: { webhooks: { ...hooks, post_call_webhook_id: "real-hook" } } }),
    (a: typeof normalized) => Object.assign(a.platform_settings, { workspace_overrides: { webhooks: { ...hooks, url: "https://business.invalid" } } }),
  ]) {
    const changed = structuredClone(normalized); change(changed);
    assert.ok(voiceConfigErrors(changed, {}).length);
  }
  assert.ok(voiceConfigErrors(normalized, { webhooks: { ...hooks, url: "https://business.invalid" } }).length);
});

test("mint verifies effective agent and workspace, pins version, requests one-use token", async () => {
  const urls: string[] = [];
  const h = createVoiceHandlers({ environment: () => env, fetcher: async (url, init) => {
    urls.push(String(url));
    assert.equal((init!.headers as Record<string, string>)["xi-api-key"], "fixture-secret");
    if (String(url).includes("get-signed-url")) {
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.get("include_conversation_id"), "true");
      assert.equal(parsed.searchParams.get("version_id"), "version_fixture");
      return Response.json({ signed_url: signedUrl });
    }
    return Response.json(String(url).endsWith("/settings") ? {} : agent());
  } });
  const response = await h.POST(request({}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { signedUrl, maxDurationSeconds: 60, expiresInSeconds: 900 });
  assert.equal(urls.length, 3);
  assert.equal((await h.POST(request({}))).status, 429);
});

test("unsafe provider config never mints and upstream details never escape", async () => {
  let minted = false;
  const h = createVoiceHandlers({ environment: () => env, fetcher: async url => {
    if (String(url).includes("get-signed-url")) minted = true;
    return Response.json(String(url).endsWith("/settings") ? { webhooks: { post_call_webhook_id: "private" } } : agent());
  } });
  assert.equal((await h.POST(request({}))).status, 503);
  assert.equal(minted, false);
  const failed = createVoiceHandlers({ environment: () => env, fetcher: async () => Response.json({ key: "fixture-secret", details: "private upstream" }, { status: 401 }) });
  const result = await failed.POST(request({}));
  assert.equal(result.status, 502);
  assert.doesNotMatch(await result.text(), /fixture-secret|private upstream/);
});

test("POST accepts no arbitrary overrides and rejects oversized bodies", async () => {
  const h = createVoiceHandlers({ environment: () => env, fetcher: async () => { throw new Error("must not fetch"); } });
  for (const body of [null, [], { agentId: "business" }, { overrides: {} }]) assert.equal((await h.POST(request(body))).status, 400);
  assert.equal((await h.POST(request({ data: "x".repeat(2000) }))).status, 413);
});

test("session URL validates provider origin, dedicated agent and single-use conversation ID", () => {
  assert.equal(validateVoiceSignedUrl(signedUrl, env.VIBEKIDDING_SAMANTHA_AGENT_ID), true);
  for (const url of [signedUrl.replace("wss:", "https:"), signedUrl.replace("api.elevenlabs.io", "evil.example"), signedUrl.replace("agent_demo_fixture", "agent_business"), signedUrl.replace("&conversation_id=conv_fixture", "")])
    assert.equal(validateVoiceSignedUrl(url, env.VIBEKIDDING_SAMANTHA_AGENT_ID), false);
});

test("issuance limit blocks concurrent starts and caps lifetime attempts", () => {
  const usage = new VoiceIssuanceLimit();
  assert.equal(usage.admit(0), true); assert.equal(usage.admit(60000), false); usage.finish();
  assert.equal(usage.admit(10), false);
  assert.equal(usage.admit(60000), true); usage.finish();
  assert.equal(usage.admit(120000), true); usage.finish();
  assert.equal(usage.admit(9999999), false);
});

test("setup defaults to a no-provider dry-run and does not print dedicated secrets", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/setup-demo-voice.ts"], { encoding: "utf8", timeout: 15000, env: { ...process.env, VIBEKIDDING_SAMANTHA_API_KEY: "private-test-key" } });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "dry-run");
  assert.equal(output.providerCalls, false);
  assert.equal(output.payload.conversation_config.agent.language, "en");
  assert.equal(output.payload.conversation_config.tts.model_id, "eleven_flash_v2");
  assert.doesNotMatch(result.stdout, /private-test-key/);
  assert.deepEqual(voiceConfigErrors(output.payload, {}), []);
});

test("setup diagnostics retain status and validation coordinates, never input or messages", async () => {
  await assert.rejects(voiceProviderRequest("/fixture", "private-key", async () => Response.json({ detail: [
    { loc: ["body", "conversation_config", "agent", "prompt", "tools", 0], type: "extra_forbidden", msg: "private provider message", input: "private-key" },
    { loc: ["body", "https://private.example", "sk-private-key"], type: "unsafe error containing private-key" },
  ] }, { status: 422 })), error => {
    assert.ok(error instanceof VoiceProviderError);
    assert.equal(error.status, 422);
    assert.deepEqual(error.validation, [
      { path: "body.conversation_config.agent.prompt.tools.0", type: "extra_forbidden" },
      { path: "body.[redacted].[redacted]", type: "validation_error" },
    ]);
    assert.doesNotMatch(JSON.stringify(error), /private-key|private provider|private.example/);
    return true;
  });
});

test("setup-only business error message is bounded with keys and URLs redacted", () => {
  const diagnostic = voiceSetupDiagnostic({ detail: { status: "invalid_configuration", message: "Duration invalid. fixture-secret https://private.example/path?token=123 xi-api-key: another-secret sk_otherSecret " + "x".repeat(500) } }, "fixture-secret");
  assert.equal(diagnostic?.code, "invalid_configuration");
  assert.match(diagnostic!.message!, /Duration invalid/);
  assert.doesNotMatch(JSON.stringify(diagnostic), /fixture-secret|private.example|another-secret|sk_otherSecret/);
  assert.ok(diagnostic!.message!.length <= 400);
});
