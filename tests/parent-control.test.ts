import {test,before,after,beforeEach,afterEach} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const db=new PGlite(),user="00000000-0000-4000-8000-000000000001",hash="a".repeat(64);
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;");
 for(const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
 await db.query("insert into auth.users values($1)",[user]);
 await db.query("insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference) values($1,'guardian','fixture@example.test','approved',now(),'fixture')",[user]);
});
after(()=>db.close());beforeEach(async()=>{await db.exec("begin");await db.query("insert into studio_parent_sessions values($1,$2,now()+interval '10 minutes')",[hash,user]);});afterEach(()=>db.exec("rollback"));
const change=(op:string="start",rules:string|null=null,h=hash)=>db.query("select studio_parent_control($1,$2,$3,$4)",[user,h,op,rules]);
async function denied(run:()=>Promise<unknown>,pattern:RegExp){await db.exec("savepoint rejected");await assert.rejects(run(),pattern);await db.exec("rollback to savepoint rejected");}
test("fresh parent starts bounded supervision and rules stop it",async()=>{
 await change();assert.equal((await db.query<{active:boolean}>("select supervised_until>clock_timestamp() and supervised_until<=clock_timestamp()+interval '30 minutes' active from studio_profiles")).rows[0].active,true);
 await change("rules",JSON.stringify(["Make learning projects"]));
 const p=(await db.query<{family_rules:string[];supervised_until:unknown}>("select * from studio_profiles")).rows[0];
 assert.deepEqual(p.family_rules,["Make learning projects"]);assert.equal(p.supervised_until,null);
});
test("expired, missing and another token cannot change parent controls",async()=>{
 await denied(()=>change("start",null,"b".repeat(64)),/Fresh parent/);
 await db.query("update studio_parent_sessions set expires_at=clock_timestamp()-interval '1 second'");
 await denied(()=>change(),/Fresh parent/);await denied(()=>change("rules","[]"),/Fresh parent/);
 await db.exec("delete from studio_parent_sessions");await denied(()=>change(),/Fresh parent/);
});
test("database rejects malformed rules, unknown operations and absent consent",async()=>{
 for(const rules of ['{}','[null]','[" "]',JSON.stringify(Array(11).fill("rule")),JSON.stringify(["x".repeat(401)])]) await denied(()=>change("rules",rules),/Invalid family rules/);
 await denied(()=>change("other"),/Unknown parent operation/);
 await denied(()=>change("start","[]"),/Approved guardian/);
 await db.exec("update studio_profiles set consent_reference=null");await denied(()=>change(),/Approved guardian/);
});
test("public roles cannot invoke parent mutation directly",async()=>{
 for(const role of ["anon","authenticated"]) {
  await db.exec(`set role ${role}`);await denied(()=>change(),/permission denied/);await db.exec("reset role");
 }
});
test("privacy operations require a fresh unlock and reject unexpected payloads",async()=>{
 for(const op of ["clear-history","withdraw-consent","request-deletion"]) await denied(()=>change(op,"[]"),/Unexpected parent payload/);
 await db.exec("delete from studio_parent_sessions");
 for(const op of ["clear-history","withdraw-consent","request-deletion"]) await denied(()=>change(op),/Fresh parent verification/);
 assert.equal((await db.query("select * from studio_deletion_requests")).rows.length,0);
});
test("clearing history is scoped to the verified family",async()=>{
 const other="00000000-0000-4000-8000-000000000002";
 await db.query("insert into auth.users values($1)",[other]);
 await db.query("insert into studio_profiles(id,username,email) values($1,'other-parent','other@example.test')",[other]);
 for(const id of [user,other])await db.query("insert into studio_activity(user_id,role,content,decision) values($1,'user','Synthetic fixture','clear')",[id]);
 await change("clear-history");
 assert.deepEqual((await db.query<{user_id:string}>("select user_id from studio_activity")).rows.map(r=>r.user_id),[other]);
});
test("verified consent withdrawal and deletion request invalidate the used unlock",async()=>{
 await db.exec("savepoint consent");await change("withdraw-consent");
 assert.equal((await db.query<{consent_reference:unknown}>("select consent_reference from studio_profiles")).rows[0].consent_reference,null);
 assert.equal((await db.query("select * from studio_parent_sessions")).rows.length,0);
 await db.exec("rollback to savepoint consent");await change("request-deletion");
 assert.equal((await db.query("select * from studio_deletion_requests")).rows.length,1);
 assert.equal((await db.query("select * from studio_parent_sessions")).rows.length,0);
});
async function alertFixture(){
 const activity=(await db.query<{id:string}>("insert into studio_activity(user_id,role,content,decision) values($1,'user','Synthetic alert','blocked') returning id",[user])).rows[0].id;
 return (await db.query<{id:string}>("insert into studio_parent_alerts(user_id,activity_id) values($1,$2) returning id",[user,activity])).rows[0].id;
}
const retry=(id:string,h=hash)=>db.query<{claim:unknown}>("select studio_parent_mail_claim($1,$2,$3,$4) claim",[user,h,id,JSON.stringify({from:"studio@example.test",to:["fixture@example.test"],subject:"Review",text:"Open parent controls"})]);
test("manual mail retry requires fresh authority and a family-owned alert",async()=>{
 const id=await alertFixture();
 await denied(()=>retry(id,"b".repeat(64)),/Fresh parent/);
 await denied(()=>retry("00000000-0000-4000-8000-000000000099"),/Parent alert unavailable/);
 assert.equal((await db.query("select * from studio_mail_jobs")).rows.length,0);
 assert.ok((await retry(id)).rows[0].claim);
 assert.equal((await retry(id)).rows[0].claim,null);
});
test("expired manual retry cannot lease mail but automatic safety worker remains independent",async()=>{
 const id=await alertFixture();await db.exec("update studio_parent_sessions set expires_at=clock_timestamp()-interval '1 second'");
 await denied(()=>retry(id),/Fresh parent/);
 assert.equal((await db.query("select * from studio_mail_jobs")).rows.length,0);
 assert.ok((await db.query<{claim:unknown}>("select studio_mail_claim($1,'parent','{}') claim",[id])).rows[0].claim);
});
