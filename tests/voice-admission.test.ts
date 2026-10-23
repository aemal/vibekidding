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
const project="20000000-0000-4000-8000-000000000001";
const hash="a".repeat(64);
beforeEach(async()=>{
 await db.exec("begin");
 await db.query("insert into studio_projects(id,owner_id,title,slug) values($1,$2,'Voice fixture','voice-fixture')",[project,user]);
});
afterEach(()=>db.exec("rollback"));
const admit=(token=hash,id=usage)=>db.query("select studio_voice_admit($1,$2,$3,$4,0,30000,'reviewed-fixture',100)",[user,id,project,token]);
const claim=(who=user,token=hash)=>db.query<{result:{usage_id:string;duration_ms:number}}>("select studio_voice_claim($1,$2) result",[who,token]);
async function rejected(action:()=>Promise<unknown>,pattern?:RegExp){
 await db.exec("savepoint denied");
 if(pattern) await assert.rejects(action(),pattern); else await assert.rejects(action());
 await db.exec("rollback to savepoint denied");
}
test("voice admission reserves once, binds identity and permits one claim only",async()=>{
 await admit();
 await rejected(()=>claim("00000000-0000-4000-8000-000000000099"));
 await rejected(()=>claim(user,"b".repeat(64)),/unavailable/);
 const result=(await claim()).rows[0].result;
 assert.equal(result.usage_id,usage);assert.equal(result.duration_ms,30000);
 await rejected(()=>claim(),/unavailable/);
 await rejected(()=>admit());
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),900);
 assert.equal(Number((await db.query<{n:number}>("select count(*) n from studio_usage")).rows[0].n),1);
});
test("expired, settled and changed-safety admissions cannot be claimed; uncertain reserve remains",async()=>{
 await admit();
 await db.exec("savepoint original");
 await db.exec("update studio_voice_admissions set expires_at=clock_timestamp()-interval '1 second'");
 await rejected(()=>claim(),/unavailable/);
 await db.exec("rollback to savepoint original");
 await db.query("select studio_settle($1,0,null,null)",[usage]);
 await rejected(()=>claim(),/unavailable/);
 await db.exec("rollback to savepoint original");
 await db.exec("update studio_profiles set supervised_until=now()+interval '10 minutes'");
 await rejected(()=>claim(),/unavailable/);
 assert.equal((await db.query<{state:string}>("select state from studio_usage")).rows[0].state,"reserved");
});
test("invalid admissions and duplicate secrets roll back all credit changes",async()=>{
 await rejected(()=>admit("invalid"));
 await admit();
 await rejected(()=>admit(hash,"10000000-0000-4000-8000-000000000002"));
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),900);
 assert.equal(Number((await db.query<{n:number}>("select count(*) n from studio_usage")).rows[0].n),1);
});

const authorized=async(who=user)=>(await db.query<{allowed:boolean}>("select studio_voice_authorized($1,$2) allowed",[who,usage])).rows[0].allowed;
test("durable voice authorization requires claim and permanently records termination",async()=>{
 await admit();
 assert.equal(await authorized("00000000-0000-4000-8000-000000000099"),false);
 await claim();assert.equal(await authorized(),true);
 await db.query("select studio_voice_end($1,$2)",[user,usage]);
 assert.equal(await authorized(),false);
 await db.query("select studio_voice_end($1,$2)",[user,usage]);
 await rejected(()=>claim(),/unavailable/);
 assert.equal((await db.query<{state:string}>("select state from studio_usage")).rows[0].state,"reserved");
});
test("unclaimed or elapsed voice sessions cannot become authorized",async()=>{
 await admit();
 await db.exec("savepoint unclaimed");
 assert.equal(await authorized(),false);
 await rejected(()=>claim(),/unavailable/);
 await db.exec("rollback to savepoint unclaimed");
 await claim();
 await db.exec("update studio_voice_admissions set claimed_at=clock_timestamp()-interval '31 seconds'");
 assert.equal(await authorized(),false);
 assert.ok((await db.query<{ended_at:unknown}>("select ended_at from studio_voice_admissions")).rows[0].ended_at);
});
test("parental changes and settlement revoke active voice authorization",async()=>{
 await admit();await claim();assert.equal(await authorized(),true);
 await db.exec("savepoint active");
 await db.exec("update studio_profiles set supervised_until=now()+interval '10 minutes'");
 assert.equal(await authorized(),false);
 await db.exec("rollback to savepoint active");
 await db.query("select studio_settle($1,40,null,null)",[usage]);
 assert.equal(await authorized(),false);
});

test("voice retention preserves unresolved charges and deletes only old settled admissions",async()=>{
 await admit();
 await db.exec("update studio_voice_admissions set expires_at=now()-interval '31 days'");
 const cleanup=async()=>(await db.query<{n:number}>("select studio_voice_retention() n")).rows[0].n;
 assert.equal(await cleanup(),0);
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),900);
 await db.query("select studio_settle($1,40,null,null)",[usage]);
 assert.equal(await cleanup(),1);
 assert.equal(await cleanup(),0);
 assert.equal((await db.query("select * from studio_usage where id=$1",[usage])).rows.length,1);
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),960);
});
test("voice retention keeps recent admissions and recently claimed sessions",async()=>{
 await admit();
 await db.query("select studio_settle($1,40,null,null)",[usage]);
 assert.equal((await db.query<{n:number}>("select studio_voice_retention() n")).rows[0].n,0);
 await db.exec("update studio_voice_admissions set expires_at=now()-interval '31 days',claimed_at=now()");
 assert.equal((await db.query<{n:number}>("select studio_voice_retention() n")).rows[0].n,0);
 await db.exec("update studio_voice_admissions set claimed_at=now()-interval '31 days'");
 assert.equal((await db.query<{result:{voice_admissions:number}}>("select studio_privacy_maintenance() result")).rows[0].result.voice_admissions,1);
});
test("voice retention is service-only and bounded to 1000 admissions per pass",async()=>{
 await db.query("insert into studio_usage(id,user_id,provider,model,reserved,charged,state) select gen_random_uuid(),$1,'elevenlabs','fixture',1,0,'settled' from generate_series(1,1001)",[user]);
 await db.query("insert into studio_voice_admissions(id,user_id,project_id,token_hash,safety_revision,duration_ms,expires_at) select id,user_id,$1,replace(id::text,'-','')||replace(id::text,'-',''),0,1000,now()-interval '31 days' from studio_usage",[project]);
 for(const role of ['anon','authenticated']){
  await db.exec('savepoint role_check');
  await db.exec(`set local role ${role}`);
  await assert.rejects(db.exec('select studio_voice_retention()'));
  await db.exec('rollback to savepoint role_check');
 }
 await db.exec('set local role service_role');
 assert.equal((await db.query<{n:number}>("select studio_voice_retention() n")).rows[0].n,1000);
 assert.equal((await db.query<{n:number}>("select studio_voice_retention() n")).rows[0].n,1);
});
