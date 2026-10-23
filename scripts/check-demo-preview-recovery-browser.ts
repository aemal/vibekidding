/** Recovery UI with synthetic failing apps and explicitly mocked AI transport; no paid calls. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect as baseExpect,type Page} from '@playwright/test';
import {PREVIEW_PROBLEM_MESSAGE,PREVIEW_REPAIR_PROMPT} from '../src/lib/demo-preview-diagnostics';
import {notesStarter} from '../src/lib/demo-notes-starter';
const expect=baseExpect.configure({timeout:15000});const base=new URL(process.env.DEMO_BASE_URL||'http://127.0.0.1:3217');assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const output=path.resolve(`tests/demo-browser-artifacts/preview-recovery-${new Date().toISOString().replace(/[:.]/g,'-')}`),key='vibekidding-demo-projects-v1';
const secret='PRIVATE_RUNTIME_EXCEPTION_84321';
const healthy='<!doctype html><html><body><button id="counter">Count: 0</button><script>let n=0;document.querySelector("button").onclick=e=>e.target.textContent="Count: "+(++n);</script></body></html>';
const broken=`<!doctype html><html><body><button id="throw">Throw error</button><button id="reject">Reject promise</button><script>document.getElementById('throw').onclick=()=>{throw new Error('${secret}')};document.getElementById('reject').onclick=()=>{void Promise.reject(new Error('${secret}_REJECTION'))};</script></body></html>`;
const version=(id:string,html:string)=>({id,html,prompt:'Synthetic fixture '+id,mode:'ai',createdAt:1});
const fixtures=[{id:'healthy-project',title:'Healthy fixture',emoji:'✦',updatedAt:1,versions:[version('healthy',healthy)]},{id:'broken-project',title:'Broken fixture',emoji:'✦',updatedAt:1,versions:[version('earlier',healthy),version('broken',broken)]},{id:'notes-project',title:notesStarter.title,emoji:'✦',updatedAt:1,versions:[version('notes',notesStarter.html)]}];
const steps:{name:string;status:string;error?:string}[]=[];const violations:string[]=[];const pageErrors:string[]=[];const posts:unknown[]=[];let allowRepair=false;const artifacts=new Map<string,Buffer>();
const panel=(p:Page)=>p.getByRole('region',{name:'Preview recovery',exact:true});
async function open(p:Page,title:string){await p.locator('.demo-project-card').filter({has:p.getByRole('heading',{name:title,exact:true})}).click();await expect(p.locator('iframe.demo-frame')).toBeVisible();}
async function child(p:Page){const iframe=p.locator('iframe.demo-frame');await iframe.scrollIntoViewIfNeeded();await expect(iframe).toBeInViewport({ratio:0.5});const frame=await(await iframe.elementHandle())!.contentFrame();assert.ok(frame);await frame.waitForLoadState('load');return frame;}
async function session(p:Page){const source=await p.locator('iframe.demo-frame').getAttribute('srcdoc');assert.ok(source);const match=source.match(/const session="([a-f0-9-]+)"/);assert.ok(match);return match[1];}
async function messages(p:Page){return p.evaluate(()=>(window as unknown as {__problems:Record<string,unknown>[]}).__problems);}
async function flush(p:Page){await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function step(name:string,action:()=>Promise<void>){try{await action();steps.push({name,status:'passed'});console.log('PASS '+name);}catch(error){steps.push({name,status:'failed',error:String(error)});throw error;}}
const pointerDiagnostics: unknown[] = [];
async function observePointerFrame(page: Page) {
  const frame = await (await page.locator('iframe.demo-frame').elementHandle())?.contentFrame();
  assert.ok(frame);
  await frame.waitForLoadState('load');
  const lifecycle: unknown[] = [];
  page.on('framenavigated', changed => { if (changed === frame && lifecycle.length < 20) lifecycle.push({ event: 'navigated', at: Date.now() }); });
  page.on('framedetached', changed => { if (changed === frame && lifecycle.length < 20) lifecycle.push({ event: 'detached', at: Date.now() }); });
  await page.evaluate(() => {
    const events: unknown[] = [];
    (window as unknown as { __parentPointer: unknown[] }).__parentPointer = events;
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      if (events.length >= 20) return;
      const e = event as MouseEvent;
      const target = event.target as HTMLElement;
      events.push({ type, tag: target.tagName, id: target.id, x: e.clientX, y: e.clientY });
    }, true);
  });
  await frame.evaluate(() => {
    const state = { epoch: performance.timeOrigin, events: [] as unknown[] };
    (window as unknown as { __pointerEvidence: typeof state }).__pointerEvidence = state;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown']) {
      document.addEventListener(type, event => {
        if (state.events.length >= 40) return;
        const target = event.target as HTMLElement;
        const pointer = event as MouseEvent;
        state.events.push({ type, id: target.id, label: target.getAttribute('aria-label'), text: target.textContent?.slice(0, 70), x: pointer.clientX, y: pointer.clientY, at: performance.now() });
      }, true);
    }
  });
  return async (label: string) => {
    pointerDiagnostics.push({ label, lifecycle: [...lifecycle], frameDetached: frame.isDetached(), parent: await page.evaluate(() => ({ x: scrollX, y: scrollY, active: document.activeElement?.tagName, events: (window as unknown as { __parentPointer: unknown[] }).__parentPointer })), box: await page.locator('iframe.demo-frame').boundingBox(), child: await frame.evaluate(() => ({ evidence: (window as unknown as { __pointerEvidence: unknown }).__pointerEvidence, ready: document.readyState, x: scrollX, y: scrollY, active: document.activeElement?.outerHTML.slice(0, 200), status: document.querySelector('#status')?.textContent, cells: Array.from(document.querySelectorAll('#tic-board button')).map(b => b.textContent) })).catch(error => ({ error: String(error) })) });
  };
}


async function main(){
 const readiness=await fetch(new URL('/api/demo/generate',base)).then(r=>r.json());assert.equal(readiness.mode,'template');const browser=await chromium.launch({channel:process.env.STUDIO_TEST_BROWSER||'chromium',headless:true});
 async function fresh(ai:boolean){const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['about:','data:','blob:'].includes(u.protocol))return route.continue();if(u.origin===base.origin&&u.pathname==='/api/demo/generate'){if(r.method()==='GET'&&ai)return route.fulfill({json:{...readiness,enabled:true,mode:'ai',publicTemplateOnly:false,message:'Synthetic AI readiness'}});if(r.method()==='POST'){posts.push(r.postDataJSON());if(ai&&allowRepair)return route.fulfill({json:{title:'Repaired fixture',html:healthy,mode:'ai'}});}}if(u.origin!==base.origin||r.method()!=='GET'){violations.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});await context.addInitScript({content:`window.__problems=[];addEventListener('message',e=>{if(typeof e.data==='string'){try{const d=JSON.parse(e.data);if(d.operation==='preview.problem'&&window.__problems.length<200)window.__problems.push(d);}catch{}}});if(window.top===window&&location.origin===${JSON.stringify(base.origin)}&&!sessionStorage.getItem('recovery-seeded')){localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(fixtures))});sessionStorage.setItem('recovery-seeded','1');}`});const p=await context.newPage();p.on('pageerror',e=>pageErrors.push(e.message));await p.goto(new URL('/demo',base).href);await expect(p.locator('.demo-readiness')).toContainText(ai?'AI mode configured':'Templates ready');return p;}
 const page=await fresh(true);let activePage=page;let failure:unknown;
 try{
  await step('healthy app plays without recovery notice or automatic generation',async()=>{await open(page,'Healthy fixture');const f=await child(page);await f.getByRole('button',{name:'Count: 0',exact:true}).click();await expect(f.getByRole('button',{name:'Count: 1',exact:true})).toBeVisible();await expect(panel(page)).toHaveCount(0);assert.equal(posts.length,0);});
  await step('wrong source session and extra payload fields cannot trigger recovery',async()=>{const s=await session(page);const f=await child(page);await page.evaluate(session=>{const node=document.createElement('iframe');node.id='wrong-source';node.sandbox.add('allow-scripts');node.srcdoc='<script>parent.postMessage(JSON.stringify('+JSON.stringify({version:1,session,operation:'preview.problem',category:'runtime-error'})+'),"*")<\/script>';document.body.append(node);},s);await f.evaluate(session=>{parent.postMessage(JSON.stringify({version:1,session:crypto.randomUUID(),operation:'preview.problem',category:'runtime-error'}),'*');parent.postMessage(JSON.stringify({version:1,session,operation:'preview.problem',category:'runtime-error',message:'PRIVATE_EXTRA'}),'*');},s);await flush(page);await expect(panel(page)).toHaveCount(0);await page.evaluate(()=>document.getElementById('wrong-source')?.remove());});
  await step('real runtime throw reports generic notice without leaking exception or remounting',async()=>{await open(page,'Broken fixture');await page.evaluate(()=>{(window as unknown as {__problems:unknown[]}).__problems=[];});const handle=await page.locator('iframe.demo-frame').elementHandle();const f=await child(page);const epoch=await f.evaluate(()=>performance.timeOrigin);await f.getByRole('button',{name:'Throw error',exact:true}).click();await expect(panel(page)).toContainText(PREVIEW_PROBLEM_MESSAGE);assert.equal(await handle!.evaluate(el=>el.isConnected),true);assert.equal(await f.evaluate(()=>performance.timeOrigin),epoch);assert.equal((await page.locator('body').innerText()).includes(secret),false);const wire=await messages(page);assert.equal(wire.length,1);assert.deepEqual(Object.keys(wire[0]).sort(),['category','operation','session','version']);assert.equal(wire[0].category,'runtime-error');assert.equal(JSON.stringify(wire).includes(secret),false);assert.equal(posts.length,0);});
  await step('unhandled rejection is generic and SDK caps repeated diagnostics at three',async()=>{const f=await child(page);await f.getByRole('button',{name:'Reject promise',exact:true}).click();await expect.poll(async()=>(await messages(page)).length).toBe(2);assert.equal((await messages(page))[1].category,'unhandled-rejection');await f.evaluate(()=>{for(let i=0;i<30;i++)dispatchEvent(new ErrorEvent('error',{message:'PRIVATE_FLOOD'}));});await flush(page);assert.equal((await messages(page)).length,3);await expect(panel(page)).toHaveCount(1);assert.equal(posts.length,0);});
  await step('repair preparation protects typed idea and requires explicit build before mocked POST',async()=>{await page.getByLabel('My next change',{exact:true}).fill('Keep my own idea');page.once('dialog',d=>d.dismiss());await panel(page).getByRole('button',{name:'Prepare repair',exact:true}).click();await expect(page.getByLabel('My next change',{exact:true})).toHaveValue('Keep my own idea');assert.equal(posts.length,0);page.once('dialog',d=>d.accept());await panel(page).getByRole('button',{name:'Prepare repair',exact:true}).click();await expect(page.getByLabel('My next change',{exact:true})).toHaveValue(PREVIEW_REPAIR_PROMPT);assert.equal(posts.length,0);allowRepair=true;await page.getByRole('button',{name:'Make this change',exact:true}).click();await expect(page.locator('.demo-feedback')).toContainText('Saved in this browser');allowRepair=false;assert.equal(posts.length,1);assert.equal((posts[0] as {prompt:string}).prompt,PREVIEW_REPAIR_PROMPT);await expect(panel(page)).toHaveCount(0);});
  await step('template recovery restores previous source with history and no generation',async()=>{const p=await fresh(false);activePage=p;await open(p,'Broken fixture');const record=await observePointerFrame(p);await record('template before parent readiness');const f=await child(p);await record('template before pointer');await f.getByRole('button',{name:'Throw error',exact:true}).click();await record('template after pointer');await expect(panel(p)).toBeVisible();await expect(panel(p).getByRole('button',{name:'Prepare repair',exact:true})).toHaveCount(0);await panel(p).getByRole('button',{name:'Restore previous version',exact:true}).click();await expect(panel(p)).toHaveCount(0);const saved=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key);assert.equal(saved[0].versions.length,3);assert.equal(saved[0].versions[2].html,healthy);await(await child(p)).getByRole('button',{name:'Count: 0',exact:true}).click();await expect((await child(p)).getByRole('button',{name:'Count: 1',exact:true})).toBeVisible();const stale=await session(p);await p.getByRole('button',{name:'Restart play',exact:true}).click();await(await child(p)).evaluate(session=>parent.postMessage(JSON.stringify({version:1,session,operation:'preview.problem',category:'runtime-error'}),'*'),stale);await flush(p);await expect(panel(p)).toHaveCount(0);activePage=page;await p.close();});
  await step('healthy saved notes still persist without false recovery notice',async()=>{await open(page,notesStarter.title);const f=await child(page);await f.locator('#note').fill('Recovery-safe note');await f.getByRole('button',{name:'Save note',exact:true}).click();await expect(f.locator('#status')).toHaveText('Saved in this browser for this project.');await page.getByRole('button',{name:'Restart play',exact:true}).click();await expect((await child(page)).locator('#note')).toHaveValue('Recovery-safe note');await expect(panel(page)).toHaveCount(0);});
  await step('only expected synthetic app errors and explicitly mocked repair occurred',async()=>{assert.deepEqual(violations,[]);assert.equal(posts.length,1);assert.ok(pageErrors.every(e=>e.includes(secret)),JSON.stringify(pageErrors));assert.ok(pageErrors.length>=3);});
 }catch(error){failure=error;artifacts.set('failure.png',await activePage.screenshot({fullPage:true}));}finally{await browser.close();await mkdir(output,{recursive:true});for(const[name,bytes]of artifacts)await writeFile(path.join(output,name),bytes);await writeFile(path.join(output,'report.json'),JSON.stringify({steps,pointerDiagnostics,violations,expectedSyntheticPageErrors:pageErrors,mockedRepairPosts:posts.length,evidence:'Local real UI with synthetic failing apps. AI readiness and explicit repair response mocked; no paid calls. Error text is deliberately synthetic.'},null,2));console.log(output);}if(failure)throw failure;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
