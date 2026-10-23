import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const host='00000000-0000-4000-8000-000000000001',guest='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003';
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 for(const [id,name] of [[host,'host-test'],[guest,'guest-test'],[stranger,'stranger-test']]){
  await db.query('insert into auth.users values($1)',[id]);
  await db.query("insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference,supervised_until) values($1,$2,'guardian@example.test','approved',now(),'consent-review',now()+interval '30 minutes')",[id,name]);
 }
});
after(()=>db.close());
async function supervision(id:string,active:boolean){await db.query("update studio_profiles set supervised_until=case when $2 then now()+interval '30 minutes' else now()-interval '1 second' end where id=$1",[id,active]);}
async function createRoom(){return (await db.query<{id:string}>('select (studio_room_create($1)).id',[host])).rows[0].id;}
test('project, storage and room creation recheck supervision inside SQL',async()=>{
 const p=(await db.query<{id:string}>("select (studio_project_create($1,'Garden','garden-test')).id",[host])).rows[0].id;
 await supervision(host,false);
 await assert.rejects(db.query("select studio_project_create($1,'Another','another-test')",[host]));
 await assert.rejects(db.query("select studio_record_put($1,$2,'key','{}')",[host,p]));
 await assert.rejects(createRoom());
 await supervision(host,true);
 await db.query("select studio_record_put($1,$2,'key','{}')",[host,p]);
});
test('paused host or guest blocks joins and moves; active game resumes',async()=>{
 const room=await createRoom();
 await supervision(host,false);
 await assert.rejects(db.query('select studio_room_action($1,$2,null)',[guest,room]));
 await supervision(host,true);
 await db.query('select studio_room_action($1,$2,null)',[guest,room]);
 await supervision(guest,false);
 await assert.rejects(db.query('select studio_room_action($1,$2,0)',[host,room]));
 await supervision(guest,true);
 await db.query('select studio_room_action($1,$2,0)',[host,room]);
 await assert.rejects(db.query('select studio_room_action($1,$2,1)',[stranger,room]));
});
test('realtime read policy hides paused rooms from both members and outsiders',async()=>{
 const room=await createRoom();
 await db.query('select studio_room_action($1,$2,null)',[guest,room]);
 async function visible(id:string){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
  try{return (await db.query('select id from studio_rooms where id=$1',[room])).rows.length;}finally{await db.exec('reset role');}
 }
 assert.equal(await visible(host),1);assert.equal(await visible(guest),1);assert.equal(await visible(stranger),0);
 await supervision(host,false);
 assert.equal(await visible(host),0);assert.equal(await visible(guest),0);
 await supervision(host,true);
 assert.equal(await visible(guest),1);
});
test('service callers cannot bypass supervised wrappers through renamed originals',async()=>{
 await db.exec('set role service_role');
 await assert.rejects(db.query("select studio_project_create_unchecked($1,'Bypass','bypass-test')",[host]));
 await assert.rejects(db.query('select studio_room_create_unchecked($1)',[host]));
 await assert.rejects(db.query('select studio_require_supervision($1)',[host]));
 await db.exec('reset role');
});
test('publication requires exact reviewed content, request and current owner approval',async()=>{
 const p=(await db.query<{id:string}>("select (studio_project_create($1,'Public garden','public-garden')).id",[host])).rows[0].id;
 await db.query("update studio_projects set html='<p>Garden</p>' where id=$1",[p]);
 const publish=()=>db.query("select studio_publish($1,$2,'<p>Garden</p>',true)",[host,p]);
 await assert.rejects(publish());
 await db.query('update studio_projects set review_requested=true where id=$1',[p]);
 await assert.rejects(db.query("select studio_publish($1,$2,'<p>Stale</p>',true)",[host,p]));
 await db.query("update studio_profiles set status='suspended' where id=$1",[host]);await assert.rejects(publish());
 await db.query("update studio_profiles set status='approved',consent_reference='consent-review' where id=$1",[host]);await publish();
 assert.equal((await db.query("select * from studio_published('host-test','public-garden')")).rows.length,1);
 await db.query('update studio_profiles set consent_reference=null where id=$1',[host]);
 assert.equal((await db.query("select * from studio_published('host-test','public-garden')")).rows.length,0);
 await db.query("select studio_publish($1,$2,'<p>Garden</p>',false)",[host,p]);
 assert.equal((await db.query('select * from studio_audit where subject=$1',[host])).rows.length,2);
});

test('fixed-schema storage isolates owner reads and rejects cross-family writes',async()=>{
 // The publication fixture withdraws consent; restore this synthetic account.
 await db.query("update studio_profiles set status='approved',consent_reference='consent-review' where id=$1",[host]);
 await supervision(host,true);
 const p=(await db.query<{id:string}>("select (studio_project_create($1,'Storage','storage-isolation')).id",[host])).rows[0].id;
 await db.query("select studio_record_put($1,$2,'score','42')",[host,p]);
 await assert.rejects(db.query("select studio_record_put($1,$2,'score','99')",[guest,p]),/Not your project/);
 for(const [who,count] of [[host,1],[guest,0]] as const){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);
  await db.exec('set role authenticated');
  try {
   assert.equal((await db.query('select value from studio_records where project_id=$1',[p])).rows.length,count);
   await assert.rejects(db.query("insert into studio_records values($1,$2,'direct','1')",[p,who]));
  } finally {await db.exec('reset role');}
 }
});
test('storage enforces key and UTF-8 payload bounds without replacing existing data',async()=>{
 const p=(await db.query<{id:string}>("select (studio_project_create($1,'Limits','storage-limits')).id",[host])).rows[0].id;
 await db.query("select studio_record_put($1,$2,'saved','42')",[host,p]);
 for(const [key,value] of [['','0'],['x'.repeat(101),'0'],['saved',JSON.stringify('🌱'.repeat(2100))]]){
  await assert.rejects(db.query('select studio_record_put($1,$2,$3,$4)',[host,p,key,value]));
 }
 assert.equal((await db.query<{value:number}>("select value from studio_records where project_id=$1 and key='saved'",[p])).rows[0].value,42);
});
test('storage quota allows updating existing keys but rejects the 101st record',async()=>{
 const p=(await db.query<{id:string}>("select (studio_project_create($1,'Quota','storage-quota')).id",[host])).rows[0].id;
 for(let i=0;i<100;i++) await db.query("select studio_record_put($1,$2,$3,'0')",[host,p,`key-${i}`]);
 await assert.rejects(db.query("select studio_record_put($1,$2,'overflow','0')",[host,p]),/Storage quota/);
 await db.query("select studio_record_put($1,$2,'key-0','1')",[host,p]);
 assert.equal(Number((await db.query<{n:number}>('select count(*) n from studio_records where project_id=$1',[p])).rows[0].n),100);
 assert.equal((await db.query<{value:number}>("select value from studio_records where project_id=$1 and key='key-0'",[p])).rows[0].value,1);
});
