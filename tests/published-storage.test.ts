import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001', viewer='00000000-0000-4000-8000-000000000002', other='00000000-0000-4000-8000-000000000003';
const project='10000000-0000-4000-8000-000000000001';
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 for(const [id,name] of [[owner,'owner'],[viewer,'viewer'],[other,'other']]){
  await db.query('insert into auth.users values($1)',[id]);
  await db.query("insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference,supervised_until) values($1,$2,'fixture@example.test','approved',now(),'fixture',now()+interval '30 minutes')",[id,name]);
 }
 await db.query("insert into studio_projects(id,owner_id,title,slug,html,published) values($1,$2,'Game','game','<p>Game</p>',true)",[project,owner]);
 await db.query("select studio_app_storage_review($1,$2,'<p>Game</p>',true)",[owner,project]);
});
after(()=>db.close());beforeEach(()=>db.exec('begin'));afterEach(()=>db.exec('rollback'));
const call=(who=viewer,op='write',key='score',value:string|null='42',request='20000000-0000-4000-8000-000000000001')=>db.query<{v:{value:string|null}}>('select studio_app_record($1,$2,$3,$4,$5,$6) v',[who,project,request,op,key,value]);
async function denied(fn:()=>Promise<unknown>){await db.exec('savepoint bad');await assert.rejects(fn());await db.exec('rollback to savepoint bad');}
test('published storage is isolated per viewer, including the project owner',async()=>{
 await call();
 assert.equal((await call(other,'read','score',null)).rows[0].v.value,null);
 assert.equal((await call(owner,'read','score',null)).rows[0].v.value,null);
 assert.equal((await call(viewer,'read','score',null,'20000000-0000-4000-8000-000000000002')).rows[0].v.value,'42');
 assert.equal((await db.query('select * from studio_records')).rows.length,0);
});
test('publication, reviewed content, consent and current viewer supervision are required',async()=>{
 for(const sql of ["update studio_projects set published=false", "update studio_projects set html='<p>New</p>'", "delete from studio_app_storage_permissions", `update studio_profiles set consent_reference=null where id='${owner}'`, `update studio_profiles set supervised_until=now()-interval '1 second' where id='${viewer}'`]){
  await db.exec('savepoint change');await db.exec(sql);await denied(()=>call());await db.exec('rollback to savepoint change');
 }
 await denied(()=>db.query("select studio_app_storage_review($1,$2,'stale',true)",[owner,project]));
});
test('requests cannot replay and daily per-viewer limits cannot be exceeded',async()=>{
 await call();await denied(()=>call());
 await db.query("insert into studio_app_requests select $1,$2,gen_random_uuid(),now() from generate_series(1,199)",[project,viewer]);
 await denied(()=>call(viewer,'read','score',null,'20000000-0000-4000-8000-000000000002'));
 assert.equal((await call(other,'read','score',null)).rows[0].v.value,null);
});
test('storage enforces per-viewer size/key quota and denies browser table/RPC access',async()=>{
 await db.query("insert into studio_app_records select $1,$2,'key-'||n,'0' from generate_series(1,100) n",[project,viewer]);
 await denied(()=>call());await denied(()=>call(viewer,'write','key-1','🌱'.repeat(1100)));
 assert.equal((await call(viewer,'write','key-1','1')).rows[0].v.value,'1');
 for(const role of ['anon','authenticated']){
  await db.exec('savepoint role_check');await db.exec(`set local role ${role}`);
  await assert.rejects(call());await db.exec('rollback to savepoint role_check');
  await db.exec('savepoint role_check');await db.exec(`set local role ${role}`);
  await assert.rejects(db.exec('select * from studio_app_records'));await db.exec('rollback to savepoint role_check');
 }
});
test('deletion hold blocks access and local erasure removes viewer data in other projects',async()=>{
 await call();await db.query('select studio_request_deletion($1)',[viewer]);await denied(()=>call());
 await db.query('select studio_erase_local_content($1,$2,(select requested_at from studio_deletion_requests where user_id=$2))',[owner,viewer]);
 assert.equal((await db.query('select * from studio_app_records')).rows.length,0);
 assert.equal((await db.query('select * from studio_app_requests')).rows.length,0);
 assert.equal((await db.query('select * from studio_projects')).rows.length,1);
});
test('project-wide daily budget applies across viewers and privacy inventory includes app data',async()=>{
 await call();
 const inventory=(await db.query<{v:{records:number;app_requests:number}}>('select studio_privacy_inventory($1) v',[viewer])).rows[0].v;
 assert.equal(inventory.records,1);assert.equal(inventory.app_requests,1);
 await db.query("insert into studio_app_requests select $1,$2,gen_random_uuid(),now() from generate_series(1,9999)",[project,other]);
 await denied(()=>call(owner,'read','score',null));
});
