import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { starterFiles } from "../src/lib/v2/scaffold";
import { createProject, getProject, listProjects, projectDetail, saveVersion, sourcePath, validateFiles } from "../src/lib/v2/store";
import { mergeGenerated } from "../src/lib/v2/provider";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"vibe-v2-"));}
test("source manifest rejects traversal, duplicates, env files and invalid runnable projects",()=>{
  for(const name of ["../oops","/tmp/oops","src/../../oops",".env",".env.local","node_modules/a.js","data/a"]){assert.throws(()=>validateFiles([...starterFiles(),{path:name,content:"bad"}]));}
  assert.throws(()=>validateFiles([...starterFiles(),starterFiles()[0]]));
  assert.throws(()=>validateFiles([{path:"package.json",content:'{"scripts":{"build":"vite"}}'}]));
  assert.ok(validateFiles(starterFiles()).length>5);
});
test("model changes merge into multifile project while retaining backend and existing dependencies",()=>{
  const base=starterFiles();const result=mergeGenerated(JSON.stringify({name:"Notes",summary:"Notes added",files:[{path:"src/App.jsx",content:"export default function App(){return <h1>Notes</h1>}"}]}),base);
  assert.equal(result.files.find(f=>f.path==="server.mjs")?.content,base.find(f=>f.path==="server.mjs")?.content);
  assert.match(result.files.find(f=>f.path==="src/App.jsx")!.content,/Notes/);
  assert.throws(()=>mergeGenerated('{"files":',base));
  assert.throws(()=>mergeGenerated(JSON.stringify({name:"Bad",files:[{path:"../bad",content:"x"}]}),base));
});
test("versions persist on disk, keep ownership separate and do not overwrite app data",async()=>{
  const root=await temp();const old=process.env.VIBEKIDDING_V2_DATA_DIR;process.env.VIBEKIDDING_V2_DATA_DIR=root;
  try{
    const project=await createProject("owner-a","Notes","A notes app","ash");
    const v1=await saveVersion(project,"Create",starterFiles());
    const persistent=path.join(root,"projects",project.id,"data");await fs.mkdir(persistent,{recursive:true});await fs.writeFile(path.join(persistent,"app.sqlite"),"existing-user-data");
    const files=starterFiles();files.find(f=>f.path==="src/App.jsx")!.content="export default function App(){return <h1>Updated</h1>}";
    const v2=await saveVersion(project,"Change title",files);
    assert.notEqual(v1.id,v2.id);assert.equal(await fs.readFile(path.join(persistent,"app.sqlite"),"utf8"),"existing-user-data");
    assert.equal(await getProject(project.id,"owner-b"),null);assert.deepEqual(await listProjects("owner-b"),[]);
    const detail=await projectDetail(project.id,"owner-a");assert.equal(detail?.versions.length,2);assert.equal(detail?.project.currentVersionId,v2.id);
    assert.match(await fs.readFile(path.join(sourcePath(project.id,v1.id),"src/App.jsx"),"utf8"),/Your new application/);
    assert.match(detail!.files.find(f=>f.path==="src/App.jsx")!.content,/Updated/);
  }finally{if(old===undefined)delete process.env.VIBEKIDDING_V2_DATA_DIR;else process.env.VIBEKIDDING_V2_DATA_DIR=old;await fs.rm(root,{recursive:true,force:true});}
});
async function freePort(){const s=createServer();await new Promise<void>(r=>s.listen(0,"127.0.0.1",r));const port=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return port;}
async function start(root:string,dataDir:string,port:number){
  const child=spawn(process.execPath,["server.mjs"],{cwd:root,env:{...process.env,DATA_DIR:dataDir,PORT:String(port),BASE_PATH:"/apps/example/",HOST:"127.0.0.1"},stdio:"pipe"});
  let output="";child.stderr?.on("data",chunk=>output+=chunk);
  for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)return child;}catch{}if(child.exitCode!==null)throw new Error(output);await new Promise(r=>setTimeout(r,50));}
  child.kill();throw new Error("Starter server did not start: "+output);
}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once("exit",()=>resolve());child.kill();});}
test("real generated Node substrate saves SQLite records and photos across process restarts",async()=>{
  const root=await temp(),data=await temp(),port=await freePort();let child:ChildProcess|undefined;
  try{
    await fs.writeFile(path.join(root,"server.mjs"),starterFiles().find(f=>f.path==="server.mjs")!.content);await fs.mkdir(path.join(root,"dist"));await fs.writeFile(path.join(root,"dist","index.html"),"<h1>App</h1>");
    child=await start(root,data,port);const base=`http://127.0.0.1:${port}`;
    const put=await fetch(base+"/api/records/chores",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({title:"Clean room",points:10})});assert.equal(put.status,200);const saved=await put.json();
    const image=Buffer.from("test-image-bytes");const uploaded=await fetch(base+"/api/uploads",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"room.png",type:"image/png",content:image.toString("base64")})}).then(r=>r.json());assert.match(uploaded.url,/^\/apps\/example\/api\/uploads\//);
    await stop(child);child=await start(root,data,port);
    const result=await fetch(base+"/apps/example/api/records/chores").then(r=>r.json());assert.equal(result.records[0].id,saved.id);assert.equal(result.records[0].data.points,10);
    assert.equal(Buffer.from(await (await fetch(base+uploaded.url)).arrayBuffer()).toString(),"test-image-bytes");
    assert.equal((await fs.readFile(path.join(data,"app.sqlite"))).subarray(0,15).toString(),"SQLite format 3");
    const invalid=await fetch(base+"/api/records/chores",{method:"PUT",headers:{"content-type":"application/json"},body:'[]'});assert.equal(invalid.status,400);
    await fetch(base+"/api/records/chores/"+saved.id,{method:"DELETE"});assert.equal((await fetch(base+"/api/records/chores").then(r=>r.json())).records.length,0);
  }finally{if(child)await stop(child);await fs.rm(root,{recursive:true,force:true});await fs.rm(data,{recursive:true,force:true});}
});

