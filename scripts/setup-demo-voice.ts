import { loadEnvConfig } from "@next/env";
import { open, readFile, lstat, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
import { voiceAgentPayload, voiceConfigErrors, validVoiceAgentId } from "../src/lib/demo-server/voice-config";
import { VoiceProviderError, voiceProviderRequest } from "../src/lib/demo-server/voice-provider";

async function main() {
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const args = process.argv.slice(2);
  let create = false, list = false, llm = "", voice = "cgSgspJ2msm6clMCkdW9";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--create") create = true;
    else if (args[i] === "--list-models") list = true;
    else if (args[i] === "--llm" && args[i + 1]) llm = args[++i];
    else if (args[i] === "--voice-id" && args[i + 1]) voice = args[++i];
    else throw new Error("Usage: setup-demo-voice.ts [--list-models | --create --llm MODEL] [--voice-id VOICE]");
  }
  if (list && create) throw new Error("Choose list-models or create, not both.");
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(voice) || (llm && !/^[A-Za-z0-9._/-]{1,100}$/.test(llm))) throw new Error("Invalid model or voice identifier.");
  const payload = voiceAgentPayload(llm || "SELECT_WITH_LIST_MODELS", voice);
  if (!create && !list) {
    console.log(JSON.stringify({ mode: "dry-run", providerCalls: false, payload, next: "Review payload. --list-models performs read-only discovery; --create --llm MODEL explicitly creates one new agent. Only its ID is saved to ignored .env.local. No workspace or existing agent is modified." }, null, 2));
    return;
  }
  const key = process.env.VIBEKIDDING_SAMANTHA_API_KEY;
  if (!key?.trim()) throw new Error("Set the dedicated VIBEKIDDING_SAMANTHA_API_KEY in the server environment. No business-key fallback is used.");
  const catalog = await voiceProviderRequest("/v1/convai/llm/list", key);
  const models = Array.isArray(catalog.llms) ? catalog.llms as Array<Record<string, unknown>> : [];
  if (list) {
    console.log(JSON.stringify({ mode: "read-only", models: models.filter(item => typeof item.llm === "string").map(item => ({ model: item.llm, deprecated: item.is_deprecated === true || !!item.deprecation_date || !!item.deprecation_info, workspaceApproved: typeof item.is_approved_for_workspace === "boolean" ? item.is_approved_for_workspace : null })) }, null, 2));
    return;
  }
  if (!llm || !models.some(item => item.llm === llm && item.is_deprecated !== true && !item.deprecation_date && !item.deprecation_info && item.is_approved_for_workspace !== false)) throw new Error("Select an available nondeprecated model with --llm after --list-models. Explicitly denied workspace models cannot be used.");
  const workspace = await voiceProviderRequest("/v1/convai/settings", key);
  const preflight = voiceConfigErrors(payload, workspace);
  if (preflight.length) throw new Error(preflight.join(" ") + " Workspace settings will not be changed.");
  if (process.env.VIBEKIDDING_SAMANTHA_AGENT_ID) throw new Error("A dedicated agent ID is already configured; this script never replaces existing agents.");
  const file = ".env.local", lockFile = ".env.samantha-setup.lock";
  try { execFileSync("git", ["check-ignore", "-q", "--", file], { stdio: "ignore" }); }
  catch { throw new Error("Refusing to save an agent ID: .env.local must be ignored by Git."); }
  const lock = await open(lockFile, "wx", 0o600);
  let saved = false;
  try {
    const stat = await lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error("Local environment destination must be a regular file.");
    const existing = await readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    if (parse(existing).VIBEKIDDING_SAMANTHA_AGENT_ID) throw new Error("A dedicated agent ID already exists locally; no new agent was created.");
    const created = await voiceProviderRequest("/v1/convai/agents/create", key, fetch, payload);
    if (!validVoiceAgentId(created.agent_id)) throw new Error("Creation response did not include a valid agent ID. Inspect the provider console before retrying.");
    const destination = await open(file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try { await destination.writeFile(`\nVIBEKIDDING_SAMANTHA_AGENT_ID=${created.agent_id}\n`); await destination.sync(); saved = true; }
    finally { await destination.close(); }
    const effective = await voiceProviderRequest(`/v1/convai/agents/${encodeURIComponent(created.agent_id)}`, key);
    const errors = voiceConfigErrors(effective, workspace);
    if (errors.length) throw new Error("New agent ID saved, but configuration verification failed: " + errors.join(" "));
    console.log(JSON.stringify({ created: true, agentIdSavedTo: file, configurationVerified: true, voiceStarted: false, message: "Only the new agent ID was saved. Enable the local voice flag separately after review." }));
  } catch (error) {
    if (!saved) console.error("Setup did not finish saving a verified agent. If creation was attempted, inspect the provider console before retrying; no automatic retry is performed.");
    throw error;
  } finally { await lock.close(); await unlink(lockFile); }
}
main().catch(error => {
  // Provider helpers emit fixed errors only; never print upstream bodies, keys or URLs.
  if (error instanceof VoiceProviderError) console.error(JSON.stringify({ providerStatus: error.status ?? null, validation: error.validation, diagnostic: error.diagnostic }));
  console.error(error instanceof Error ? error.message : "Voice setup failed.");
  process.exitCode = 1;
});
