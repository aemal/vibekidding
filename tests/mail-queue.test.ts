import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { validWorkerToken } from "../src/lib/studio/worker-auth";
const db = new PGlite();
const user = "00000000-0000-4000-8000-000000000001";
const payload = { from: "studio@example.test", to: ["guardian@example.test"], subject: "Review", text: "Please review privately." };
before(async () => {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;");
  for (const file of ["202610190001_studio.sql", "202610190002_parent_guard.sql", "202610200003_notification_jobs.sql", "202610200004_mail_events.sql", "202610200005_usage_reconciliation.sql"]) await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1)", [user]);
  await db.query("insert into studio_profiles(id,username,email) values($1,'test-parent','guardian@example.test')", [user]);
});
after(() => db.close());
async function job() {
  const r = await db.query<{id:string}>("insert into studio_outbox(user_id,kind,day) values($1,'signup',current_date+(select count(*)::integer from studio_outbox)) returning id", [user]);
  return r.rows[0].id;
}
async function claim(id:string, body=payload) {
  return (await db.query<{j: {lease_token:string; payload:typeof payload} | null}>("select studio_mail_claim($1,'admin',$2) j", [id, JSON.stringify(body)])).rows[0].j;
}
async function finish(id:string,token:string,provider:string|null) {
  return (await db.query<{ok:boolean}>("select studio_mail_finish($1,$2,$3,'timeout') ok", [id,token,provider])).rows[0].ok;
}
test("worker requires a strong exact bearer secret", () => {
  const secret = "x".repeat(40);
  assert.equal(validWorkerToken(`Bearer ${secret}`, secret),true);
  for (const header of [null,"Bearer ",`Bearer ${"y".repeat(40)}`,`Basic ${secret}`]) assert.equal(validWorkerToken(header,secret),false);
  assert.equal(validWorkerToken("Bearer weak","weak"),false);
  assert.equal(validWorkerToken(`Bearer ${secret}`,undefined),false);
});
test("leases prevent duplicate claims; acceptance atomically marks source", async () => {
  const id = await job(); const first = (await claim(id))!;
  assert.ok(first.lease_token);
  assert.equal(await claim(id),null);
  assert.equal(await finish(id,"00000000-0000-4000-8000-000000000099","mail-1"),false);
  assert.equal(await finish(id,first.lease_token,"mail-1"),true);
  assert.equal(await finish(id,first.lease_token,"mail-1"),false);
  assert.equal(await claim(id),null);
  const row = await db.query<{sent_at:string}>("select sent_at from studio_outbox where id=$1",[id]);
  assert.ok(row.rows[0].sent_at);
});
test("failed attempt backs off, crash recovery replaces lease and rejects stale worker", async () => {
  const id=await job(); const first=(await claim(id))!;
  await finish(id,first.lease_token,null);
  assert.equal(await claim(id),null);
  await db.query("update studio_mail_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[id]);
  const second=(await claim(id))!;
  await db.query("update studio_mail_jobs set lease_until=now()-interval '1 second' where id=$1",[id]);
  const third=(await claim(id))!;
  assert.notEqual(second.lease_token,third.lease_token);
  assert.equal(await finish(id,second.lease_token,'stale'),false);
  await finish(id,third.lease_token,'accepted');
});
test("changed recipients require review; expired idempotency window never resends", async () => {
  for (const changed of [true,false]) {
    const id=await job(); const first=(await claim(id))!;
    await finish(id,first.lease_token,null);
    await db.query("update studio_mail_jobs set next_attempt_at=now()-interval '1 second',first_attempt_at=now()-($2::integer*interval '1 hour') where id=$1",[id,changed?0:24]);
    assert.equal(await claim(id,changed?{...payload,to:['changed@example.test']}:payload),null);
    const rows=await db.query<{status:string;payload:typeof payload}>("select status,payload from studio_mail_jobs where id=$1",[id]);
    assert.equal(rows.rows[0].status,'review');
    assert.deepEqual(rows.rows[0].payload,payload);
  }
});
test("browser roles cannot read email payloads or invoke worker procedures", async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from studio_mail_jobs'));
    await assert.rejects(db.query('select studio_mail_pending()'));
    await assert.rejects(db.query("select studio_mail_claim(gen_random_uuid(),'admin','{}')"));
    await db.exec('reset role');
  }
});
test("parent-history deletion removes frozen email metadata", async () => {
  const activity=await db.query<{id:string}>("insert into studio_activity(user_id,role,content,decision,categories) values($1,'user','example','blocked','{}') returning id",[user]);
  const alert=await db.query<{id:string}>("insert into studio_parent_alerts(user_id,activity_id) values($1,$2) returning id",[user,activity.rows[0].id]);
  await db.query("select studio_mail_claim($1,'parent',$2)",[alert.rows[0].id,JSON.stringify(payload)]);
  await db.query('delete from studio_activity where id=$1',[activity.rows[0].id]);
  assert.equal((await db.query('select * from studio_mail_jobs where id=$1',[alert.rows[0].id])).rows.length,0);
});
test("attempt cap and unverified recipient are quarantined from worker selection", async () => {
  for (const invalidRecipient of [false,true]) {
    const id=await job(); const first=(await claim(id))!;
    if (!invalidRecipient) await db.query('update studio_mail_jobs set attempts=10 where id=$1',[id]);
    await db.query('select studio_mail_finish($1,$2,null,$3)',[id,first.lease_token,invalidRecipient?'recipient_unverified':'timeout']);
    assert.equal((await db.query<{status:string}>('select status from studio_mail_jobs where id=$1',[id])).rows[0].status,'review');
    assert.equal((await db.query<{id:string}>('select * from studio_mail_pending()')).rows.some(row=>row.id===id),false);
  }
});
test("provider events are idempotent and do not downgrade adverse outcomes", async () => {
  const id=await job(); const c=(await claim(id))!;
  await finish(id,c.lease_token,'provider-events');
  await db.query("select studio_mail_event('event-1','provider-events','email.delivered',now())");
  await db.query("select studio_mail_event('event-1','provider-events','email.delivered',now())");
  assert.equal((await db.query("select * from studio_mail_events where id='event-1'")).rows.length,1);
  await db.query("select studio_mail_event('event-2','provider-events','email.bounced',now())");
  await db.query("select studio_mail_event('event-3','provider-events','email.delivered',now()-interval '1 minute')");
  const row=await db.query<{delivery_status:string}>('select delivery_status from studio_mail_jobs where id=$1',[id]);
  assert.equal(row.rows[0].delivery_status,'bounced');
  await db.query("update studio_mail_events set received_at=now()-interval '31 days' where provider_id='provider-events'");
  await db.query('select studio_mail_reconcile_events()');
  await db.query("select studio_mail_event('event-4','provider-events','email.delivery_delayed',now())");
  assert.equal((await db.query<{delivery_status:string}>('select delivery_status from studio_mail_jobs where id=$1',[id])).rows[0].delivery_status,'bounced');
});
test("event arriving before send acknowledgement reconciles on the next worker pass", async () => {
  await db.query("select studio_mail_event('early-event','early-provider','email.delivered',now())");
  const id=await job(); const c=(await claim(id))!;
  await finish(id,c.lease_token,'early-provider');
  await db.query('select studio_mail_reconcile_events()');
  assert.equal((await db.query<{delivery_status:string}>('select delivery_status from studio_mail_jobs where id=$1',[id])).rows[0].delivery_status,'delivered');
  await db.query('delete from studio_outbox where id=$1',[id]);
  assert.equal((await db.query("select * from studio_mail_events where provider_id='early-provider'")).rows.length,0);
});
test("browser cannot forge a delivery event", async () => {
  await db.exec('set role authenticated');
  await assert.rejects(db.query("select studio_mail_event('forged','provider-events','email.delivered',now())"));
  await assert.rejects(db.query('select * from studio_mail_events'));
  await db.exec('reset role');
});
test("reviewed reconciliation refunds once, audits evidence and rejects conflicts", async () => {
  await db.query("update studio_profiles set status='approved',email_verified_at=now(),consent_reference='review',credits=1000,supervised_until=now()+interval '30 minutes' where id=$1",[user]);
  const id='00000000-0000-4000-8000-000000000111';
  await db.query("select studio_reserve($1,$2,'typesafe','test',100)",[user,id]);
  const reconcile = (charge=40) => db.query("select studio_reconcile_usage($1,$2,$3,'billing-review-001','record-001')",[user,id,charge]);
  await assert.rejects(reconcile());
  await db.query("update studio_usage set created_at=created_at-interval '2 hours' where id=$1",[id]);
  await assert.rejects(reconcile(101));
  await reconcile(); await reconcile();
  await assert.rejects(reconcile(0));
  const balance=await db.query<{credits:number}>('select credits from studio_profiles where id=$1',[user]);
  assert.equal(Number(balance.rows[0].credits),960);
  assert.equal((await db.query('select * from studio_reconciliations where usage_id=$1',[id])).rows.length,1);
  assert.equal((await db.query('select * from studio_audit where request_id=$1',[id])).rows.length,1);
  await db.exec('set role authenticated');
  await assert.rejects(reconcile());
  await assert.rejects(db.query('select * from studio_reconciliations'));
  await db.exec('reset role');
});
