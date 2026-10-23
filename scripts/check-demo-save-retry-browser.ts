/** Real workshop UI with an injected transient Storage failure; no provider requests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { templateProject } from '../src/lib/demo-server/template';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.DEMO_BASE_URL||'http://127.0.0.1:3223');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const key='vibekidding-demo-projects-v1';
const fixture={id:'saved-before-failure',title:'Existing creation',emoji:'⭐',updatedAt:1,versions:[{id:'v1',html:templateProject('space collector').html,prompt:'Original',createdAt:1,mode:'template'}]};
type Harness={blocked:boolean;attempts:number;writeActual(value:string):void};
const steps:string[]=[];
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors:string[]=[],violations:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base.origin){violations.push(url.origin);return route.abort()}
  if(url.pathname.startsWith('/api/')){
   if(route.request().method()!=='GET'){violations.push(url.pathname);return route.abort()}
   return route.fulfill({json:url.pathname==='/api/demo/generate'?{enabled:true,mode:'template',publicTemplateOnly:true,limits:{promptCharacters:2000}}:{enabled:false,configured:false,localOnly:true}});
  }
  return route.continue();
 });
 await page.addInitScript(({key,fixture})=>{
  if(window!==window.top)return;
  const original=Storage.prototype.setItem;
  if(!sessionStorage.getItem('retry-test-seeded')){original.call(localStorage,key,JSON.stringify([fixture]));sessionStorage.setItem('retry-test-seeded','yes')}
  const harness:Harness={blocked:!sessionStorage.getItem('retry-test-recovered'),attempts:0,writeActual(value){original.call(localStorage,key,value)}};
  (window as unknown as {__saveRetry:Harness}).__saveRetry=harness;
  Storage.prototype.setItem=function(k,value){if(this===localStorage&&k===key){harness.attempts++;if(harness.blocked)throw new DOMException('Synthetic quota failure','QuotaExceededError')}return original.call(this,k,value)};
 },{key,fixture});
 const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),key);
 const attempts=()=>page.evaluate(()=>(window as unknown as {__saveRetry:Harness}).__saveRetry.attempts);
 try{
  await page.goto(new URL('/demo',base).href);
  await expect(page.locator('.demo-project-card')).toHaveCount(1);
  await page.locator('.demo-starter').filter({has:page.getByRole('heading',{name:'Rainbow studio',exact:true})}).click();
  await expect(page.locator('.demo-project-card')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Retry saving this tab',exact:true})).toBeVisible();
  assert.equal((await saved()).length,1);assert.equal(await attempts(),1);steps.push('failed save retains new project in tab and original persisted shelf');
  await page.getByRole('button',{name:'Retry saving this tab',exact:true}).click();
  assert.equal(await attempts(),2);assert.equal((await saved()).length,1);await expect(page.locator('.demo-project-card')).toHaveCount(2);steps.push('repeated quota failure stays unsaved with all work retained');
  await page.evaluate(()=>{(window as unknown as {__saveRetry:Harness}).__saveRetry.blocked=false;sessionStorage.setItem('retry-test-recovered','yes')});
  await page.getByRole('button',{name:'Retry saving this tab',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.locator('.demo-feedback')).toContainText('Your projects are now saved');await expect(page.getByRole('button',{name:'Retry saving this tab',exact:true})).toHaveCount(0);
  assert.equal((await saved()).length,2);assert.equal((await saved()).find((p:{id:string})=>p.id===fixture.id).versions[0].html,fixture.versions[0].html);steps.push('explicit keyboard retry saves retained work and preserves original history');
  await page.reload();await expect(page.locator('.demo-project-card')).toHaveCount(2);steps.push('recovered shelf survives reload');
  await page.evaluate(()=>(window as unknown as {__saveRetry:Harness}).__saveRetry.blocked=true);
  await page.locator('.demo-starter').filter({has:page.getByRole('heading',{name:'Animal match',exact:true})}).click();await expect(page.locator('.demo-project-card')).toHaveCount(3);
  const external=JSON.stringify([{...fixture,title:'Other tab saved this'}]);
  await page.evaluate(value=>{const harness=(window as unknown as {__saveRetry:Harness}).__saveRetry;harness.blocked=false;harness.writeActual(value)},external);
  const before=await attempts();await page.getByRole('button',{name:'Retry saving this tab',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reload saved shelf',exact:true})).toBeVisible();assert.equal(await attempts(),before);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),external);await expect(page.locator('.demo-project-card')).toHaveCount(3);steps.push('stale baseline refuses overwrite and retains in-tab changes');
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
  console.log(JSON.stringify({passed:true,steps,providerCalls:0,evidence:'Real Chrome workshop with synthetic quota failure and externally changed localStorage baseline.'}));
 }finally{
  const output=path.resolve('tests/demo-browser-artifacts/save-retry-'+new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify({steps,errors,violations},null,2));await browser.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
