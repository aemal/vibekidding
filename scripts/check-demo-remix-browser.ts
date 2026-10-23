/** Isolated browser acceptance against an existing loopback template-only app. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, expect as baseExpect, type Page } from '@playwright/test';
import { createShareUrl } from '../src/lib/demo-share';
import { templateProject } from '../src/lib/demo-server/template';
import type { Project } from '../src/components/demo/project-backup';
const expect = baseExpect.configure({ timeout: 15000 });
const base = new URL(process.env.DEMO_BASE_URL || 'http://127.0.0.1:3217');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const key = 'vibekidding-demo-projects-v1';
const output = path.resolve(`tests/demo-browser-artifacts/remix-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const canonical = templateProject('garden tic-tac-toe');
const sentinel: Project = { id:'recipient-original',title:'My existing project',emoji:'✦',updatedAt:1,versions:[{id:'recipient-version',html:'<h1>Existing work</h1>',prompt:'PRIVATE_RECIPIENT_PROMPT',createdAt:1,mode:'template'}] };
const custom = {title:'Legacy custom snapshot',html:'<!doctype html><html><body><button id="counter">Count: 0</button><script>let n=0;document.getElementById("counter").onclick=e=>e.target.textContent="Count: "+(++n);</script></body></html>'};
const legacyHash = '#v1='+gzipSync(JSON.stringify({v:1,...custom})).toString('base64url');
const steps: {name:string;status:string;error?:string}[]=[];
const violations:string[]=[]; const errors:string[]=[]; const modes:string[]=[];
const artifacts = new Map<string,Buffer>();
async function step(name:string, action:()=>Promise<void>) { try {await action();steps.push({name,status:'passed'});console.log('PASS '+name);}catch(error){steps.push({name,status:'failed',error:String(error)});throw error;} }
async function shelf(page:Page):Promise<Project[]> {return page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),key);}
const dialog = (page:Page)=>page.getByRole('dialog',{name:'Make an independent copy',exact:true});
async function main(){
 const readiness=await fetch(new URL('/api/demo/generate',base)).then(r=>r.json());
 assert.equal(readiness.mode,'template'); assert.equal(readiness.enabled,true);
 const browser=await chromium.launch({channel:process.env.STUDIO_TEST_BROWSER||'chromium',headless:true});
 let allowGenerate=false; let failure:unknown;
 async function fresh(projects:Project[]=[sentinel],quota=false){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['about:','data:'].includes(u.protocol))return route.continue();if(u.origin!==base.origin || (u.pathname.startsWith('/api/')&&r.method()!=='GET'&&!(allowGenerate&&u.pathname==='/api/demo/generate'&&r.method()==='POST'))){violations.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});
  await context.addInitScript({content:`if(window.top===window&&location.origin===${JSON.stringify(base.origin)}){if(!sessionStorage.getItem('remix-seeded')){localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(projects))});sessionStorage.setItem('remix-seeded','1');} ${quota?`const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k===${JSON.stringify(key)})throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,k,v);};`:''}}`});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
 }
 const page=await fresh(); const compact=await createShareUrl(base.origin,canonical);
 const copyUrl=(hash:string)=>new URL('/demo#copy='+hash.slice(1),base).href;
 let imported:Project;
 try{
  await step('recipient compact link hands off to inert explicit copy consent',async()=>{
   await page.goto(compact);await expect(page.getByRole('button',{name:'Play shared project',exact:true})).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
   await page.getByRole('link',{name:'Save a copy in workshop',exact:true}).click();await expect(dialog(page)).toBeVisible();await expect(dialog(page)).toContainText(canonical.title);await expect(page.locator('iframe')).toHaveCount(0);assert.deepEqual(await shelf(page),[sentinel]);
  });
  await step('cancel and review do not save or execute shared code',async()=>{
   await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog(page)).not.toBeVisible();assert.deepEqual(await shelf(page),[sentinel]);await expect(page.locator('iframe')).toHaveCount(0);
   await page.getByRole('button',{name:'Review copy link',exact:true}).click();await expect(dialog(page)).toBeVisible();assert.deepEqual(await shelf(page),[sentinel]);
  });
  await step('explicit save persists independent shared provenance and preserves shelf',async()=>{
   await dialog(page).getByRole('button',{name:'Save independent copy',exact:true}).click();await expect(page.locator('.demo-mode')).toHaveText('Shared copy');await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts');
   const saved=await shelf(page);assert.equal(saved.length,2);assert.deepEqual(saved[1],sentinel);imported=saved[0];assert.notEqual(imported.id,sentinel.id);assert.notEqual(imported.id,imported.versions[0].id);assert.equal(imported.title,canonical.title);assert.equal(imported.versions.length,1);assert.equal(imported.versions[0].mode,'shared');assert.equal(imported.versions[0].prompt,'Imported shared snapshot');assert.equal(imported.versions[0].html,canonical.html);artifacts.set('01-saved-copy.png',await page.screenshot());
  });
  await step('reload preserves copy and requires consent before another import',async()=>{
   await page.reload();await expect(dialog(page)).toBeVisible();assert.deepEqual(await shelf(page),[imported,sentinel]);await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
   await page.locator('.demo-project-card').filter({has:page.getByRole('heading',{name:canonical.title,exact:true})}).click();await expect(page.locator('.demo-mode')).toHaveText('Shared copy');
  });
  await step('canonical imported snapshot supports real template revision with history',async()=>{
   allowGenerate=true;await page.getByLabel('My next change',{exact:true}).fill('Make it blue and ocean themed');const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/demo/generate'&&r.request().method()==='POST');await page.getByRole('button',{name:'Make this change',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),200);const result=await response.json();assert.equal(result.mode,'template');modes.push(result.mode);await expect(page.locator('.demo-mode')).toHaveText('Template build');await expect(page.locator('.demo-feedback')).toContainText('Saved in this browser');allowGenerate=false;
   const saved=await shelf(page);assert.equal(saved[0].id,imported.id);assert.equal(saved[0].versions.length,2);assert.deepEqual(saved[0].versions[0],imported.versions[0]);assert.equal(saved[0].versions[1].html,result.html);assert.deepEqual(saved[1],sentinel);
  });
  await step('old v1 custom link imports exact source and plays after consent',async()=>{
   const p=await fresh();await p.goto(new URL('/demo/play'+legacyHash,base).href);await p.getByRole('link',{name:'Save a copy in workshop',exact:true}).click();await expect(dialog(p)).toContainText(custom.title);await expect(p.locator('iframe')).toHaveCount(0);await dialog(p).getByRole('button',{name:'Save independent copy',exact:true}).click();await expect(p.locator('.demo-mode')).toHaveText('Shared copy');const saved=await shelf(p);assert.equal(saved[0].versions[0].html,custom.html);assert.deepEqual(saved[1],sentinel);await p.frameLocator('iframe').getByRole('button',{name:'Count: 0',exact:true}).click();await expect(p.frameLocator('iframe').getByRole('button',{name:'Count: 1',exact:true})).toBeVisible();
  });
  await step('invalid and replaced fragments cannot import stale snapshot',async()=>{
   const p=await fresh();await p.goto(copyUrl(new URL(compact).hash));await expect(dialog(p)).toContainText(canonical.title);await p.evaluate(()=>{location.hash='copy=t1=99.invalid';});await expect(dialog(p).getByRole('alert')).toBeVisible();await expect(dialog(p).getByRole('button',{name:'Save independent copy',exact:true})).toHaveCount(0);assert.deepEqual(await shelf(p),[sentinel]);await expect(p.locator('iframe')).toHaveCount(0);
   await p.evaluate(hash=>{location.hash='copy='+hash.slice(1);},legacyHash);await expect(dialog(p)).toContainText(custom.title);await dialog(p).getByRole('button',{name:'Save independent copy',exact:true}).click();assert.equal((await shelf(p))[0].title,custom.title);
  });
  await step('quota failure truthfully retains unsaved tab copy without overwriting shelf',async()=>{
   const p=await fresh([sentinel],true);await p.goto(copyUrl(legacyHash));await dialog(p).getByRole('button',{name:'Save independent copy',exact:true}).click();await expect(p.locator('.demo-feedback')).toContainText('could not be saved');assert.deepEqual(await shelf(p),[sentinel]);artifacts.set('02-quota-failure.png',await p.screenshot());
  });
  await step('full shelf blocks import without execution or data loss',async()=>{
   const full=Array.from({length:24},(_,i)=>({...sentinel,id:'full-'+i,title:'Saved '+i,versions:[{...sentinel.versions[0],id:'version-'+i}]}));const p=await fresh(full);await p.goto(copyUrl(legacyHash));await dialog(p).getByRole('button',{name:'Save independent copy',exact:true}).click();await expect(dialog(p).getByRole('alert')).toContainText('shelf is full');assert.deepEqual(await shelf(p),full);await expect(p.locator('iframe')).toHaveCount(0);
  });
  await step('no unexpected network or runtime errors',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);assert.deepEqual(modes,['template']);});
 }catch(error){failure=error;artifacts.set('failure.png',await page.screenshot().catch(()=>Buffer.alloc(0)));}finally{await browser.close();await mkdir(output,{recursive:true});for(const[name,data]of artifacts)await writeFile(path.join(output,name),data);await writeFile(path.join(output,'report.json'),JSON.stringify({base:base.origin,syntheticFixtures:true,steps,modes,violations,errors,limitations:'Local bundled Chromium; no provider, deployment, or physical device acceptance.'},null,2));console.log(output);}
 if(failure)throw failure;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
