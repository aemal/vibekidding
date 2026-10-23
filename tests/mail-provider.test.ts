import { test } from "node:test";
import assert from "node:assert/strict";
import { submitMail } from "../src/lib/studio/mail-provider";
const payload = { from: "fixture@example.test", to: ["parent@example.test"], subject: "Fixture", text: "No real email" };
const response = (r: Response): typeof fetch => async () => r;
test("mail adapter sends frozen payload once with the durable idempotency key", async () => {
  let calls=0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url,"https://api.resend.com/emails");
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"),"fixture-job");
    assert.equal(init?.body,JSON.stringify(payload));
    assert.ok(init?.signal);
    return Response.json({id:"provider-123"});
  };
  assert.deepEqual(await submitMail(payload,"fixture-job","synthetic-key",transport),{providerId:"provider-123",error:null});
  assert.equal(calls,1);
});
test("malformed, missing, oversized or non-correlatable success IDs stay ambiguous", async () => {
  for(const body of ['not JSON','null','{}','{"id":" "}','{"id":"bad/id"}',JSON.stringify({id:"a".repeat(201)}),'x'.repeat(65537)]) {
    assert.deepEqual(await submitMail(payload,"fixture","synthetic",response(new Response(body))),
      {providerId:null,error:"ambiguous_response"});
  }
});
test("HTTP rejection cancels unread body without waiting; network failures do not retry", async () => {
  let cancelled=false;
  const stream=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
  assert.deepEqual(await submitMail(payload,"fixture","synthetic",response(new Response(stream,{status:429}))),
    {providerId:null,error:"provider_http_429"});
  assert.equal(cancelled,true);
  let calls=0;
  const transport:typeof fetch=async()=>{calls++;throw new Error("sensitive provider detail");};
  assert.deepEqual(await submitMail(payload,"fixture","synthetic",transport),{providerId:null,error:"network_or_timeout"});
  assert.equal(calls,1);
});
test("hung transport is bounded, aborted and never retried locally",async()=>{
 let calls=0,signal:AbortSignal|undefined;
 const got=await submitMail(payload,"fixture","synthetic",async(_url,init)=>{calls++;signal=init?.signal as AbortSignal;return new Promise(()=>{});},20);
 assert.deepEqual(got,{providerId:null,error:"network_or_timeout"});assert.equal(calls,1);assert.equal(signal?.aborted,true);
});
test("stalled successful response remains ambiguous even if cancellation hangs",async()=>{
 let canceled=false;
 const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled=true;return new Promise(()=>{});}});
 assert.deepEqual(await submitMail(payload,"fixture","synthetic",response(new Response(body)),20),{providerId:null,error:"ambiguous_response"});
 await new Promise(r=>setTimeout(r,0));assert.equal(canceled,true);
});
test("late mail success cannot change a recorded timeout outcome",async()=>{
 let release!:(r:Response)=>void,canceled=false;
 const got=await submitMail(payload,"fixture","synthetic",()=>new Promise(r=>{release=r;}),20);
 release(new Response(new ReadableStream({cancel(){canceled=true;}})));
 await new Promise(r=>setTimeout(r,0));
 assert.equal(canceled,true);assert.deepEqual(got,{providerId:null,error:"network_or_timeout"});
});
test("invalid deadline sends nothing and malformed UTF-8 remains ambiguous",async()=>{
 let calls=0;
 const got=await submitMail(payload,"fixture","synthetic",async()=>{calls++;return Response.json({id:"id"});},10001);
 assert.equal(calls,0);assert.equal(got.providerId,null);
 assert.deepEqual(await submitMail(payload,"fixture","synthetic",response(new Response(new Uint8Array([0xc3,0x28])))),{providerId:null,error:"ambiguous_response"});
});
