import { test } from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "svix";
import { boundedWebhookBody, verifyMailEvent } from "../src/lib/studio/mail-webhook";
import { setupChecks } from "../src/lib/studio/readiness";
const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
function signed(body: unknown, date = new Date()) {
  const raw = JSON.stringify(body);
  const id = "msg_fixture_123";
  return { raw, headers: { "svix-id": id, "svix-timestamp": String(Math.floor(date.getTime()/1000)), "svix-signature": new Webhook(secret).sign(id,date,raw) } };
}
const event = () => ({ type:"email.delivered", created_at:new Date().toISOString(), data:{email_id:"provider-123", to:["private@example.test"], subject:"Private subject"} });
test("signed events keep only minimal identifiers and outcome", () => {
  const {raw,headers}=signed(event());
  const result=verifyMailEvent(raw,headers,secret);
  assert.equal(result?.providerId,'provider-123');
  assert.equal(result?.type,'email.delivered');
  assert.equal(JSON.stringify(result).includes('private'),false);
});
test("forged, modified and stale signed callbacks are rejected", () => {
  const {raw,headers}=signed(event());
  assert.throws(()=>verifyMailEvent(raw+' ',headers,secret));
  assert.throws(()=>verifyMailEvent(raw,{...headers,'svix-signature':'v1,invalid'},secret));
  assert.throws(()=>verifyMailEvent(raw,{...headers,'svix-id':'another'},secret));
  const old=signed(event(),new Date(Date.now()-600000));
  assert.throws(()=>verifyMailEvent(old.raw,old.headers,secret));
});
test("unsupported events ignored, malformed relevant events rejected", () => {
  const unsupported=signed({...event(),type:'email.opened'});
  assert.equal(verifyMailEvent(unsupported.raw,unsupported.headers,secret),null);
  for (const body of [{...event(), data:{}},{...event(),created_at:'invalid'}]) {
    const item=signed(body);
    assert.throws(()=>verifyMailEvent(item.raw,item.headers,secret));
  }
});
test("webhook read is bounded and preserves raw bytes", async () => {
  const req=new Request('http://localhost/test',{method:'POST',body:' {"exact": true} '});
  assert.equal(await boundedWebhookBody(req),' {"exact": true} ');
  await assert.rejects(boundedWebhookBody(new Request('http://localhost/test',{method:'POST',body:'x'.repeat(20)}),10));
});
test("chunked Unicode webhook keeps the exact signed representation", async () => {
  const raw = ' \n'+JSON.stringify({...event(), note:'🌻 العربية'})+'\n';
  const date=new Date(), id='msg_unicode';
  const headers={'svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':new Webhook(secret).sign(id,date,raw)};
  const bytes=new TextEncoder().encode(raw);
  const req=new Request('http://localhost/test',{method:'POST',duplex:'half',body:new ReadableStream({
    start(c){ for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close(); },
  })} as RequestInit);
  const decoded=await boundedWebhookBody(req);
  assert.equal(decoded,raw);
  assert.equal(verifyMailEvent(decoded,headers,secret)?.providerId,'provider-123');
  const bom='\uFEFF'+raw;
  assert.equal(await boundedWebhookBody(new Request('http://localhost/test',{method:'POST',body:bom})),bom);
});
test("webhook stalled stream times out without waiting for cancellation", async () => {
  let cancelled=false;
  const req=new Request('http://localhost/test',{method:'POST',duplex:'half',body:new ReadableStream({
    cancel(){cancelled=true;return new Promise(()=>{});},
  })} as RequestInit);
  await assert.rejects(boundedWebhookBody(req,65536,20),/too long/);
  assert.equal(cancelled,true);
});
test("readiness never exposes secrets or presents presence as live validation", () => {
  const checks=setupChecks({OPENAI_API_KEY:'private-test-secret',STUDIO_WORKER_SECRET:'short',TYPESAFE_MAX_CHECK_MICRO_USD:'-1'});
  assert.equal(JSON.stringify(checks).includes('private-test-secret'),false);
  assert.equal(checks.find(c=>c.id==='supabase')?.status,'missing');
  assert.equal(checks.find(c=>c.id==='openai')?.status,'configured');
  assert.equal(checks.find(c=>c.id==='worker')?.status,'needs-review');
  assert.equal(checks.find(c=>c.id==='safety')?.status,'needs-review');
  assert.equal(checks.find(c=>c.id==='voice-relay')?.status,'needs-review');
});
