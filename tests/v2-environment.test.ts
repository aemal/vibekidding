import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, saveVersion, projectDetail } from "../src/lib/v2/store";
import { starterFiles } from "../src/lib/v2/scaffold";
import { environmentMetadata, updateEnvironment, validateEnvironmentValues } from "../src/lib/v2-env/store";

test("app configuration persists outside source versions and returns only names/configured flags",async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"v2-env-")),old=process.env.VIBEKIDDING_V2_DATA_DIR;process.env.VIBEKIDDING_V2_DATA_DIR=root;
 try{
  const project=await createProject("owner","App","Test");await saveVersion(project,"Create",starterFiles());
  const result=await updateEnvironment(project.id,{set:{CUSTOM_API_KEY:"test-secret-only",SERVICE_URL:"https://example.test",EMPTY:""}});
  assert.deepEqual(result.variables,[{name:"CUSTOM_API_KEY",configured:true},{name:"EMPTY",configured:false},{name:"SERVICE_URL",configured:true}]);
  assert.ok(!JSON.stringify(result).includes("test-secret-only"));assert.ok(!JSON.stringify(await projectDetail(project.id,"owner")).includes("test-secret-only"));
  const filename=path.join(root,"projects",project.id,"environment.json");assert.equal(JSON.parse(await fs.readFile(filename,"utf8")).CUSTOM_API_KEY,"test-secret-only");assert.equal((await fs.stat(filename)).mode & 0o777,0o600);
  await updateEnvironment(project.id,{set:{SERVICE_URL:"https://changed.test"},remove:["CUSTOM_API_KEY"]});assert.deepEqual((await environmentMetadata(project.id)).variables.map(v=>v.name),["EMPTY","SERVICE_URL"]);
  assert.equal(JSON.parse(await fs.readFile(filename,"utf8")).SERVICE_URL,"https://changed.test");
 }finally{if(old===undefined)delete process.env.VIBEKIDDING_V2_DATA_DIR;else process.env.VIBEKIDDING_V2_DATA_DIR=old;await fs.rm(root,{recursive:true,force:true});}
});
test("configuration cannot replace platform runtime settings or inject environment lines",()=>{
 for(const name of ["PORT","PATH","NODE_OPTIONS","VIBEKIDDING_CONTROLLER_TOKEN","vibekidding_secret","BAD-NAME"]){assert.throws(()=>validateEnvironmentValues({[name]:"x"}));}
 assert.throws(()=>validateEnvironmentValues({API_KEY:"a\nPORT=9"}));assert.throws(()=>validateEnvironmentValues({API_KEY:"x".repeat(8193)}));assert.throws(()=>validateEnvironmentValues({API_KEY:45}));
 const valid=validateEnvironmentValues({__proto_key:"safe",SERVICE_TOKEN:"test"});assert.equal(Object.getPrototypeOf(valid),null);
});
