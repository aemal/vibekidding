import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
async function main(){
 const origin=new URL(process.env.STUDIO_TEST_URL || 'http://localhost:3217');
 assert.ok(['localhost','127.0.0.1'].includes(origin.hostname),'Fixture runner only accepts loopback URLs');
 const channel=process.env.STUDIO_TEST_BROWSER || 'chrome';
 assert.ok(['chrome','chromium'].includes(channel),'Use chrome or chromium for the parent fixture');
 const browser=await chromium.launch({channel,headless:true});
 try{
  const page=await browser.newPage();
  let deny=false, deletionRequested=false;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin.origin) return route.abort();
   if(url.pathname==='/api/parents'){
    if(route.request().method()==='POST' && route.request().postDataJSON()?.operation==='request-deletion') {
     assert.deepEqual(route.request().postDataJSON(),{operation:'request-deletion',confirmed:true});
     deletionRequested=true;return route.fulfill({json:{ok:true}});
    }
    if(route.request().method()!=='GET') return route.abort();
    if(deny) return route.fulfill({status:403,json:{error:'Synthetic expired unlock'}});
    return route.fulfill({json:{parentUnlockExpiresAt:new Date(Date.now()+2500).toISOString(),email:'synthetic@example.test',profile:{username:'fixture',supervised_until:null,family_rules:[]},history:[{id:'fixture',role:'user',content:'SYNTHETIC PRIVATE HISTORY',decision:'clear',categories:[],created_at:new Date().toISOString()}],alerts:[],inventory:{projects:2,published_projects:1,activity:1,records:0,usage_records:3,unsettled_usage:1,notification_jobs:1,active_mail_leases:1,rooms:0}}});
   }
   if(url.pathname.startsWith('/api/')) return route.abort();
   return route.continue();
  });
  await page.goto(origin.origin+'/parents');
  await page.getByRole('button',{name:'Check existing unlock'}).click();
  await page.getByText('Review what was discussed',{exact:true}).click();
  await page.getByText('SYNTHETIC PRIVATE HISTORY',{exact:true}).waitFor();
  await page.getByText('2 projects (1 published)',{exact:true}).waitFor();
  assert.match(await page.getByRole('link',{name:'Contact Aemal about deletion'}).getAttribute('href') || '', /^mailto:a@aemalsayer\.com/);
  await page.getByText('SYNTHETIC PRIVATE HISTORY',{exact:true}).waitFor({state:'hidden',timeout:8000});
  await page.getByRole('button',{name:'Check existing unlock'}).waitFor();
  await page.getByText('2 projects (1 published)',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Check existing unlock'}).click();
  await page.getByText('Review what was discussed',{exact:true}).click();
  await page.getByText('SYNTHETIC PRIVATE HISTORY',{exact:true}).waitFor();
  deny=true;
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByText('SYNTHETIC PRIVATE HISTORY',{exact:true}).waitFor({state:'hidden'});
  deny=false;
  await page.getByRole('button',{name:'Check existing unlock'}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Request deletion review and stop access',exact:true}).click();
  await page.getByText('Deletion review requested. Building and public sharing are stopped. Your account has not yet been erased. The administrator can see your request.',{exact:true}).waitFor();
  assert.equal(deletionRequested,true);
  await page.getByText('2 projects (1 published)',{exact:true}).waitFor({state:'hidden'});
  console.log(`PASS: parent expiry, rejection and confirmed deletion request clear displayed synthetic data. ${channel} ${browser.version()}. API responses mocked; no OTP or real account acceptance.`);
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
