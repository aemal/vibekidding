/** Local browser acceptance of explicit private app-data backups. No provider calls. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect as baseExpect,type Page} from '@playwright/test';
import {MAX_DATA_BACKUP_BYTES} from '../src/lib/demo-data-backup';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.DEMO_BASE_URL||'http://127.0.0.1:3217');assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const output=path.resolve(`tests/demo-browser-artifacts/data-backup-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const shelfKey='vibekidding-demo-projects-v1',prefix='vibekidding-demo-data-v1:',privateNote='PRIVATE_APP_DATA_BACKUP_6318';
const steps:{name:string;status:string;error?:string}[]=[];const violations:string[]=[];const errors:string[]=[];const artifacts=new Map<string,Buffer>();
const dialog=(p:Page)=>p.getByRole('dialog',{name:'Saved app data',exact:true});
const preview=(p:Page)=>p.frameLocator('iframe.demo-frame');
async function data(p:Page){return p.evaluate(prefix=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)])),prefix);}
async function open(p:Page,title:string){await p.locator('.demo-project-card').filter({has:p.getByRole('heading',{name:title,exact:true})}).click();await expect(preview(p).locator('#note')).toBeEnabled();}
async function tools(p:Page){await p.getByRole('button',{name:'Saved app data',exact:true}).click();await expect(dialog(p)).toBeVisible();}
async function upload(p:Page,text:string){await dialog(p).getByLabel('Import app data backup',{exact:true}).setInputFiles({name:'fixture-app-data.json',mimeType:'application/json',buffer:Buffer.from(text)});}
async function save(p:Page,text:string){await preview(p).locator('#note').fill(text);await preview(p).getByRole('button',{name:'Save note',exact:true}).click();await expect(preview(p).locator('#status')).toHaveText('Saved in this browser for this project.');}
async function step(name:string,action:()=>Promise<void>){try{await action();steps.push({name,status:'passed'});console.log('PASS '+name);}catch(error){steps.push({name,status:'failed',error:String(error)});throw error;}}
async function main(){
 const browser=await chromium.launch({channel:process.env.STUDIO_TEST_BROWSER||'chromium',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['data:','about:','blob:'].includes(u.protocol))return route.continue();if(u.origin!==base.origin||r.method()!=='GET'){violations.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let failure:unknown;let exported='';let sourceShelf='';let originalKey='';let targetKey='';
 try{
  await page.goto(new URL('/demo',base).href);
  await page.locator('.demo-starter').filter({has:page.getByRole('heading',{name:'Remembering notes',exact:true})}).click();await expect(preview(page).locator('#note')).toBeEnabled();await save(page,privateNote);
  await step('separate data export contains only portable records and explicit privacy notice',async()=>{
   originalKey=Object.keys(await data(page))[0];await tools(page);const pending=page.waitForEvent('download');await dialog(page).getByRole('button',{name:'Export app data JSON',exact:true}).click();const download=await pending;const file=await download.path();assert.ok(file);exported=await readFile(file,'utf8');assert.deepEqual(JSON.parse(exported),{format:'vibekidding-app-data',version:1,records:{note:privateNote}});await expect(dialog(page)).toContainText('Keep this file private');await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await step('code backup and playable snapshot still exclude private app data',async()=>{
   const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const file=await(await pending).path();assert.ok(file);assert.equal((await readFile(file,'utf8')).includes(privateNote),false);
   await page.getByRole('button',{name:'Share playable link',exact:true}).click();await page.getByRole('button',{name:'Create playable link',exact:true}).click();const field=page.getByRole('textbox',{name:'Playable link',exact:true});await expect(field).toHaveValue(/#v1=/);const link=await field.inputValue();const {decodeShareFragment}=await import('../src/lib/demo-share');assert.equal((await decodeShareFragment(new URL(link).hash)).html.includes(privateNote),false);await page.getByRole('button',{name:'Close sharing',exact:true}).click();
  });
  await step('fresh duplicate import requires preview and cancellation leaves data untouched',async()=>{
   await page.getByRole('button',{name:'Duplicate',exact:true}).click();await expect(preview(page).locator('#note')).toHaveValue('');sourceShelf=(await page.evaluate(k=>localStorage.getItem(k),shelfKey))!;const before=await data(page);await tools(page);await upload(page,exported);const review=dialog(page).getByRole('region',{name:'App data import review'});await expect(review).toContainText('1 saved key');await expect(review).toContainText('note');await expect(review).not.toContainText(privateNote);assert.deepEqual(await data(page),before);await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);assert.deepEqual(await data(page),before);
  });
  await step('confirmed keyboard restore persists after reload without changing source or original',async()=>{
   await tools(page);await upload(page,exported);await dialog(page).getByRole('button',{name:'Replace saved app data',exact:true}).press('Enter');await expect(dialog(page)).toHaveCount(0);await expect(preview(page).locator('#note')).toHaveValue(privateNote);assert.equal(await page.evaluate(k=>localStorage.getItem(k),shelfKey),sourceShelf);const records=await data(page);targetKey=Object.keys(records).find(k=>k!==originalKey)!;assert.ok(targetKey);assert.equal(JSON.parse(records[originalKey]!).records.note,privateNote);await page.reload();await open(page,'My Notes (copy)');await expect(preview(page).locator('#note')).toHaveValue(privateNote);
  });
  await step('corrupt and oversized files cannot replace existing data',async()=>{
   const before=await data(page);await tools(page);for(const text of ['{bad',JSON.stringify({format:'vibekidding-app-data',version:99,records:{note:'bad'}}),'x'.repeat(MAX_DATA_BACKUP_BYTES+1)]){await upload(page,text);await expect(dialog(page).getByRole('alert')).toBeVisible();await expect(dialog(page).getByRole('button',{name:'Replace saved app data',exact:true})).toHaveCount(0);assert.deepEqual(await data(page),before);}await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
  });
  await step('concurrent tab data change rejects stale import baseline with no overwrite',async()=>{
   await tools(page);await upload(page,exported);await expect(dialog(page).getByRole('region',{name:'App data import review'})).toBeVisible();const other=await context.newPage();await other.goto(new URL('/demo',base).href);await open(other,'My Notes (copy)');await save(other,'Newer saved note');const newer=await data(other);await dialog(page).getByRole('button',{name:'Replace saved app data',exact:true}).click();await expect(dialog(page).getByRole('alert')).toContainText('saved data changed');assert.deepEqual(await data(page),newer);await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();await other.close();
  });
  await step('cancelled slow file read cannot restore or show review for another project',async()=>{
   await page.evaluate(()=>{const native=File.prototype.text;(window as unknown as {__releaseFile:()=>void}).__releaseFile=()=>{};File.prototype.text=function(){return new Promise(resolve=>{(window as unknown as {__releaseFile:()=>void}).__releaseFile=()=>{File.prototype.text=native;void native.call(this).then(resolve);};});};});
   const before=await data(page);await tools(page);await upload(page,exported);await expect(dialog(page).getByRole('status')).toContainText('Reading app data backup');await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();await open(page,'My Notes');await tools(page);await page.evaluate(()=>(window as unknown as {__releaseFile:()=>void}).__releaseFile());await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(dialog(page).getByRole('region',{name:'App data import review'})).toHaveCount(0);await expect(dialog(page).getByRole('button',{name:'Replace saved app data',exact:true})).toHaveCount(0);assert.deepEqual(await data(page),before);await page.keyboard.press('Escape');
  });
  await step('mobile dialog stays within viewport and empty replacement is explicit',async()=>{
   await open(page,'My Notes (copy)');await page.setViewportSize({width:390,height:844});await tools(page);await upload(page,JSON.stringify({format:'vibekidding-app-data',version:1,records:{}}));await expect(dialog(page)).toContainText('empty backup will clear');const box=await dialog(page).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.height<=844);artifacts.set('01-mobile-data-review.png',await page.screenshot());await dialog(page).getByRole('button',{name:'Replace saved app data',exact:true}).click();await expect(preview(page).locator('#note')).toHaveValue('');const records=await data(page);assert.deepEqual(JSON.parse(records[targetKey]!).records,{});assert.equal(JSON.parse(records[originalKey]!).records.note,privateNote);
  });
  await step('no unexpected network calls or runtime errors',async()=>{assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);});
 }catch(error){failure=error;artifacts.set('failure.png',await page.screenshot({fullPage:true}));}finally{await browser.close();await mkdir(output,{recursive:true});for(const[name,bytes]of artifacts)await writeFile(path.join(output,name),bytes);await writeFile(path.join(output,'report.json'),JSON.stringify({steps,violations,errors,evidence:'Isolated local browser storage and real file download/import. Synthetic malformed files and deferred File.text for cancellation. No cloud or physical device acceptance.'},null,2));console.log(output);}
 if(failure)throw failure;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
