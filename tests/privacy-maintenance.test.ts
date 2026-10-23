import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
before(async () => {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;");
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.query('insert into auth.users values($1)', [user]);
  await db.query("insert into studio_profiles(id,username,email) values($1,'privacy-test','parent@example.test')", [user]);
});
after(() => db.close());
async function count(table: string) { return (await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0].n; }
test('maintenance expires history and related notification records, preserving recent history', async () => {
  const old = (await db.query<{ id: string }>("insert into studio_activity(user_id,role,content,decision,created_at) values($1,'user','synthetic old history','blocked',now()-interval '31 days') returning id", [user])).rows[0].id;
  await db.query("insert into studio_activity(user_id,role,content,decision) values($1,'user','synthetic recent history','clear')", [user]);
  const alert = (await db.query<{ id: string }>('insert into studio_parent_alerts(user_id,activity_id) values($1,$2) returning id', [user, old])).rows[0].id;
  await db.query("insert into studio_mail_jobs(id,kind,user_id,payload,provider_id) values($1,'parent',$2,'{}','privacy-provider')", [alert, user]);
  await db.exec("insert into studio_mail_events(id,provider_id,event_type,occurred_at) values('privacy-event','privacy-provider','email.delivered',now())");
  await db.exec('select studio_privacy_maintenance()');
  assert.equal(await count('studio_activity'), 1);
  assert.equal(await count('studio_parent_alerts'), 0);
  assert.equal(await count('studio_mail_jobs'), 0);
  assert.equal(await count('studio_mail_events'), 0);
});
test('only expired sessions, rooms and old orphan delivery events are removed', async () => {
  for (const expired of [true, false]) {
    await db.query("insert into studio_parent_sessions(token_hash,user_id,expires_at) values($1,$2,now()+$3::interval)", [String(expired),user,expired?'-1 hour':'1 hour']);
    await db.query("insert into studio_rooms(host,expires_at) values($1,now()+$2::interval)", [user,expired?'-1 hour':'1 hour']);
    await db.query("insert into studio_mail_events(id,provider_id,event_type,occurred_at,received_at) values($1,$1,'email.delivered',now(),now()+$2::interval)", [String(expired),expired?'-31 days':'-1 day']);
  }
  await db.exec('select studio_privacy_maintenance()');
  assert.equal(await count('studio_parent_sessions'),1);
  assert.equal(await count('studio_rooms'),1);
  assert.equal(await count('studio_mail_events'),1);
  const again = (await db.query<{ result: Record<string, number> }>('select studio_privacy_maintenance() result')).rows[0].result;
  assert.deepEqual(again,{activities:0,sessions:0,rooms:0,events:0,voice_admissions:0});
});
test('cleanup is bounded per pass and cannot be invoked by browser roles', async () => {
  await db.query("insert into studio_activity(user_id,role,content,decision,created_at) select $1,'user','synthetic','clear',now()-interval '31 days' from generate_series(1,1001)", [user]);
  const result = (await db.query<{ result: { activities: number } }>('select studio_privacy_maintenance() result')).rows[0].result;
  assert.equal(result.activities,1000);
  assert.equal(await count('studio_activity'),2);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(db.exec('select studio_privacy_maintenance()')); } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { await db.exec('select studio_privacy_maintenance()'); } finally { await db.exec('reset role'); }
  assert.equal(await count('studio_activity'),1);
});
