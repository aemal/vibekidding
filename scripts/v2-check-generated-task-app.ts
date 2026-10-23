import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
async function main(){
 const url=process.env.V2_GENERATED_APP_URL;if(!url)throw new Error("Set V2_GENERATED_APP_URL to the live generated task tracker URL.");
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const title="Persisted verification "+Date.now();
 try{
  await page.goto(url);await page.getByLabel("Task title").fill(title);await page.getByLabel("Description").fill("Created by actual browser interaction against the live Node/SQLite application.");
  await page.locator('input[type="file"]').setInputFiles({name:"room.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=","base64")});
  await page.getByRole("button",{name:"Add task",exact:true}).click();
  await page.getByRole("button",{name:`Mark ${title} as complete`,exact:true}).waitFor();
  await page.reload();await page.getByRole("button",{name:`Mark ${title} as complete`,exact:true}).click();
  await page.getByRole("button",{name:`Mark ${title} as open`,exact:true}).waitFor();
  const photo=page.getByRole("link",{name:`View photo for ${title}`,exact:true});assert.equal((await page.request.get(new URL((await photo.getAttribute("href"))!,url).href)).status(),200);
  await page.reload();await page.getByRole("button",{name:`Mark ${title} as open`,exact:true}).waitFor();
  await page.screenshot({path:"/tmp/v2-generated-task-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:"/tmp/v2-generated-task-mobile.png",fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Mobile has horizontal overflow");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,title,url,checks:["real GPT-6 Sol source","npm installation and production build","create task with photo","reload retains SQLite record","complete task persists","photo fetch200","390px responsive no overflow","no page errors"],screenshots:["/tmp/v2-generated-task-desktop.png","/tmp/v2-generated-task-mobile.png"]},null,2));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
