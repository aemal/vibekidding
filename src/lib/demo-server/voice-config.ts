export const VOICE_LIMITS = { maxDurationSeconds: 60, dailyCallLimit: 3, concurrency: 1 } as const;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const active = (value: unknown): boolean => Array.isArray(value) ? value.some(active) : value && typeof value === "object" ? Object.values(value).some(active) : !!value;

function inertWorkflow(value: unknown) {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const workflow = object(value);
  if (Object.keys(workflow).length === 0) return true;
  if (Object.keys(workflow).some(key => !["edges", "nodes", "subgraphs", "prevent_subagent_loops"].includes(key))) return false;
  const emptyRecord = (value: unknown) => value == null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
  if (!emptyRecord(workflow.edges) || !emptyRecord(workflow.subgraphs)) return false;
  const nodes = object(workflow.nodes);
  if (Object.keys(nodes).length !== 1 || !nodes.start_node) return false;
  const start = object(nodes.start_node);
  if (Object.keys(start).some(key => !["type", "position", "edge_order", "parent_subgraph_id"].includes(key))) return false;
  return start.type === "start" && (start.edge_order === undefined || (Array.isArray(start.edge_order) && start.edge_order.length === 0)) && start.parent_subgraph_id == null &&
    Object.entries(object(start.position)).every(([key, coordinate]) => ["x", "y"].includes(key) && typeof coordinate === "number" && Number.isFinite(coordinate));
}

function activeWebhooks(value: unknown) {
  if (!active(value)) return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const hooks = object(value);
  // These fields describe a post-call payload; without an endpoint they do not execute.
  const metadata = new Set(["events", "transcript_format", "exclude_transcript", "send_audio"]);
  return Object.entries(hooks).some(([key, nested]) => !metadata.has(key) && active(nested));
}

export function voiceAgentPayload(llm: string, voiceId: string) {
  return {
    name: "VibeKidding local Samantha demo",
    conversation_config: {
      agent: {
        first_message: "Hi, I am Samantha. Let us think of a simple game idea together. This demo lasts one minute.",
        language: "en",
        prompt: {
          prompt: "You are Samantha, a friendly local demo helper for an eight-year-old with a grownup present. Use simple, age-appropriate language and brainstorm only simple creative projects such as drawing, matching games, number quizzes and friendly stories. Redirect mature or harmful requests to safe creative ideas. Never ask for personal details. You have no tools and cannot create projects, contact people or access other services. Offer a short idea the user and grownup can review and manually copy into the editor. Never claim actions were performed. Keep each answer to one or two short sentences.",
          llm, temperature: 0.4, max_tokens: 150, tool_ids: [], tools: [], built_in_tools: {}, knowledge_base: [],
        },
      },
      tts: { voice_id: voiceId, model_id: "eleven_flash_v2" },
      conversation: { max_duration_seconds: 60, text_only: false, client_events: ["audio", "interruption", "user_transcript", "agent_response"] },
      language_presets: {},
    },
    platform_settings: {
      auth: { enable_auth: true },
      call_limits: { agent_concurrency_limit: 1, daily_limit: 3, bursting_enabled: false },
      queueing_config: { enabled: false },
      privacy: { record_voice: false, retention_days: 0 },
      overrides: { custom_llm_extra_body: false, enable_conversation_initiation_client_data_from_webhook: false, enable_starting_workflow_node_id_from_client: false, enable_procedure_ids_from_client: false },
    },
  };
}

/** Inspect effective provider configuration, including inherited workspace hooks. */
export function voiceConfigErrors(agentValue: unknown, workspaceValue: unknown) {
  const errors: string[] = [];
  const agent = object(agentValue), config = object(agent.conversation_config), platform = object(agent.platform_settings);
  const conversation = object(config.conversation), auth = object(platform.auth), limits = object(platform.call_limits);
  const privacy = object(platform.privacy);
  if (conversation.max_duration_seconds !== 60) errors.push("Provider duration must be 60 seconds.");
  if (auth.enable_auth !== true) errors.push("Provider authentication must be enabled.");
  if (limits.agent_concurrency_limit !== 1 || limits.daily_limit !== 3 || limits.bursting_enabled !== false)
    errors.push("Provider call limits must be concurrency 1, daily 3, with bursting disabled.");
  if (object(platform.queueing_config).enabled !== false) errors.push("Provider call queueing must be disabled.");
  if (privacy.record_voice !== false || privacy.retention_days !== 0) errors.push("Provider audio saving must be disabled and retention set to zero.");
  if (active(config.language_presets)) errors.push("Language overrides are not allowed.");
  if (active(platform.overrides)) errors.push("Client overrides are not allowed.");
  const prohibited = new Set(["tools", "tool_ids", "built_in_tools", "mcp_server_ids", "mcp_servers", "workflow", "workflows", "procedures", "procedure_ids", "custom_llm", "knowledge_base"]);
  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "workflow") {
        if (!inertWorkflow(nested)) errors.push("Only an empty or inert start-only workflow is allowed.");
        continue;
      }
      if (key === "webhooks" && !activeWebhooks(nested)) continue;
      if (prohibited.has(key) && active(nested)) errors.push("Tools, workflows, MCP, procedures, knowledge bases and custom LLMs are not allowed.");
      if (/webhook/i.test(key) && active(nested)) errors.push("Agent and inherited workspace hooks must be absent.");
      walk(nested);
    }
  }
  walk(agent);
  const workspace = object(workspaceValue);
  if (!workspaceValue || typeof workspaceValue !== "object" || Array.isArray(workspaceValue)) errors.push("Workspace settings could not be verified.");
  // Default event lists without an endpoint do not connect to a webhook.
  if (active(workspace.conversation_initiation_client_data_webhook) || activeWebhooks(workspace.webhooks))
    errors.push("Agent and inherited workspace hooks must be absent.");
  return [...new Set(errors)];
}

export function validVoiceAgentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value);
}
