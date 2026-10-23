import { loadEnvConfig } from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
import { safetyCases } from "../tests/fixtures/guard-cases";
import { guardRequest, localGuard } from "../src/lib/studio/guard-policy";
import { checkGuardProvider } from "../src/lib/studio/guard-provider";
import { assessSafetyCase } from "../src/lib/studio/guard-evaluation";
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--live")) {
    console.log(`${safetyCases.length} synthetic cases ready. No provider calls made; classification accuracy is NOT evaluated.`);
    console.log("Live evaluation requires --live --max-calls=N --budget-micro-usd=N and configured TypeSafe credentials plus a reviewed per-check cost bound.");
    return;
  }
  if (args.some(arg => arg !== "--live" && !/^--(?:max-calls|budget-micro-usd)=\d+$/.test(arg))) throw new Error("Unknown evaluation argument.");
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const maxCalls = Number(args.find(arg => arg.startsWith("--max-calls="))?.split("=")[1]);
  const budget = Number(args.find(arg => arg.startsWith("--budget-micro-usd="))?.split("=")[1]);
  const cost = Number(process.env.TYPESAFE_MAX_CHECK_MICRO_USD);
  const key = process.env.TYPESAFE_API_KEY, model = process.env.TYPESAFE_MODEL;
  if (!key || !model) throw new Error("TypeSafe credentials and reviewed model are required.");
  if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 1000000 || !Number.isSafeInteger(budget) || budget < cost || budget > 1000000 || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > safetyCases.length) throw new Error("Set explicit valid call/budget limits; maximum run budget is 1,000,000 micro-USD.");
  const results = [];
  let calls = 0, reserved = 0;
  for (const fixture of safetyCases) {
    let result = localGuard(fixture.text);
    const source = result ? "local" : "provider";
    if (!result) {
      if (calls >= maxCalls || reserved + cost > budget) break;
      calls++; reserved += cost;
      result = (await checkGuardProvider(guardRequest(fixture.role, fixture.text, fixture.rules, fixture.context, model), key)).result;
    }
    results.push({ id: fixture.id, language: fixture.language, source, expected: fixture.expectation, decision: result.decision, categories: result.categories, outcome: assessSafetyCase(fixture.expectation, result, fixture.category) });
    if (result.decision === "unavailable") break;
  }
  const complete = results.length === safetyCases.length;
  const passed = complete && results.every(result => result.outcome === "pass");
  const report = { generatedAt: new Date().toISOString(), mode: "live", complete, passed, calls, reservedMicroUsd: reserved, untested: safetyCases.length - results.length, results };
  await mkdir("work/guard-evaluations", { recursive: true });
  const path = `work/guard-evaluations/${Date.now()}.json`;
  await writeFile(path, JSON.stringify(report, null, 2)+"\n");
  console.log(`Evaluation ${passed ? "passed this corpus" : "incomplete or failed"}: ${results.length}/${safetyCases.length} cases; ${calls} provider calls. Report: ${path}`);
  console.log("This corpus is not a guarantee of child safety. Reserved cost uses the configured bound, not verified provider billing.");
  if (!passed) process.exitCode = 1;
}
main().catch(() => { console.error("Evaluation did not complete. Check configuration, explicit limits and report storage. Provider calls may have occurred; no raw error or secret is printed."); process.exitCode = 1; });
