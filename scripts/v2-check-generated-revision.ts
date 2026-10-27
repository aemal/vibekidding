import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
async function main(){
 const url=process.env.V2_GENERATED_APP_URL,existing=process.env.V2_EXISTING_TASK;
 if(!url || !existing)throw new Error("Set V2_GENERATED_APP_URL and V2_EXISTING_TASK to verify a real revision preserves an existing task.");
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
 try{
  await page.goto(url);await page.getByRole("heading",{name:"Shared Task Studio",exact:true}).waitFor();
  await page.getByRole("button",{name:`Mark ${existing} as open`,exact:true}).waitFor();
  const oldPhoto=page.getByRole("link",{name:`View photo for ${existing}`,exact:true});assert.equal((await page.request.get(new URL((await oldPhoto.getAttribute("href"))!,url).href)).status(),200);
  const title="Due date verification "+Date.now();await page.getByLabel("Task title").fill(title);await page.getByLabel("Due date").fill("2026-12-01");await page.getByRole("button",{name:"Add task",exact:true}).click();await page.getByRole("button",{name:`Mark ${title} as complete`,exact:true}).waitFor();
  await page.reload();await page.getByRole("button",{name:`Mark ${title} as complete`,exact:true}).waitFor();await page.getByRole("button",{name:`Mark ${existing} as open`,exact:true}).waitFor();
  const data=await page.request.get(new URL("api/records/tasks",url).href).then(r=>r.json());assert.equal(data.records.find((r:{data:{title:string}})=>r.data.title===title).data.dueDate,"2026-12-01");
  await page.screenshot({path:"/tmp/v2-generated-revision-desktop.png",fullPage:true});
  console.log(JSON.stringify({passed:true,checks:["liveGPTrevisionheading","pre-revisiontaskpreserved","pre-revisioncompletionpreserved","pre-revisionphotopreserved","newduedatesavesandpersistsonreload"],existingTask:existing,newTask:title},null,2));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
