/** Actual app chip flow + explicitly synthetic Samantha callback. No voice/provider calls. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.DEMO_BASE_URL||'http://127.0.0.1:3225');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const output=path.resolve(`tests/demo-browser-artifacts/idea-insertion-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const draftKey='vibekidding-demo-drafts-v1';
const steps:{name:string;status:string}[]=[];
async function step(name:string,fn:()=>Promise<void>){await fn();steps.push({name,status:'passed'});console.log('PASS '+name)}
async function main(){
 const browser=await chromium.launch({channel:process.env.STUDIO_TEST_BROWSER||'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const violations:string[]=[];
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(r.method()==='POST'||u.origin!==base.origin){violations.push(r.method()+' '+u.origin+u.pathname);await route.abort()}else await route.continue()});
 const page=await context.newPage();let failure:unknown;
 try{
  await page.goto(new URL('/demo',base).href);
  const input=page.locator('#demo-idea'), modal=page.getByRole('dialog',{name:'Replace your idea?',exact:true});
  const chip=page.getByRole('button',{name:'Memory match',exact:true});
  const cache=()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey);
  await step('empty draft accepts suggestion directly without a build',async()=>{await chip.click();await expect(input).toHaveValue('Make an easy ocean memory matching game');await expect(modal).not.toBeVisible();assert.equal(violations.length,0)});
  await step('nonempty draft and cache remain unchanged while confirmation is open',async()=>{await input.fill('My imaginary moon rabbit story');const before=await cache();await chip.click();await expect(modal).toBeVisible();await expect(input).toHaveValue('My imaginary moon rabbit story');assert.equal(await cache(),before);await expect(modal.getByRole('button',{name:'Keep my idea',exact:true})).toBeFocused();const box=await modal.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.height<=844);await mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'mobile-confirmation.png')});});
  await step('Keep and Escape preserve the original through reload',async()=>{await modal.getByRole('button',{name:'Keep my idea',exact:true}).press('Enter');await expect(input).toBeFocused();await chip.click();await page.keyboard.press('Escape');await expect(input).toHaveValue('My imaginary moon rabbit story');await page.reload();await expect(input).toHaveValue('My imaginary moon rabbit story')});
  await step('keyboard confirmation replaces only the draft and persists without submitting',async()=>{await chip.click();await page.keyboard.press('Tab');await expect(modal.getByRole('button',{name:'Use this idea',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(input).toHaveValue('Make an easy ocean memory matching game');await expect(input).toBeFocused();await page.reload();await expect(input).toHaveValue('Make an easy ocean memory matching game');assert.equal(await page.evaluate(()=>localStorage.getItem('vibekidding-demo-projects-v1')),null)});
  await step('identical suggestion does not interrupt or change the cache',async()=>{const before=await cache();await chip.click();await expect(modal).not.toBeVisible();assert.equal(await cache(),before)});
  // Bundle the real workspace; replace only the external voice child with a manual callback fixture.
  const fixture=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{DemoWorkspace}from'./src/components/demo/DemoWorkspace';createRoot(document.getElementById('root')).render(<DemoWorkspace/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'synthetic-voice-only',setup(b){b.onLoad({filter:/DemoSamanthaVoice\.tsx$/},()=>({contents:"export function DemoSamanthaVoice({onIdea,disabled}){return <button disabled={disabled} onClick={()=>onIdea('A synthetic Samantha story suggestion')}>Use synthetic Samantha idea</button>}",loader:'tsx',resolveDir:process.cwd()}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export default function Link({children,href,...props}){return <a href={href}>{children}</a>}",loader:'tsx',resolveDir:process.cwd()}));}}]});
  const voicePage=await context.newPage();
  await voicePage.route('**/__idea_fixture*',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?fixture.outputFiles[0].text:'<div id="root"></div><script src="/__idea_fixture.js"></script>'}));
  await voicePage.goto(new URL('/__idea_fixture',base).href);
  await step('synthetic Samantha manual insertion uses the same preserve/confirm flow',async()=>{const input=voicePage.locator('#demo-idea');await input.fill('My own unfinished idea');await voicePage.getByRole('button',{name:'Talk with Samantha',exact:true}).click();const use=voicePage.getByRole('button',{name:'Use synthetic Samantha idea',exact:true});const modal=voicePage.getByRole('dialog',{name:'Replace your idea?',exact:true});await use.click();await expect(input).toHaveValue('My own unfinished idea');await modal.getByRole('button',{name:'Keep my idea',exact:true}).click();await expect(input).toHaveValue('My own unfinished idea');await use.click();await modal.getByRole('button',{name:'Use this idea',exact:true}).click();await expect(input).toHaveValue('A synthetic Samantha story suggestion');await expect(input).toBeFocused()});
  assert.deepEqual(violations,[]);
 }catch(error){failure=error;await mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'failure.png')});}
 finally{await browser.close();await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify({steps,violations,evidence:'Actual Next app for chips; synthetic voice child callback in actual Workspace bundle for Samantha insertion. No microphone, voice SDK session, generation POST, or paid provider call.'},null,2));console.log(output)}
 if(failure)throw failure;
}
main().catch(error=>{console.error(error);process.exitCode=1});
