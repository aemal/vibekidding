import { chromium, expect } from "@playwright/test";
import jsQR from "jsqr";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
async function main(){
 const url=process.env.V2_GENERATED_APP_URL;if(!url)throw new Error("Set V2_GENERATED_APP_URL to the live generated multiplayer app.");
 const xBrowser=await chromium.launch({headless:true}),oBrowser=await chromium.launch({headless:true});
 const xContext=await xBrowser.newContext({viewport:{width:1280,height:900}}),oContext=await oBrowser.newContext({viewport:{width:390,height:844}});
 const x=await xContext.newPage(),o=await oContext.newPage();let framesX=0,framesO=0;const errors:string[]=[];
 x.on("websocket",ws=>ws.on("framereceived",()=>framesX++));o.on("websocket",ws=>ws.on("framereceived",()=>framesO++));x.on("pageerror",e=>errors.push(e.message));o.on("pageerror",e=>errors.push(e.message));
 try{
  await x.goto(url);await x.getByRole("button",{name:"Create a room",exact:true}).click();await x.waitForURL(/room=/);
  const invite=await x.getByLabel("Invite link",{exact:true}).inputValue();assert.ok(new URL(invite).searchParams.get("room"));assert.ok(!invite.includes("playerId"));
  await o.goto(invite);await expect(x.getByText("YOU ARE X",{exact:true})).toBeVisible();await expect(o.getByText("YOU ARE O",{exact:true})).toBeVisible();
  const qr= x.getByRole("img",{name:/QR code for room/});await expect(qr).toBeVisible();
  const pixels=await qr.evaluate(async element=>{const img=element as HTMLImageElement;await img.decode();const canvas=document.createElement("canvas");canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const context=canvas.getContext("2d")!;context.drawImage(img,0,0);return {width:canvas.width,height:canvas.height,pixels:Array.from(context.getImageData(0,0,canvas.width,canvas.height).data)};});
  assert.equal(jsQR(new Uint8ClampedArray(pixels.pixels),pixels.width,pixels.height)?.data,invite);
  const spectatorContext=await xBrowser.newContext();const spectator=await spectatorContext.newPage();await spectator.goto(invite);await expect(spectator.getByText("SPECTATING",{exact:true})).toBeVisible();
  await expect(spectator.getByRole("button",{name:"Cell 1, empty",exact:true})).toBeDisabled();
  const move=async(player:typeof x,cell:number,mark:string)=>{await player.getByRole("button",{name:`Cell ${cell}, empty`,exact:true}).click();await expect(x.getByRole("button",{name:`Cell ${cell}, ${mark}`,exact:true})).toBeVisible();await expect(o.getByRole("button",{name:`Cell ${cell}, ${mark}`,exact:true})).toBeVisible();};
  await move(x,1,"X");await move(o,4,"O");await move(x,2,"X");await o.reload();await expect(o.getByRole("button",{name:"Cell 2, X",exact:true})).toBeVisible();await move(o,5,"O");await move(x,3,"X");
  await expect(x.getByText("You won! Nicely played.",{exact:true})).toBeVisible();await expect(o.getByText("X wins this round!",{exact:true})).toBeVisible();
  await expect(spectator.getByRole("button",{name:"Cell 3, X",exact:true})).toBeVisible();
  await x.screenshot({path:"/tmp/v2-multiplayer-desktop-win.png",fullPage:true});await o.screenshot({path:"/tmp/v2-multiplayer-mobile-win.png",fullPage:true});
  assert.ok(await o.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Mobile layout overflows horizontally");
  await x.getByRole("button",{name:"Play again",exact:true}).click();await expect(o.getByRole("button",{name:"Cell 1, empty",exact:true})).toBeVisible();await move(x,9,"X");
  await xContext.storageState({path:"/tmp/v2-multiplayer-x-state.json"});await oContext.storageState({path:"/tmp/v2-multiplayer-o-state.json"});await fs.writeFile("/tmp/v2-multiplayer-room.json",JSON.stringify({invite}));
  assert.ok(framesX>=6 && framesO>=6);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,invite,framesX,framesO,checks:["Two independent Chromium browsers assigned X and O","QR decodes to room link","Third participant is spectator","Moves synchronize through actual WebSockets","Reload retains board and seat","X wins and both browsers agree","Rematch synchronizes","Mobile has no horizontal overflow"]},null,2));
 }finally{await xBrowser.close();await oBrowser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