test("deployment job waits for controller readiness and keeps previous deployed URL on failure",async()=>{
 const {enqueueProjectJob}=await import("../src/lib/v2/jobs");const {getJob,saveProject}=await import("../src/lib/v2/store");
 const root=await temp();const oldRoot=process.env.VIBEKIDDING_V2_DATA_DIR;const originalFetch=globalThis.fetch;process.env.VIBEKIDDING_V2_DATA_DIR=root;
 try{
  const project=await createProject("owner","Build test","Prompt");const version=await saveVersion(project,"Create",starterFiles());let poll=0;
  globalThis.fetch=async(input,options)=>{const url=String(input);if(url.endsWith("/deploy")){const body=JSON.parse(String(options?.body));assert.equal(body.projectId,project.id);assert.equal(body.versionId,version.id);return Response.json({deploymentId:"build-1",status:"queued"});}poll++;return Response.json({status:poll===1?"building":"ready",url:`/apps/${project.id}/`,logs:"npm build\napp is healthy"});};
  await enqueueProjectJob(project,"deploy","",version.id);
  for(let i=0;i<70;i++){if((await getJob(project.id))?.status==="completed")break;await new Promise(r=>setTimeout(r,50));}
  const job=await getJob(project.id);assert.equal(job?.status,"completed");assert.ok(job?.logs.includes("[build] app is healthy"));assert.ok(poll>=2);
  const ready=(await getProject(project.id,"owner"))!;assert.equal(ready.deployedVersionId,version.id);assert.equal(ready.previewUrl,`/apps/${project.id}/`);
  globalThis.fetch=async(input)=>String(input).endsWith("/deploy")?Response.json({deploymentId:"build-2",status:"queued"}):Response.json({status:"failed",error:"Compilation failed",logs:"syntax error"});
  await enqueueProjectJob(ready,"deploy","",version.id);
  for(let i=0;i<40;i++){if((await getJob(project.id))?.status==="failed")break;await new Promise(r=>setTimeout(r,50));}
  const failed=await getProject(project.id,"owner");assert.equal(failed?.status,"error");assert.equal(failed?.previewUrl,`/apps/${project.id}/`);assert.equal(failed?.deployedVersionId,version.id);
  // A completed operation can be recovered from disk independently of process memory.
  await saveProject({...ready,status:"ready"});
 }finally{globalThis.fetch=originalFetch;if(oldRoot===undefined)delete process.env.VIBEKIDDING_V2_DATA_DIR;else process.env.VIBEKIDDING_V2_DATA_DIR=oldRoot;await fs.rm(root,{recursive:true,force:true});}
});
