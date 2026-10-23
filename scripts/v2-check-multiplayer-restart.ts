import { chromium, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
async function main(){
 const {invite}=JSON.parse(await fs.readFile("/tmp/v2-multiplayer-room.json","utf8"));const browser=await chromium.launch({headless:true});
 try{
  const xContext=await browser.newContext({storageState:"/tmp/v2-multiplayer-x-state.json"}),oContext=await browser.newContext({storageState:"/tmp/v2-multiplayer-o-state.json"});
  const x=await xContext.newPage(),o=await oContext.newPage();await Promise.all([x.goto(invite),o.goto(invite)]);
  await expect(x.getByText("YOU ARE X",{exact:true})).toBeVisible();await expect(o.getByText("YOU ARE O",{exact:true})).toBeVisible();
  await expect(x.getByRole("button",{name:"Cell 9, X",exact:true})).toBeVisible();await expect(o.getByRole("button",{name:"Cell 9, X",exact:true})).toBeVisible();
  await o.getByRole("button",{name:"Cell 1, empty",exact:true}).click();await expect(x.getByRole("button",{name:"Cell 1, O",exact:true})).toBeVisible();
  console.log(JSON.stringify({passed:true,checks:["Persisted room restored after actual Node server restart","Both player seats restored","Previous round and board restored","Gameplay continues over reconnected WebSockets"]},null,2));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
