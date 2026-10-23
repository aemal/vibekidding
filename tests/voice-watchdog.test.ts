import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { VoicePolicy } from "../src/lib/studio/voice-policy";
import { watchVoiceSession } from "../src/lib/studio/voice-watchdog";
test("watchdog waits for authorization and shuts both transports at server deadline", async()=>{
 let now=0, client=0, provider=0;
 const watcher=watchVoiceSession(new VoicePolicy(1000,()=>now),{
  authorize:async()=>true, closeClient:()=>{client++;},closeProvider:()=>{provider++;},pollMs:10,
 });
 try {
  assert.equal(watcher.isActive(),false);
  assert.equal(await watcher.ready,true);
  now=1000;await delay(30);
  assert.equal(watcher.isActive(),false);
  assert.equal(client,1);assert.equal(provider,1);
  watcher.stop();assert.equal(provider,1);
 } finally {watcher.stop();}
});
test("revocation or authorization error closes both even if client cleanup throws",async()=>{
 for(const fails of [false,true]){
  let allowed=true, provider=0;
  const w=watchVoiceSession(new VoicePolicy(1000,()=>0),{
   authorize:async()=>{if(!allowed&&fails)throw new Error("private detail");return allowed;},
   closeClient:()=>{throw new Error("socket failure");},
   closeProvider:async()=>{provider++;throw new Error("async socket failure");},pollMs:10,
  });
  try {assert.equal(await w.ready,true);allowed=false;await delay(35);assert.equal(w.isActive(),false);assert.equal(provider,1);}
  finally{w.stop();}
 }
});
test("hanging authorization is cancelled and late success cannot reopen session",async()=>{
 let finish:(value:boolean)=>void=()=>{}, signal:AbortSignal|undefined, provider=0;
 const w=watchVoiceSession(new VoicePolicy(1000,()=>0),{
  authorize:s=>{signal=s;return new Promise(resolve=>{finish=resolve;});},
  closeClient:()=>{},closeProvider:()=>{provider++;},pollMs:10,authorizationTimeoutMs:20,
 });
 try {
  assert.equal(await w.ready,false);assert.equal(signal?.aborted,true);
  finish(true);await delay(10);
  assert.equal(w.isActive(),false);assert.equal(provider,1);
 } finally{w.stop();}
});
