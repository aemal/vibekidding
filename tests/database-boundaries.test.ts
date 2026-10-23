import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
before(async () => {
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
});
after(()=>db.close());
test('every studio table has row security and denies all browser write privileges',async()=>{
 const tables=(await db.query<{name:string;rls:boolean}>("select relname name,relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and relname like 'studio_%' order by relname")).rows;
 assert.ok(tables.length>=15);
 for(const table of tables){
  assert.equal(table.rls,true,table.name);
  for(const role of ['anon','authenticated']) for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
   const result=(await db.query<{allowed:boolean}>('select has_table_privilege($1,$2,$3) allowed',[role,table.name,privilege])).rows[0];
   assert.equal(result.allowed,false,`${role} ${privilege} ${table.name}`);
  }
 }
});
test('security-definer procedures fix search_path and deny browser execution except room visibility',async()=>{
 const functions=(await db.query<{signature:string;name:string;config:string[];oid:number}>("select p.oid,p.oid::regprocedure::text signature,p.proname name,p.proconfig config from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like 'studio_%'")).rows;
 assert.ok(functions.length>10);
 for(const fn of functions){
  assert.ok(fn.config?.includes('search_path=public'),fn.signature);
  for(const role of ['anon','authenticated']) {
   const result=(await db.query<{allowed:boolean}>('select has_function_privilege($1,$2::oid,\'EXECUTE\') allowed',[role,fn.oid])).rows[0];
   assert.equal(result.allowed,role==='authenticated' && fn.name==='studio_room_visible',`${role} ${fn.signature}`);
  }
 }
});
test('sensitive histories and financial tables have no browser read access',async()=>{
 for(const table of ['studio_activity','studio_parent_alerts','studio_parent_sessions','studio_mail_jobs','studio_mail_events','studio_audit']){
  for(const role of ['anon','authenticated']) {
   const result=(await db.query<{allowed:boolean}>('select has_table_privilege($1,$2,\'SELECT\') allowed',[role,table])).rows[0];
   assert.equal(result.allowed,false,`${role} ${table}`);
  }
 }
});
test('families can read their own charges but never another family ledger',async()=>{
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 await db.exec('grant usage on schema auth to authenticated');
 for(const [i,id] of ids.entries()){
  await db.query('insert into auth.users values($1)',[id]);
  await db.query("insert into studio_profiles(id,username,email,status,supervised_until) values($1,$2,'fixture@example.test','approved',now()+interval '30 minutes')",[id,`family-${i}`]);
  await db.query("insert into studio_usage(id,user_id,provider,model,reserved) values(gen_random_uuid(),$1,'typesafe','fixture',10)",[id]);
 }
 for(const id of ids){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
  try{
   const rows=(await db.query<{user_id:string}>('select user_id from studio_usage')).rows;
   assert.deepEqual(rows.map(r=>r.user_id),[id]);
  }finally{await db.exec('reset role');}
 }
});
test('schema preflight fails closed if RLS, write privileges or identity triggers drift',async()=>{
 const ready=async()=> (await db.query<{status:{ready:boolean;revision:number}}>('select studio_schema_status() status')).rows[0].status;
 assert.deepEqual(await ready(),{ready:true,revision:29});
 await db.exec('alter table studio_profiles disable row level security');assert.equal((await ready()).ready,false);
 await db.exec('alter table studio_profiles enable row level security');
 await db.exec('grant update on studio_profiles to authenticated');assert.equal((await ready()).ready,false);
 await db.exec('revoke update on studio_profiles from authenticated');
 await db.exec('alter table auth.users disable trigger studio_identity_changed');assert.equal((await ready()).ready,false);
 await db.exec('alter table auth.users enable trigger studio_identity_changed');assert.equal((await ready()).ready,true);
});
test('privacy inventory returns only the selected family counts and unresolved billing',async()=>{
 const user='00000000-0000-4000-8000-000000000001';
 const other='00000000-0000-4000-8000-000000000002';
 await db.query("insert into studio_projects(owner_id,title,slug,html,published) values($1,'Private title','private','sensitive code',true)",[user]);
 await db.query("insert into studio_projects(owner_id,title,slug) values($1,'Other project','other')",[other]);
 const inventory=async(id:string)=>(await db.query<{value:Record<string,number>|null}>('select studio_privacy_inventory($1) value',[id])).rows[0].value;
 const first=await inventory(user), second=await inventory(other);
 assert.equal(first?.projects,1);assert.equal(first?.published_projects,1);
 assert.equal(second?.projects,1);assert.equal(second?.published_projects,0);
 assert.equal(first?.usage_records,1);assert.equal(first?.unsettled_usage,1);
 await db.query("update studio_usage set state='settled',charged=10 where user_id=$1",[user]);
 assert.equal((await inventory(user))?.unsettled_usage,0);
 assert.equal((await inventory(other))?.unsettled_usage,1);
 assert.ok(Object.values(first!).every(v=>typeof v==='number'));
 assert.equal(await inventory('00000000-0000-4000-8000-000000000099'),null);
});
