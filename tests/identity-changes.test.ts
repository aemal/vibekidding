import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const user='00000000-0000-4000-8000-000000000001';
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
 await db.query("insert into auth.users values($1,'old@example.test',now(),null)",[user]);
 await db.query("insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference,supervised_until,credits) values($1,'identity-test','old@example.test','approved',now(),'review',now()+interval '30 minutes',500)",[user]);
 await db.query("insert into studio_projects(owner_id,title,slug,html,published,review_requested) values($1,'Fixture','fixture','<p>Fixture</p>',true,true)",[user]);
 await db.query("insert into studio_parent_sessions values('fixture-hash',$1,now()+interval '15 minutes')",[user]);
});
after(()=>db.close());
async function profile(){return (await db.query<Record<string,unknown>>('select * from studio_profiles where id=$1',[user])).rows[0];}
test('routine sign-in updates preserve approval and safety revision',async()=>{
 const before=await profile();
 await db.query('update auth.users set last_sign_in_at=now() where id=$1',[user]);
 const after=await profile();
 assert.equal(after.status,'approved');assert.equal(after.safety_revision,before.safety_revision);
});
test('email change atomically revokes old approval, unlocks and publication without losing credits',async()=>{
 await db.query("update auth.users set email='new@example.test' where id=$1",[user]);
 const p=await profile();
 assert.equal(p.email,'new@example.test');assert.equal(p.status,'pending');
 assert.equal(p.email_verified_at,null);assert.equal(p.consent_reference,null);assert.equal(p.supervised_until,null);
 assert.equal(Number(p.credits),500);assert.equal(Number(p.safety_revision),1);
 assert.equal((await db.query('select * from studio_parent_sessions')).rows.length,0);
 const project=(await db.query<{published:boolean;review_requested:boolean}>('select * from studio_projects')).rows[0];
 assert.equal(project.published,false);assert.equal(project.review_requested,false);
 assert.equal((await db.query("select * from studio_published('identity-test','fixture')")).rows.length,0);
});
test('revoked email confirmation preserves suspension and requires new consent',async()=>{
 await db.query("update studio_profiles set status='suspended',email_verified_at=now(),consent_reference='new-review' where id=$1",[user]);
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[user]);
 const p=await profile();assert.equal(p.status,'suspended');assert.equal(p.email_verified_at,null);assert.equal(p.consent_reference,null);
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[user]);
 assert.equal((await profile()).status,'suspended');
});
test('admin review rejects stale revisions and commits approval with its audit record',async()=>{
 await db.query("update studio_profiles set email_verified_at=now(),status='pending' where id=$1",[user]);
 const r=Number((await profile()).safety_revision);
 const review=(revision:number)=>db.query("select studio_account_review($1,$1,true,$2,'review-reference')",[user,revision]);
 await assert.rejects(review(r-1));
 assert.equal((await profile()).status,'pending');
 await review(r);
 assert.equal((await profile()).status,'approved');
 assert.equal((await profile()).supervised_until,null);
 assert.equal((await db.query('select * from studio_audit')).rows.length,1);
 await assert.rejects(review(r));
 assert.equal((await db.query('select * from studio_audit')).rows.length,1);
});
test('suspension revokes sessions and publication in the same transaction',async()=>{
 await db.query("insert into studio_parent_sessions values('new-hash',$1,now()+interval '15 minutes')",[user]);
 await db.query('update studio_projects set published=true,review_requested=true where owner_id=$1',[user]);
 await db.query('select studio_account_review($1,$1,false,null,null)',[user]);
 assert.equal((await profile()).status,'suspended');
 assert.equal((await db.query('select * from studio_parent_sessions')).rows.length,0);
 assert.equal((await db.query<{published:boolean}>('select published from studio_projects')).rows[0].published,false);
 assert.equal((await db.query('select * from studio_audit')).rows.length,2);
});
test('guardian withdrawal stops access and sharing while retaining projects and credits',async()=>{
 await db.query("update studio_profiles set status='approved',consent_reference='consent',supervised_until=now()+interval '30 minutes' where id=$1",[user]);
 await db.query("insert into studio_parent_sessions values('withdraw-hash',$1,now()+interval '15 minutes')",[user]);
 await db.query('update studio_projects set published=true,review_requested=true where owner_id=$1',[user]);
 const before=await profile();
 await db.query('select studio_withdraw_consent($1)',[user]);
 const p=await profile();
 assert.equal(p.status,'pending');assert.equal(p.consent_reference,null);assert.equal(p.supervised_until,null);
 assert.equal(p.credits,before.credits);assert.ok(Number(p.safety_revision)>Number(before.safety_revision));
 assert.equal((await db.query('select * from studio_parent_sessions')).rows.length,0);
 const projects=(await db.query<{published:boolean}>('select published from studio_projects')).rows;
 assert.equal(projects.length,1);assert.equal(projects[0].published,false);
 await db.query("update studio_profiles set status='suspended' where id=$1",[user]);
 await db.query('select studio_withdraw_consent($1)',[user]);
 assert.equal((await profile()).status,'suspended');
});
test('parent unlock rejects stale safety state, mismatched email and malformed tokens',async()=>{
 await db.query("update studio_profiles set email_verified_at=now(),consent_reference='synthetic-consent' where id=$1",[user]);
 const r=Number((await profile()).safety_revision);
 const unlock=(hash:string,email:string,revision:number)=>db.query('select studio_parent_unlock($1,$2,$3,$4)',[user,hash,email,revision]);
 await assert.rejects(unlock('a'.repeat(64),'new@example.test',r-1));
 await assert.rejects(unlock('a'.repeat(64),'old@example.test',r));
 await assert.rejects(unlock('invalid','new@example.test',r));
 assert.equal((await db.query('select * from studio_parent_sessions')).rows.length,0);
 // Suspended guardians may still review/delete history; this unlock does not restore access.
 await unlock('a'.repeat(64),'new@example.test',r);
 assert.equal((await profile()).status,'suspended');
 const session=(await db.query<{remaining:number}>('select extract(epoch from expires_at-clock_timestamp())::float8 remaining from studio_parent_sessions')).rows[0];
 assert.ok(session.remaining>890 && session.remaining<=900);
 await db.query('select studio_withdraw_consent($1)',[user]);
 assert.equal((await db.query('select * from studio_parent_sessions')).rows.length,0);
 await assert.rejects(unlock('b'.repeat(64),'new@example.test',r));
});
test('parent attempt limits persist per operation and reset only after expiry',async()=>{
 const attempt=async(op:string)=>(await db.query<{allowed:boolean}>('select studio_parent_attempt($1,$2) allowed',[user,op])).rows[0].allowed;
 for(let i=0;i<3;i++) assert.equal(await attempt('send-code'),true);
 assert.equal(await attempt('send-code'),false);
 for(let i=0;i<10;i++) assert.equal(await attempt('unlock'),true);
 assert.equal(await attempt('unlock'),false);
 await assert.rejects(attempt('invalid'));
 const rows=await db.query<{operation:string;attempts:number}>('select operation,attempts from studio_parent_attempts order by operation');
 assert.deepEqual(rows.rows,[{operation:'send-code',attempts:3},{operation:'unlock',attempts:10}]);
 await db.query("update studio_parent_attempts set window_ends_at=now()-interval '1 second' where user_id=$1 and operation='send-code'",[user]);
 assert.equal(await attempt('send-code'),true);
 assert.equal(await attempt('unlock'),false);
 assert.equal((await db.query<{attempts:number}>("select attempts from studio_parent_attempts where operation='send-code'")).rows[0].attempts,1);
});
