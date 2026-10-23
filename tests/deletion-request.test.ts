import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db=new PGlite();
const user="00000000-0000-4000-8000-000000000001";
const usage="10000000-0000-4000-8000-000000000001";
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;");
 for(const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort())
  await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
 await db.query("insert into auth.users values($1)",[user]);
 await db.query("insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference,supervised_until,credits) values($1,'settlement','fixture@example.test','approved',now(),'fixture',now()+interval '30 minutes',1000)",[user]);
});
after(()=>db.close());
beforeEach(async()=>{
 await db.exec("begin");
 await db.query("insert into studio_projects(owner_id,title,slug,published,review_requested) values($1,'Fixture','fixture',true,true)",[user]);
 await db.query("insert into studio_parent_sessions values('fixture',$1,now()+interval '10 minutes')",[user]);
});
afterEach(()=>db.exec("rollback"));
test("deletion request is idempotent and stops access without claiming erasure",async()=>{
 await db.query("select studio_request_deletion($1)",[user]);await db.query("select studio_request_deletion($1)",[user]);
 const p=(await db.query<{status:string;credits:number;consent_reference:unknown;supervised_until:unknown}>("select * from studio_profiles")).rows[0];
 assert.equal(p.status,"pending");assert.equal(Number(p.credits),1000);assert.equal(p.consent_reference,null);assert.equal(p.supervised_until,null);
 assert.equal((await db.query("select * from studio_parent_sessions")).rows.length,0);
 assert.equal((await db.query("select * from studio_deletion_requests")).rows.length,1);
 const project=(await db.query<{published:boolean;review_requested:boolean}>("select * from studio_projects")).rows[0];
 assert.equal(project.published,false);assert.equal(project.review_requested,false);
 assert.equal((await db.query("select * from studio_audit where action like 'guardian requested%'")).rows.length,1);
});
test("pending deletion blocks reapproval and session restart but permits accounting",async()=>{
 await db.query("select studio_reserve($1,$2,'typesafe','fixture',100,0)",[user,usage]);
 await db.query("select studio_request_deletion($1)",[user]);
 for(const sql of ["update studio_profiles set supervised_until=now()+interval '30 minutes'", "update studio_profiles set status='approved',consent_reference='new-review'"]){
  await db.exec("savepoint denied");await assert.rejects(db.exec(sql),/deletion review pending/);await db.exec("rollback to savepoint denied");
 }
 await db.query("select studio_settle($1,40,null,null)",[usage]);
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),960);
});

