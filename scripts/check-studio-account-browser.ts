import assert from "node:assert/strict";
import {createServer} from "node:http";
import {build} from "esbuild";
import {chromium} from "@playwright/test";
async function main(){
 const admin=process.argv.includes("--admin"), parent=process.argv.includes("--parent"), play=process.argv.includes("--play");
 const result=await build({stdin:{contents:`import React from "react";import {createRoot} from "react-dom/client";import Studio from "./src/app/${admin ? "admin/" : parent ? "parents/" : play ? "play/" : ""}page";createRoot(document.getElementById("root")).render(<Studio/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,jsx:"automatic",loader:{".css":"empty"},define:{"process.env":"{}","process.env.NODE_ENV":'"production"'},plugins:[{name:"synthetic-auth",setup(b){
  b.onResolve({filter:/^@\/lib\/studio\/browser$/},()=>({path:"auth",namespace:"fixture"}));
  b.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));
  b.onLoad({filter:/.*/,namespace:"fixture"},args=>({resolveDir:process.cwd(),loader:"jsx",contents:args.path==="link"?'import React from "react";export default function Link(p){return <a {...p}/>;}':play?`
 let listener,release,update,releaseRead;
 const room={id:"synthetic-room",board:Array(9).fill(""),turn:"X",winner:null,host:"first",guest:"friend",revision:0};
 window.fixture={switchAccount(){listener?.();},release(){release?.();update?.({new:{...room,revision:9}});},pending:false,mode:"ok",reads:0,failRefresh(mode){this.mode=mode;this.reads=0;},lateRead(){releaseRead?.({data:room});update?.({new:{...room,revision:10}});}};
 const channel={on(_event,_filter,callback){update=callback;return this;},subscribe(){return this;}};
 export function browser(){return {auth:{onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){listener=null;}}}};}},channel(){return channel;},removeChannel:async()=>{},from(){return {select(){return this;},eq(){return this;},abortSignal(){return this;},single:async()=>{window.fixture.reads++;if(window.fixture.mode==="error")throw new Error("synthetic network failure");if(window.fixture.mode==="hang")return new Promise(resolve=>{releaseRead=resolve;});return {data:room};}};}};}
 export async function call(_action,data){if(data.operation==="create")return {room};window.fixture.pending=true;return new Promise(resolve=>{release=()=>resolve({room:{...room,revision:1}});});}
 `:parent?`
 let listener;
 window.fixture={switchAccount(){listener?.();}};
 export function browser(){return {auth:{getSession:async()=>({data:{session:{access_token:"synthetic"}}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){listener=null;}}}};}}};}
 `:admin?`
 let listener,release,count=0,allowed=true;
 const data={profiles:[{id:"fixture",username:"fixture",email:"PRIVATE_ADMIN_EMAIL@example.test",status:"pending",credits:0,email_verified_at:null,safety_revision:0}],setup:[],models:[],projects:[{id:"published-fixture",title:"Public fixture",html:"<p>Reviewed code</p>",published:true,review_requested:false}],storagePermissions:[],mailJobs:[],outbox:[],usage:[],grants:[],deletionRequests:[]};
 window.fixture={switchAccount(){allowed=false;listener?.();},release(){release?.();},pending:false};
 export function browser(){return {auth:{onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){listener=null;}}}};}}};}
 export async function call(action,payload){
  if(!allowed)throw Error("Synthetic admin access revoked");
  if(action==="catalog")return {models:["synthetic"]};
  if(action==="admin"){
   if(payload?.operation==="app-storage"){if(payload.allow&&payload.reviewedHtml!==data.projects[0].html)throw Error("Wrong reviewed code");data.storagePermissions=payload.allow?[{project_id:payload.projectId,reviewed_html:payload.reviewedHtml}]:[];return {ok:true};}
   if(count++<3)return data;
   window.fixture.pending=true;return new Promise(resolve=>{release=()=>resolve(data);});
  }
  throw Error("Unexpected fixture action");
 }`:`
 let user="first",listener,release;
 const project={id:"fixture-project",title:"FIRST PRIVATE PROJECT",slug:"fixture",html:"<p>FIRST PRIVATE CONTENT</p>",published:false,review_requested:false};
 window.fixture={switchAccount(){user="second";listener?.();},release(){release?.();},pending:false};
 export function browser(){return {auth:{getSession:async()=>({data:{session:user?{user:{id:user}}:null}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){listener=null;}}}};},async signOut(){user=null;listener?.();}}};}
 export async function call(action,payload){
  if(action==="me")return {profile:{id:user,username:user,credits:1000,status:"approved",email_verified_at:"fixture"},admin:false,email:user+"@example.test",ready:true};
  if(action==="projects")return {projects:user==="first"?[project]:[]};
  if(action==="models")return {models:[{id:"synthetic-model"}]};
  if(action==="generate"){window.fixture.pending=true;return new Promise(resolve=>{release=()=>resolve({project:{...project,title:"LATE PRIVATE RESULT"},charged:1});});}
  throw Error("Unexpected fixture action");
 }` }));
 }}]});
 const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/bundle.js"?"text/javascript":"text/html");res.end(req.url==="/bundle.js"?result.outputFiles[0].text:'<div id="root"></div><script src="/bundle.js"></script>');});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const addr=server.address();assert.ok(addr&&typeof addr!=="string");
 const channel=process.env.STUDIO_TEST_BROWSER || "chrome";
 assert.ok(["chrome","chromium"].includes(channel));
 const browser=await chromium.launch({channel,headless:true});
 try{
  const page=await browser.newPage();const errors:string[]=[];page.on("pageerror",e=>{errors.push(e.message);console.error("Fixture browser:",e.message);});
  let parentReads=0, releaseParent: (()=>void)|undefined;
  let notifyPending:()=>void=()=>{};
  const parentPending=new Promise<void>(resolve=>{notifyPending=resolve;});
  await page.route("**/*",async r=>{
   const url=new URL(r.request().url());
   if(url.hostname!=="127.0.0.1")return r.abort();
   if(parent && url.pathname==="/api/parents"){
    if(++parentReads>1){notifyPending();await new Promise<void>(resolve=>{releaseParent=resolve;});}
    return r.fulfill({json:{parentUnlockExpiresAt:new Date(Date.now()+60000).toISOString(),email:"parent@example.test",profile:{username:"fixture",supervised_until:null,family_rules:["PRIVATE FAMILY RULE"]},history:[{id:"fixture",role:"user",content:"PRIVATE FAMILY HISTORY",decision:"clear",categories:[],created_at:new Date().toISOString()}],alerts:[]}});
   }
   return r.continue();
  });
  await page.goto(`http://127.0.0.1:${addr.port}`);
  if(play){
   await page.getByRole("button",{name:"Create a room"}).click();
   await page.getByLabel("Shareable invite").waitFor();
   await page.getByRole("button",{name:"Row 1, column 1: empty"}).click();
   await page.waitForFunction(()=>Boolean((window as unknown as {fixture:{pending:boolean}}).fixture.pending));
   await page.evaluate(()=> (window as unknown as {fixture:{switchAccount():void}}).fixture.switchAccount());
   await page.getByRole("button",{name:"Create a room"}).waitFor();
   await page.evaluate(()=> (window as unknown as {fixture:{release():void}}).fixture.release());
   await page.waitForTimeout(150);
   assert.equal(await page.getByLabel("Shareable invite").count(),0);
   assert.equal(await page.locator(".game-board").count(),0);
   assert.equal(await page.getByLabel("Room invite code").inputValue(),"");
   await page.clock.install();
   for(const mode of ["error","hang"]){
    await page.evaluate(mode=>(window as unknown as {fixture:{failRefresh(mode:string):void}}).fixture.failRefresh(mode),mode);
    await page.getByRole("button",{name:"Create a room"}).click();
    await page.getByLabel("Shareable invite").waitFor();
    await page.clock.runFor(5000);
    if(mode==="hang"){
     await page.clock.runFor(5000);
     assert.equal(await page.evaluate(()=>(window as unknown as {fixture:{reads:number}}).fixture.reads),1);
     await page.clock.runFor(5000);
    }
    await page.getByRole("button",{name:"Create a room"}).waitFor();
    await page.evaluate(()=>(window as unknown as {fixture:{lateRead():void}}).fixture.lateRead());
    await page.clock.runFor(100);
    assert.equal(await page.locator(".game-board").count(),0);
    assert.equal(await page.getByLabel("Shareable invite").count(),0);
    await page.getByRole("status").filter({hasText:"Room paused"}).waitFor();
   }
   assert.deepEqual(errors,[]);
   console.log("PASS: refresh errors/timeouts clear multiplayer state, refreshes do not overlap, and late reads/realtime cannot restore it. Synthetic transport only.");
   console.log("PASS: actual multiplayer component clears room/invite on account change and ignores late move/realtime responses. Synthetic auth/API/realtime only.");
   return;
  }
  if(parent){
   await page.getByRole("button",{name:"Check existing unlock"}).click();
   await page.getByText("Review what was discussed",{exact:true}).click();
   await page.getByText("PRIVATE FAMILY HISTORY",{exact:true}).waitFor();
   await page.getByRole("button",{name:"Refresh",exact:true}).click();
   await parentPending;
   await page.evaluate(()=> (window as unknown as {fixture:{switchAccount():void}}).fixture.switchAccount());
   await page.getByRole("button",{name:"Check existing unlock"}).waitFor();
   releaseParent?.();
   await page.waitForTimeout(150);
   assert.ok(!(await page.locator("body").innerText()).includes("PRIVATE FAMILY HISTORY"));
   assert.equal(await page.locator("textarea").count(),0);
   assert.deepEqual(errors,[]);
   console.log("PASS: actual Parent controls clears family history/rules and discards late refresh after account change. Synthetic auth/API only.");
   return;
  }
  if(admin){
   await page.getByText("PRIVATE_ADMIN_EMAIL@example.test",{exact:false}).waitFor();
   await page.getByRole("button",{name:"Approve storage for reviewed code"}).click();
   await page.getByText(/Viewer storage: approved for this code/).waitFor();
   await page.getByRole("button",{name:"Revoke storage access"}).click();
   await page.getByText(/Viewer storage: not approved for this code/).waitFor();
   await page.getByRole("button",{name:"Refresh available API models"}).click();
   await page.waitForFunction(()=>Boolean((window as unknown as {fixture:{pending:boolean}}).fixture.pending));
   await page.evaluate(()=> (window as unknown as {fixture:{switchAccount():void}}).fixture.switchAccount());
   await page.getByText("Synthetic admin access revoked",{exact:true}).waitFor();
   await page.evaluate(()=> (window as unknown as {fixture:{release():void}}).fixture.release());
   await page.waitForTimeout(150);
   assert.ok(!(await page.locator("body").innerText()).includes("PRIVATE_ADMIN_EMAIL"));
   assert.equal(await page.getByRole("button",{name:"Refresh available API models"}).count(),0);
   assert.deepEqual(errors,[]);
   console.log("PASS: actual Admin component clears family data on account change/rejection and discards a late privileged response. Synthetic auth/API only.");
   return;
  }
  await page.getByRole("button",{name:/FIRST PRIVATE PROJECT/}).click({timeout:5000});
  await page.locator("#idea").fill("Synthetic private idea");
  await page.getByRole("button",{name:"Improve my project"}).click();
  await page.waitForFunction(()=>Boolean((window as unknown as {fixture:{pending:boolean}}).fixture.pending));
  await page.evaluate(()=> (window as unknown as {fixture:{switchAccount():void}}).fixture.switchAccount());
  await page.getByRole("button",{name:/FIRST PRIVATE PROJECT/}).waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>("#idea")?.value==="");
  await page.evaluate(()=> (window as unknown as {fixture:{release():void}}).fixture.release());
  await page.waitForTimeout(150);
  assert.equal(await page.locator("iframe").count(),0);
  assert.ok(!(await page.locator("body").innerText()).includes("LATE PRIVATE RESULT"));
  assert.equal(await page.locator("#idea").inputValue(),"");
  await page.getByRole("button",{name:"Sign out"}).click();
  await page.getByRole("button",{name:"Sign out"}).waitFor({state:"hidden"});
  assert.equal(await page.locator("iframe").count(),0);assert.deepEqual(errors,[]);
  console.log("PASS: actual Studio component clears account data and discards late generation after account switch/sign-out. Synthetic auth/API module; no live authentication or provider traffic.");
 }finally{await browser.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
