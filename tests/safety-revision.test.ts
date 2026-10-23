import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
let project: string;
before(async () => {
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
 await db.query('insert into auth.users values($1)',[user]);
 await db.query("insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference,supervised_until) values($1,'revision-test','parent@example.test','approved',now(),'review',now()+interval '30 minutes')",[user]);
 project=(await db.query<{id:string}>("select (studio_project_create($1,'Garden','garden')).id",[user])).rows[0].id;
});
after(()=>db.close());
async function revision(){return (await db.query<{n:number}>('select safety_revision::int n from studio_profiles where id=$1',[user])).rows[0].n;}
async function save(rev:number,old='',html='<p>Safe fixture</p>'){return db.query("select studio_guarded_save($1,$2,$3,$4,'[]',$5)",[user,project,old,html,rev]);}
test('pause and resume invalidate an earlier generation even with unchanged family rules',async()=>{
 const r=await revision();
 await db.query('update studio_profiles set supervised_until=null where id=$1',[user]);
 await db.query("update studio_profiles set supervised_until=now()+interval '30 minutes' where id=$1",[user]);
 assert.equal(await revision(),r+2);
 await assert.rejects(save(r));
 assert.equal((await db.query<{html:string}>('select html from studio_projects where id=$1',[project])).rows[0].html,'');
});
test('changing rules back still invalidates older work; the revision cannot be reset',async()=>{
 const r=await revision();
 await db.query(`update studio_profiles set family_rules='["No racing games"]' where id=$1`,[user]);
 await db.query("update studio_profiles set family_rules='[]' where id=$1",[user]);
 await assert.rejects(save(r));
 const current=await revision();
 await db.query('update studio_profiles set safety_revision=0 where id=$1',[user]);
 assert.equal(await revision(),current);
 await save(current);
});
test('stale project content and expired supervision reject even the latest revision',async()=>{
 const r=await revision();
 await assert.rejects(save(r,'stale'));
 await db.query("update studio_profiles set supervised_until=now()-interval '1 second' where id=$1",[user]);
 await assert.rejects(save(await revision(),'<p>Safe fixture</p>'));
});
test('browser roles and old signature cannot bypass revision enforcement',async()=>{
 await assert.rejects(db.query("select studio_guarded_save($1,$2,'','','[]')",[user,project]));
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  try{await assert.rejects(save(0));}finally{await db.exec('reset role');}
 }
});
test('paid reservations require the checked revision and cannot bypass session expiry',async()=>{
 await db.query("update studio_profiles set credits=1000,supervised_until=now()+interval '30 minutes' where id=$1",[user]);
 const r=await revision();
 const reserve=(rev:number)=>db.query("select studio_reserve($1,gen_random_uuid(),'typesafe','fixture',10,$2)",[user,rev]);
 await reserve(r);
 assert.equal(await revision(),r); // Credit accounting must not invalidate the current generation.
 await db.query('update studio_profiles set supervised_until=null where id=$1',[user]);
 await db.query("update studio_profiles set supervised_until=now()+interval '30 minutes' where id=$1",[user]);
 await assert.rejects(reserve(r));
 assert.equal((await db.query<{credits:number}>('select credits::int from studio_profiles where id=$1',[user])).rows[0].credits,990);
 await reserve(await revision());
 await db.query("update studio_profiles set supervised_until=now()-interval '1 second' where id=$1",[user]);
 await assert.rejects(reserve(await revision()));
 await db.exec('set role service_role');
 try {
  await assert.rejects(db.query("select studio_reserve_unchecked($1,gen_random_uuid(),'typesafe','fixture',10)",[user]));
  await assert.rejects(db.query("select studio_reserve($1,gen_random_uuid(),'typesafe','fixture',10)",[user]));
 } finally {await db.exec('reset role');}
});
test('generation claim rejects retries and wrong ownership before any paid reservation',async()=>{
 await db.query("update studio_profiles set supervised_until=now()+interval '30 minutes' where id=$1",[user]);
 const request='10000000-0000-4000-8000-000000000001';
 const r=await revision();
 const claim=()=>db.query('select studio_generation_claim($1,$2,$3,$4)',[user,request,project,r]);
 await claim();await assert.rejects(claim());
 assert.equal((await db.query('select * from studio_generation_claims')).rows.length,1);
 await assert.rejects(db.query('select studio_generation_claim($1,gen_random_uuid(),gen_random_uuid(),$2)',[user,r]));
 await assert.rejects(db.query('select studio_generation_claim($1,gen_random_uuid(),$2,$3)',[user,project,r-1]));
 assert.equal((await db.query('select * from studio_generation_claims')).rows.length,1);
});