test("deletion suppresses new mail and retries, but records an already in-flight outcome",async()=>{
 const outbox=async(day:number)=>(await db.query<{id:string}>("insert into studio_outbox(user_id,kind,day) values($1,'signup',current_date+$2::integer) returning id",[user,day])).rows[0].id;
 const first=await outbox(0), queued=await outbox(1);
 const claim=async(id:string)=>(await db.query<{job:{lease_token:string}|null}>("select studio_mail_claim($1,'admin','{}') job",[id])).rows[0].job;
 const job=await claim(first);assert.ok(job);
 await db.query("select studio_request_deletion($1)",[user]);
 assert.equal(await claim(queued),null);
 assert.equal((await db.query("select * from studio_mail_pending()")).rows.length,0);
 assert.equal((await db.query<{ok:boolean}>("select studio_mail_finish($1,$2,'provider-fixture',null) ok",[first,job.lease_token])).rows[0].ok,true);
 assert.equal((await db.query<{status:string}>("select status from studio_mail_jobs where id=$1",[first])).rows[0].status,"accepted");
});
test("deletion suppresses retry of a previously failed notification",async()=>{
 const id=(await db.query<{id:string}>("insert into studio_outbox(user_id,kind) values($1,'signup') returning id",[user])).rows[0].id;
 const job=(await db.query<{job:{lease_token:string}}>("select studio_mail_claim($1,'admin','{}') job",[id])).rows[0].job;
 await db.query("select studio_mail_finish($1,$2,null,'timeout')",[id,job.lease_token]);
 await db.query("update studio_mail_jobs set next_attempt_at=now()-interval '1 minute' where id=$1",[id]);
 await db.query("select studio_request_deletion($1)",[user]);
 assert.equal((await db.query<{job:unknown}>("select studio_mail_claim($1,'admin','{}') job",[id])).rows[0].job,null);
 assert.equal(Number((await db.query<{attempts:number}>("select attempts from studio_mail_jobs where id=$1",[id])).rows[0].attempts),1);
});
test("reviewed local erasure removes only family content and retains a truthful receipt",async()=>{
 const other="00000000-0000-4000-8000-000000000002";
 await db.query("insert into auth.users values($1)",[other]);
 await db.query("insert into studio_profiles(id,username,email) values($1,'other-family','other@example.test')",[other]);
 await db.query("insert into studio_projects(owner_id,title,slug) values($1,'Other project','other-project')",[other]);
 await db.query("insert into studio_activity(user_id,role,content,decision) values($1,'user','Private fixture','clear')",[user]);
 await db.query("select studio_request_deletion($1)",[user]);
 const requested=(await db.query<{requested_at:unknown}>("select requested_at from studio_deletion_requests where user_id=$1",[user])).rows[0].requested_at;
 const erase=()=>db.query<{receipt:unknown}>("select studio_erase_local_content($1,$1,$2) receipt",[user,requested]);
 const first=(await erase()).rows[0].receipt;
 assert.deepEqual((await erase()).rows[0].receipt,first);
 assert.equal((await db.query("select * from studio_projects where owner_id=$1",[user])).rows.length,0);
 assert.equal((await db.query("select * from studio_activity where user_id=$1",[user])).rows.length,0);
 assert.equal((await db.query("select * from studio_projects where owner_id=$1",[other])).rows.length,1);
 assert.equal((await db.query("select * from studio_profiles where id=$1",[user])).rows.length,1);
 assert.equal((await db.query("select * from studio_audit where action like 'local family content erased%'")).rows.length,1);
 await db.exec("savepoint late");
 await assert.rejects(db.query("insert into studio_activity(user_id,role,content,decision) values($1,'assistant','Late response','clear')",[user]),/content writes are closed/);
 await db.exec("rollback to savepoint late");
});
test("local erasure refuses unresolved usage and stale review without removing projects",async()=>{
 await db.query("select studio_reserve($1,$2,'typesafe','fixture',100,0)",[user,usage]);
 await db.query("select studio_request_deletion($1)",[user]);
 const requested=(await db.query<{requested_at:unknown}>("select requested_at from studio_deletion_requests where user_id=$1",[user])).rows[0].requested_at;
 for(const time of [requested,"2000-01-01T00:00:00Z"]){
  await db.exec("savepoint denied");
  await assert.rejects(db.query("select studio_erase_local_content($1,$1,$2)",[user,time]));
  await db.exec("rollback to savepoint denied");
 }
 assert.equal((await db.query("select * from studio_projects where owner_id=$1",[user])).rows.length,1);
});
test("local erasure waits for active notification leases",async()=>{
 const id=(await db.query<{id:string}>("insert into studio_outbox(user_id,kind) values($1,'signup') returning id",[user])).rows[0].id;
 await db.query("select studio_mail_claim($1,'admin','{}')",[id]);
 await db.query("select studio_request_deletion($1)",[user]);
 const requested=(await db.query<{requested_at:unknown}>("select requested_at from studio_deletion_requests where user_id=$1",[user])).rows[0].requested_at;
 await db.exec("savepoint sending");
 await assert.rejects(db.query("select studio_erase_local_content($1,$1,$2)",[user,requested]),/in flight/);
 await db.exec("rollback to savepoint sending");
 assert.equal((await db.query("select * from studio_projects where owner_id=$1",[user])).rows.length,1);
});
