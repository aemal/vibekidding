/** Synthetic deferred transport tests of real workshop UI. No generation POST leaves the browser. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect as baseExpect, type Page } from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.DEMO_BASE_URL||'http://127.0.0.1:3217');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const key='vibekidding-demo-projects-v1';
const output=path.resolve(`tests/demo-browser-artifacts/cancel-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const steps:{name:string;status:string;error?:string}[]=[];const violations:string[]=[];const errors:string[]=[];
const fixture=(label:string)=>({title:label,html:`<!doctype html><html><body><h1>${label}</h1></body></html>`,mode:'template',message:'Synthetic cancellation acceptance fixture'});
type Pending={aborted:boolean;resolve:(value:unknown)=>void;reject:(error:Error)=>void;bodyResolve?:(value:unknown)=>void};
type Harness={requests:Pending[]};
async function count(page:Page,n:number){await expect.poll(()=>page.evaluate(()=>(window as unknown as {__cancel:Harness}).__cancel.requests.length)).toBe(n);}
async function settle(page:Page,index:number,label:string,kind='success'){
 await page.evaluate(({index,data,kind})=>{const r=(window as unknown as {__cancel:Harness}).__cancel.requests[index];if(kind==='reject'){r.reject(new Error('Synthetic late failure'));return;}if(kind==='body'){r.bodyResolve!(data);return;}r.resolve({ok:true,json:kind==='defer-body'?()=>new Promise(resolve=>{r.bodyResolve=resolve;}):async()=>data});},{index,data:fixture(label),kind});
 // Flush the fetch/json continuations and React's next rendering frame, without retrying any action.
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
async function saved(page:Page){return page.evaluate(k=>localStorage.getItem(k),key);}
async function start(page:Page,prompt:string,revision=false){await page.getByLabel(revision?'My next change':'My idea',{exact:true}).fill(prompt);await page.getByRole('button',{name:revision?'Make this change':'Bring my idea to life',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel build',exact:true})).toBeVisible();}
async function step(name:string,action:()=>Promise<void>){try{await action();steps.push({name,status:'passed'});console.log('PASS '+name);}catch(error){steps.push({name,status:'failed',error:String(error)});throw error;}}
async function main(){
 const browser=await chromium.launch({channel:process.env.STUDIO_TEST_BROWSER||'chromium',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['data:','about:'].includes(u.protocol))return route.continue();if(u.origin!==base.origin||r.method()!=='GET'){violations.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});
 await context.addInitScript({content:`window.__cancel={requests:[]};const nativeFetch=window.fetch;window.fetch=function(input,init){if(String(input)==='/api/demo/generate'&&init?.method==='POST'){return new Promise((resolve,reject)=>{const r={resolve,reject,aborted:false};window.__cancel.requests.push(r);init.signal.addEventListener('abort',()=>{r.aborted=true;},{once:true});});}return nativeFetch.apply(this,arguments);};`});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let failure:unknown;let screenshot:Buffer|undefined;
 try{
  await page.goto(new URL('/demo',base).href);
  await step('cancel aborts transport and immediately preserves idea and empty shelf',async()=>{
   await start(page,'First pending idea');await count(page,1);await page.getByRole('button',{name:'Cancel build',exact:true}).click();await expect(page.getByLabel('My idea',{exact:true})).toHaveValue('First pending idea');await expect(page.getByRole('button',{name:'Bring my idea to life',exact:true})).toBeEnabled();assert.equal(await saved(page),null);assert.equal(await page.evaluate(()=>(window as unknown as {__cancel:Harness}).__cancel.requests[0].aborted),true);
  });
  await step('late cancelled success cannot save or unlock a newer pending request',async()=>{
   await start(page,'Second pending idea');await count(page,2);await settle(page,0,'Stale first result');assert.equal(await saved(page),null);await expect(page.getByRole('button',{name:'Cancel build',exact:true})).toBeVisible();await expect(page.getByLabel('My idea',{exact:true})).toBeDisabled();await expect(page.getByLabel('My idea',{exact:true})).toHaveValue('Second pending idea');
   await settle(page,1,'Current result');await expect(page.locator('.demo-feedback')).toContainText('Saved in this browser');const projects=JSON.parse((await saved(page))!);assert.equal(projects.length,1);assert.equal(projects[0].title,'Current result');assert.equal(projects[0].versions.length,1);
  });
  await step('late cancelled error cannot disturb newer revision or append history',async()=>{
   const before=await saved(page);await start(page,'Cancelled revision',true);await count(page,3);await page.getByRole('button',{name:'Cancel build',exact:true}).click();await start(page,'Current revision',true);await count(page,4);await settle(page,2,'unused','reject');assert.equal(await saved(page),before);await expect(page.getByRole('button',{name:'Cancel build',exact:true})).toBeVisible();await expect(page.getByLabel('My next change',{exact:true})).toHaveValue('Current revision');await expect(page.getByText('Synthetic late failure',{exact:true})).toHaveCount(0);
   await settle(page,3,'Current revision result');await expect(page.locator('.demo-feedback')).toContainText('Saved in this browser');const projects=JSON.parse((await saved(page))!);assert.equal(projects[0].versions.length,2);assert.equal(projects[0].versions[1].prompt,'Current revision');
  });
  await step('cancellation while response body is pending prevents late body save',async()=>{
   const before=await saved(page);await start(page,'Pending body revision',true);await count(page,5);await settle(page,4,'unused','defer-body');await page.getByRole('button',{name:'Cancel build',exact:true}).click();await settle(page,4,'Stale body result','body');assert.equal(await saved(page),before);await expect(page.getByLabel('My next change',{exact:true})).toHaveValue('Pending body revision');await expect(page.getByRole('button',{name:'Make this change',exact:true})).toBeEnabled();
  });
  await step('workshop unmount aborts pending transport and late success cannot save',async()=>{
   const before=await saved(page);await start(page,'Leaving workshop',true);await count(page,6);await page.getByRole('link',{name:'Back to home',exact:true}).click();await expect(page).toHaveURL(new URL('/',base).href);assert.equal(await page.evaluate(()=>(window as unknown as {__cancel:Harness}).__cancel.requests[5].aborted),true);await settle(page,5,'Unmounted stale result');assert.equal(await saved(page),before);
  });
  await step('no generation network requests or runtime errors',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);});
 }catch(error){failure=error;screenshot=await page.screenshot({fullPage:true});}finally{await browser.close();await mkdir(output,{recursive:true});if(screenshot)await writeFile(path.join(output,'failure.png'),screenshot);await writeFile(path.join(output,'report.json'),JSON.stringify({syntheticTransport:true,transportIgnoresAbort:true,steps,violations,errors,evidence:'Real workshop UI with explicitly simulated deferred fetch and response bodies. No live provider or server-abort acceptance.'},null,2));console.log(output);}
 if(failure)throw failure;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
