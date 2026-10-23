import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {spawnSync} from "node:child_process";
const script=resolve("scripts/check-studio-setup.ts"),tsx=resolve("node_modules/tsx/dist/cli.mjs");
async function fixture(args:string[],envFile="") {
 const dir=await mkdtemp(join(tmpdir(),"vk-setup-"));
 try {
  await writeFile(join(dir,".env.local"),envFile);
  return spawnSync(process.execPath,[tsx,script,...args],{cwd:dir,encoding:"utf8",timeout:10000,env:{PATH:process.env.PATH,NODE_ENV:"production"}});
 } finally {await rm(dir,{recursive:true,force:true});}
}
test("strict setup fails closed and JSON does not expose configured secrets",async()=>{
 const result=await fixture(["--strict","--json"],"OPENAI_API_KEY=synthetic-private-key\nSTUDIO_CHILD_SAFETY_APPROVED=true\n");
 assert.equal(result.status,2,result.stderr);
 assert.ok(!result.stdout.includes("synthetic-private-key"));
 const report=JSON.parse(result.stdout);
 assert.equal(report.ready,false);assert.equal(report.liveAcceptance,false);assert.equal(report.providerCalls,false);
 assert.equal(report.mode,"strict-production");
 assert.equal(report.checks.find((c:{id:string})=>c.id==="consent").status,"needs-review");
});
test("informational setup stays usable but invalid flags fail",async()=>{
 const info=await fixture(["--json"]);assert.equal(info.status,0,info.stderr);
 assert.equal(JSON.parse(info.stdout).ready,false);
 const invalid=await fixture(["--approve"]);assert.equal(invalid.status,1);assert.match(invalid.stderr,/Usage/);
});
