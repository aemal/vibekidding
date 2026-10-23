import { loadEnvConfig } from "@next/env";
import { setupChecks } from "../src/lib/studio/readiness";
const args=process.argv.slice(2);
if(args.some(arg=>!["--strict","--json"].includes(arg))) {
 console.error("Usage: setup:check [--strict] [--json]");
 process.exitCode=1;
} else {
 const strict=args.includes("--strict"), json=args.includes("--json");
 // Strict checks use production env-file precedence, not development overrides.
 loadEnvConfig(process.cwd(),!strict,{info(){},error(){}});
 const checks=setupChecks(process.env);
 const blockers=checks.filter(check=>check.status!=="configured");
 const report={mode:strict?"strict-production":"informational",scope:"local configuration only",providerCalls:false,liveAcceptance:false,ready:blockers.length===0,checks};
 if(json) console.log(JSON.stringify(report,null,2));
 else {
  console.log(`VibeKidding setup check (${report.mode}; no provider calls)`);
  for(const check of checks) console.log(`[${check.status}] ${check.label}: ${check.detail}`);
  console.log("Configuration presence is not proof of credentials, deployed migrations, consent, delivery or working inference.");
  if(strict&&blockers.length) console.log(`BLOCKED: ${blockers.length} missing configuration or review items. Do not launch.`);
 }
 if(strict&&blockers.length) process.exitCode=2;
}
