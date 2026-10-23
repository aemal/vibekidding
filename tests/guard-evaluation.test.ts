import { test } from "node:test";
import assert from "node:assert/strict";
import { guardCategories, guardRequest, localGuard } from "../src/lib/studio/guard-policy";
import { checkGuardProvider } from "../src/lib/studio/guard-provider";
import { assessSafetyCase } from "../src/lib/studio/guard-evaluation";
import { safetyCases } from "./fixtures/guard-cases";
const request = guardRequest("user", "Build a garden.", [], [], "fixture-model");
const scores = (n: number) => ({ answers: Object.fromEntries(guardCategories.map(key => [key,{type:"noul",noul:n}])) });
const transport = (response: Response): typeof fetch => async () => response;
test("provider adapter handles valid, uncertain, malformed and oversized responses", async () => {
  for (const [score,expected] of [[0.1,"clear"],[0.5,"uncertain"],[0.8,"blocked"]] as const) {
    const got = await checkGuardProvider(request,"fixture-key",transport(Response.json(scores(score))));
    assert.equal(got.result.decision,expected);
  }
  for (const response of [Response.json({answers:{}}),new Response('not json'),new Response('x'.repeat(65537)),new Response('error',{status:500})]) {
    assert.equal((await checkGuardProvider(request,"fixture-key",transport(response))).result.decision,"unavailable");
  }
});
test("network failure remains unavailable without retries or error leakage", async () => {
  let calls=0;
  const got=await checkGuardProvider(request,"fixture-key",async () => { calls++; throw new Error('sensitive provider detail'); });
  assert.equal(calls,1);
  assert.equal(got.result.decision,'unavailable');
  assert.equal(JSON.stringify(got).includes('sensitive'),false);
});
test("request uses fixed provider endpoint and bounded timeout", async () => {
  await checkGuardProvider(request,"fixture-key",async (url, options) => {
    assert.equal(url,"https://api.typesafe.ai/v1/systemone");
    assert.equal(options?.cache,"no-store");
    assert.ok(options?.signal);
    assert.deepEqual(JSON.parse(options?.body as string),request);
    return Response.json(scores(0.1),{headers:{'x-request-id':'request-123'}});
  }).then(result => assert.equal(result.requestId,'request-123'));
});
test("provider outage cannot count as successful safety classification", () => {
  assert.equal(assessSafetyCase('pause',{decision:'unavailable',categories:[]}), 'inconclusive');
  assert.equal(assessSafetyCase('allow',{decision:'uncertain',categories:[]}), 'fail');
  assert.equal(assessSafetyCase('pause',{decision:'blocked',categories:['personal_data']},'needs_support'), 'fail');
  assert.equal(assessSafetyCase('pause',{decision:'blocked',categories:['needs_support']},'needs_support'), 'pass');
});
test("zero-width contact/profanity obfuscation is caught locally; benign words abstain", () => {
  assert.equal(localGuard('f\u200Buck')?.decision,'blocked');
  assert.equal(localGuard('kid@exam\u200Bple.test')?.decision,'blocked');
  for (const text of ['Build a crossword.','Make a shell game about seashells.','I feel frustrated.','Never share your password.']) assert.equal(localGuard(text),null);
});
test("synthetic corpus has unique IDs, multiple languages, both outcomes and assistant coverage", () => {
  assert.equal(new Set(safetyCases.map(c=>c.id)).size,safetyCases.length);
  assert.ok(new Set(safetyCases.map(c=>c.language)).size>=7);
  assert.ok(safetyCases.some(c=>c.role==='assistant'));
  for (const c of safetyCases) {
    assert.ok(c.text.length>0 && c.text.length<=24000);
    assert.ok(['allow','pause'].includes(c.expectation));
    // A local block is not a claim that every other fixture passes a live classifier.
    if(c.expectation==='allow') assert.equal(localGuard(c.text),null,c.id);
  }
});
test("stalled safety responses and hanging cancellation remain bounded and unavailable",async()=>{
 let canceled=false;
 const stalled=new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled=true;return new Promise(()=>{});}}),{headers:{"x-request-id":"stalled-123"}});
 const got=await checkGuardProvider(request,"fixture-key",transport(stalled),20);
 assert.equal(got.result.decision,"unavailable");assert.equal(got.requestId,"stalled-123");
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(canceled,true);
 const error=new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:503});
 assert.equal((await checkGuardProvider(request,"fixture-key",transport(error),20)).result.categories[0],"provider_error");
});
test("transport ignoring abort cannot hold the safety decision open or trigger retry",async()=>{
 let calls=0;let signal:AbortSignal|undefined;
 const got=await checkGuardProvider(request,"fixture-key",async(_url,options)=>{calls++;signal=options?.signal as AbortSignal;return new Promise(()=>{});},20);
 assert.equal(got.result.decision,"unavailable");assert.equal(calls,1);assert.equal(signal?.aborted,true);
});
test("malformed UTF-8 and oversized streams fail closed without awaiting cancellation",async()=>{
 const malformed=new Response(new Uint8Array([0xc3,0x28]));
 assert.equal((await checkGuardProvider(request,"fixture-key",transport(malformed))).result.decision,"unavailable");
 const oversized=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(65537));},cancel(){return new Promise(()=>{});}}));
 assert.equal((await checkGuardProvider(request,"fixture-key",transport(oversized),20)).result.decision,"unavailable");
 let called=false;
 assert.equal((await checkGuardProvider(request,"fixture-key",async()=>{called=true;return Response.json(scores(.1));},15001)).result.decision,"unavailable");
 assert.equal(called,false);
});
test("late successful response cannot replace a timed-out safety decision",async()=>{
 let release!:(r:Response)=>void,canceled=false;
 const got=await checkGuardProvider(request,"fixture-key",()=>new Promise(r=>{release=r;}),20);
 assert.equal(got.result.decision,"unavailable");assert.equal(got.requestId,null);
 release(new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{"x-request-id":"late-success"}}));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(canceled,true);assert.equal(got.result.decision,"unavailable");assert.equal(got.requestId,null);
});
