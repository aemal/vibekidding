import {test} from "node:test";
import assert from "node:assert/strict";
import {confirmBillingImport} from "../src/lib/studio/billing-confirmation";
test("billing confirmation accepts only exact matching batch totals and mode",async()=>{
 for(const apply of [false,true]){
  const data={apply,eligible:1,already_imported:1};
  assert.deepEqual(await confirmBillingImport(async()=>({data,error:null}),apply,2),data);
 }
});
test("malformed or mismatched replies never confirm settlement",async()=>{
 for(const data of [null,[],{}, {apply:false,eligible:1,already_imported:0},
  {apply:true,eligible:2,already_imported:0},{apply:true,eligible:-1,already_imported:2},
  {apply:true,eligible:0.5,already_imported:0.5},{apply:true,eligible:1,already_imported:0,private:"secret"}]){
  await assert.rejects(confirmBillingImport(async()=>({data,error:null}),true,1),/Import not confirmed/);
 }
});
test("hanging import is ambiguous, aborts and does not retry or accept late confirmation",async()=>{
 let calls=0,signal:AbortSignal|undefined,release!:(value:{data:unknown;error:unknown})=>void;
 await assert.rejects(confirmBillingImport(s=>{calls++;signal=s;return new Promise(resolve=>{release=resolve;});},true,1,10),/do not assume rollback/);
 assert.equal(signal?.aborted,true);assert.equal(calls,1);
 release({data:{apply:true,eligible:1,already_imported:0},error:null});
});
test("transport failures are redacted and invalid limits do not invoke transport",async()=>{
 for(const apply of [false,true]){
  await assert.rejects(confirmBillingImport(async()=>{throw new Error("PRIVATE TOKEN");},apply,1),e=>e instanceof Error&&!e.message.includes("PRIVATE TOKEN")&&e.message.includes(apply?"not confirmed":"No writes requested"));
 }
 await assert.rejects(confirmBillingImport(async()=>{assert.fail("must not call");},true,0),/Invalid/);
});
