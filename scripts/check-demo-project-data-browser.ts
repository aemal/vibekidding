/** Real local notes UI with isolated browser storage. Quota/protocol attacks are labeled synthetic. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect as baseExpect,type Page} from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.DEMO_BASE_URL||'http://127.0.0.1:3217');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const output=path.resolve(`tests/demo-browser-artifacts/project-data-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const shelfKey='vibekidding-demo-projects-v1', dataPrefix='vibekidding-demo-data-v1:';
const note='PRIVATE_RUNTIME_NOTE_74281';
const steps:{name:string;status:string;error?:string}[]=[];const violations:string[]=[];const errors:string[]=[];const artifacts=new Map<string,Buffer>();
type Project={id:string;title:string;versions:{html:string}[]};
const frame=(p:Page)=>p.frameLocator('iframe.demo-frame');
async function shelf(p:Page):Promise<Project[]>{return p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),shelfKey);}
async function data(p:Page){return p.evaluate(prefix=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)])),dataPrefix);}
async function openProject(p:Page,title:string){await p.locator('.demo-project-card').filter({has:p.getByRole('heading',{name:title,exact:true})}).click();await expect(frame(p).locator('#note')).toBeEnabled();}
async function saveNote(p:Page,text:string){await frame(p).locator('#note').fill(text);await frame(p).getByRole('button',{name:'Save note',exact:true}).click();await expect(frame(p).locator('#status')).toHaveText('Saved in this browser for this project.');}
async function step(name:string,action:()=>Promise<void>){try{await action();steps.push({name,status:'passed'});console.log('PASS '+name);}catch(error){steps.push({name,status:'failed',error:String(error)});throw error;}}
async function main(){
 const browser=await chromium.launch({channel:process.env.STUDIO_TEST_BROWSER||'chromium',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['data:','about:','blob:'].includes(u.protocol))return route.continue();if(u.origin!==base.origin||r.method()!=='GET'){violations.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});
 await context.addInitScript({content:`window.__dataMessages=[];addEventListener('message',e=>{if(typeof e.data==='string'&&window.__dataMessages.length<100){try{const d=JSON.parse(e.data);if(d.operation)window.__dataMessages.push(d);}catch{}}});`});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let failure:unknown;let original:Project;let savedSource='';let shareUrl='';let oldSession='';
 try{
  await page.goto(new URL('/demo',base).href);
  await step('notes starter uses opaque sandbox and explicit project-scoped storage',async()=>{
   await page.locator('.demo-starter').filter({has:page.getByRole('heading',{name:'Remembering notes',exact:true})}).click();await expect(page.locator('#preview-heading')).toHaveText('My Notes');await expect(page.locator('iframe.demo-frame')).toHaveAttribute('sandbox','allow-scripts');await expect(frame(page).locator('#note')).toBeEnabled();await expect(frame(page).locator('#where')).toContainText('in this browser');assert.deepEqual(await data(page),{});original=(await shelf(page))[0];savedSource=JSON.stringify(await shelf(page));
   await expect(page.locator('iframe.demo-frame')).toBeInViewport({ratio:0.5});await frame(page).locator('#note').focus();const beforeTyping=await page.evaluate(()=>scrollY);await frame(page).locator('#note').fill(note);assert.equal(await page.evaluate(()=>scrollY),beforeTyping,'Typing must not trigger parent preview scrolling');assert.deepEqual(await data(page),{});await expect(frame(page).locator('#status')).toHaveText('Unsaved changes.');
  });
  await step('Save writes separate runtime data without changing source or history',async()=>{
   await saveNote(page,note);assert.equal(JSON.stringify(await shelf(page)),savedSource);const records=Object.values(await data(page));assert.equal(records.length,1);assert.equal(JSON.parse(records[0]!).records.note,note);artifacts.set('01-notes-saved.png',await page.screenshot());
  });
  await step('reload reopen and large play preserve saved note and isolated frame',async()=>{
   await page.reload();await openProject(page,'My Notes');await expect(frame(page).locator('#note')).toHaveValue(note);await expect(frame(page).locator('#status')).toHaveText('Note loaded.');
   const handle=await page.locator('iframe.demo-frame').elementHandle();await page.getByRole('button',{name:'Play large',exact:true}).click();await expect(frame(page).locator('#note')).toHaveValue(note);await page.getByRole('button',{name:'Back to workshop',exact:true}).click();assert.equal(await handle!.evaluate(el=>el.isConnected),true);assert.equal(JSON.stringify(await shelf(page)),savedSource);
  });
  await step('duplicate gets fresh empty runtime namespace while original remains intact',async()=>{
   await page.getByRole('button',{name:'Duplicate',exact:true}).click();await expect(frame(page).locator('#note')).toHaveValue('');const copy=(await shelf(page))[0];assert.notEqual(copy.id,original.id);await saveNote(page,'Duplicate-only note');await openProject(page,'My Notes');await expect(frame(page).locator('#note')).toHaveValue(note);assert.equal(Object.keys(await data(page)).length,2);
  });
  await step('backup HTML and shared snapshot exclude runtime note contents',async()=>{
   for(const label of ['Export backup','Export HTML']){const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const download=await downloadPromise;const file=await download.path();assert.ok(file);const content=await readFile(file,'utf8');assert.equal(content.includes(note),false);}
   await page.getByRole('button',{name:'Share playable link',exact:true}).click();await page.getByRole('button',{name:'Create playable link',exact:true}).click();const field=page.getByRole('textbox',{name:'Playable link',exact:true});await expect(field).toHaveValue(/#v1=/);shareUrl=await field.inputValue();await page.getByRole('button',{name:'Close sharing',exact:true}).click();
   assert.equal(JSON.stringify(await shelf(page)).includes(note),false);
  });
  await step('shared reader has truthful memory-only fallback and fresh imported data',async()=>{
   const recipient=await browser.newPage();recipient.on('pageerror',e=>errors.push(e.message));await recipient.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['data:','about:'].includes(u.protocol))return route.continue();if(u.origin!==base.origin||r.method()!=='GET'){violations.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});await recipient.goto(shareUrl);await recipient.getByRole('button',{name:'Play shared project',exact:true}).click();const reader=recipient.frameLocator('iframe');await expect(reader.locator('#note')).toBeEnabled();await expect(reader.locator('#note')).toHaveValue('');await expect(reader.locator('#where')).toContainText('only in memory');await reader.locator('#note').fill('Visit only');await reader.getByRole('button',{name:'Save note',exact:true}).click();await expect(reader.locator('#status')).toHaveText('Kept in memory for this visit only.');await recipient.getByRole('button',{name:'Restart play',exact:true}).click();await expect(reader.locator('#note')).toHaveValue('');
   await recipient.getByRole('link',{name:'Save a copy in workshop',exact:true}).click();await recipient.getByRole('dialog',{name:'Make an independent copy',exact:true}).getByRole('button',{name:'Save independent copy',exact:true}).click();await expect(frame(recipient).locator('#note')).toBeEnabled();await expect(frame(recipient).locator('#note')).toHaveValue('');assert.notEqual((await shelf(recipient))[0].id,original.id);await recipient.close();
  });
  await step('wrong source session and child-supplied namespace cannot change data',async()=>{
   await page.reload();await openProject(page,'My Notes');const current=await (await page.locator('iframe.demo-frame').elementHandle())!.contentFrame();assert.ok(current);
   oldSession=await page.evaluate(()=>{const messages=(window as unknown as {__dataMessages:{session:string}[]}).__dataMessages;return messages.at(-1)!.session;});
   const before=await data(page);
   // Genuine opaque sibling source knows the session but is not the bound preview window.
   await page.evaluate(session=>{const sibling=document.createElement('iframe');sibling.sandbox.add('allow-scripts');sibling.srcdoc='<script>parent.postMessage(JSON.stringify('+JSON.stringify({version:1,session,requestId:crypto.randomUUID(),operation:'record.write',key:'note',value:'WRONG_SOURCE'})+'),"*")<\/script>';document.body.append(sibling);},oldSession);
   await current.evaluate(session=>{parent.postMessage(JSON.stringify({version:1,session:crypto.randomUUID(),requestId:crypto.randomUUID(),operation:'record.write',key:'note',value:'WRONG_SESSION'}),'*');parent.postMessage(JSON.stringify({version:1,session,requestId:crypto.randomUUID(),operation:'record.write',key:'note',value:'WRONG_NAMESPACE',projectId:'other-project'}),'*');},oldSession);
   const value=await current.evaluate(()=>(window as unknown as {vibeStorage:{read:(k:string)=>Promise<string>}}).vibeStorage.read('note'));assert.equal(value,note);assert.deepEqual(await data(page),before);await page.evaluate(()=>document.querySelector('body > iframe')?.remove());
  });
  await step('restarted preview rejects old session even from current iframe',async()=>{
   await page.getByRole('button',{name:'Restart play',exact:true}).click();await expect(frame(page).locator('#note')).toHaveValue(note);const current=await (await page.locator('iframe.demo-frame').elementHandle())!.contentFrame();assert.ok(current);await current.evaluate(session=>parent.postMessage(JSON.stringify({version:1,session,requestId:crypto.randomUUID(),operation:'record.write',key:'note',value:'STALE_SESSION'}),'*'),oldSession);assert.equal(await current.evaluate(()=>(window as unknown as {vibeStorage:{read:(k:string)=>Promise<string>}}).vibeStorage.read('note')),note);
  });
  await step('synthetic quota failure keeps unsaved text and does not claim persistence',async()=>{
   const before=await data(page);await page.evaluate(prefix=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith(prefix))throw new DOMException('Synthetic quota','QuotaExceededError');return native.call(this,k,v);};},dataPrefix);await frame(page).locator('#note').fill('Unsaved quota text');await frame(page).getByRole('button',{name:'Save note',exact:true}).click();await expect(frame(page).locator('#status')).toHaveText('Save could not be confirmed. Copy your unsaved text before reopening this project to try again.');await expect(frame(page).locator('#note')).toHaveValue('Unsaved quota text');assert.deepEqual(await data(page),before);await page.reload();await openProject(page,'My Notes');await expect(frame(page).locator('#note')).toHaveValue(note);
  });
  await step('successful project deletion removes only its runtime namespace',async()=>{
   const before=await data(page);assert.equal(Object.keys(before).length,2);await page.getByRole('button',{name:'Delete My Notes',exact:true}).click();await page.getByRole('button',{name:'Keep exploring',exact:true}).click();assert.deepEqual(await data(page),before);await page.getByRole('button',{name:'Delete My Notes',exact:true}).click();await page.getByRole('button',{name:'Delete project',exact:true}).click();const after=await data(page);assert.equal(Object.keys(after).length,1);assert.equal(JSON.stringify(after).includes('Duplicate-only note'),true);assert.equal(JSON.stringify(after).includes(note),false);
  });
  await step('no unexpected network generation or runtime errors',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);});
 }catch(error){failure=error;artifacts.set('failure.png',await page.screenshot({fullPage:true}));}finally{await browser.close();await mkdir(output,{recursive:true});for(const[name,bytes]of artifacts)await writeFile(path.join(output,name),bytes);await writeFile(path.join(output,'report.json'),JSON.stringify({steps,violations,errors,evidence:'Local real browser notes persistence with isolated storage. Synthetic quota and adversarial messages. No cloud, physical device, or production acceptance.'},null,2));console.log(output);}
 if(failure)throw failure;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
