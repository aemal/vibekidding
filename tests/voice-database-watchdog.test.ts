import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { watchDatabaseVoiceSession } from "../src/lib/studio/voice-database-watchdog";
const binding = {userId:"00000000-0000-4000-8000-000000000001",usageId:"10000000-0000-4000-8000-000000000001",durationMs:1000};
function fixture(reply: (name:string, signal:AbortSignal)=>Promise<{data:unknown;error:unknown}>) {
 const calls: {name:string;args:unknown;signal:AbortSignal}[]=[];
 const db={rpc:(name:string,args:unknown)=>({abortSignal:(signal:AbortSignal)=>{
  calls.push({name,args,signal});return reply(name,signal);
 }})} as unknown as SupabaseClient;
 return {db,calls};
}
test("database watchdog binds authorization and records end independently of broken transports",async()=>{
 const f=fixture(async()=>({data:true,error:null}));let client=0,provider=0;
 const input={...binding};
 const w=watchDatabaseVoiceSession(f.db,input,{closeClient:()=>{client++;throw Error("socket");},closeProvider:async()=>{provider++;throw Error("socket");}});
 input.userId="00000000-0000-4000-8000-000000000002";
 try {
  assert.equal(await w.ready,true);w.stop();w.stop();
  assert.equal(await w.endRecorded,true);assert.equal(client,1);assert.equal(provider,1);
  assert.deepEqual(f.calls.map(c=>c.name),["studio_voice_authorized","studio_voice_end"]);
  for(const call of f.calls) assert.deepEqual(call.args,{p_user:binding.userId,p_id:binding.usageId});
  assert.equal(w.isActive(),false);
 } finally {w.stop();}
});
test("database watchdog rejects errors and non-boolean authorization responses",async()=>{
 for(const response of [{data:"true",error:null},{data:true,error:{message:"private"}},{data:null,error:null}]){
  const f=fixture(async name=>name==="studio_voice_authorized"?response:{data:null,error:null});
  const w=watchDatabaseVoiceSession(f.db,binding,{closeClient:()=>{},closeProvider:()=>{}});
  assert.equal(await w.ready,false);assert.equal(await w.endRecorded,true);assert.equal(w.isActive(),false);
 }
});
test("database end failure is reported without reopening or releasing credits",async()=>{
 const f=fixture(async name=>{if(name==="studio_voice_end")throw Error("offline");return {data:true,error:null};});
 const w=watchDatabaseVoiceSession(f.db,binding,{closeClient:()=>{},closeProvider:()=>{}});
 assert.equal(await w.ready,true);w.stop();assert.equal(await w.endRecorded,false);
 assert.equal(w.isActive(),false);assert.equal(f.calls.length,2);
});
test("hanging database authorization and cleanup are cancelled and bounded",async()=>{
 const f=fixture(()=>new Promise(()=>{}));
 const w=watchDatabaseVoiceSession(f.db,binding,{closeClient:()=>{},closeProvider:()=>{}});
 assert.equal(await w.ready,false);assert.equal(await w.endRecorded,false);
 assert.ok(f.calls.every(c=>c.signal.aborted));assert.equal(w.isActive(),false);
});
