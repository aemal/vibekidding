import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { maximumCost, sandboxDocument } from "../src/lib/studio/sandbox";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003";
const q = (sql: string, params: unknown[] = []) =>
  db.query<{ id: string; credits: number; winner: string }>(sql, params);
before(async () => {
  await db.exec(
    `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated;`,
  );
  await db.exec(
    await readFile("supabase/migrations/202610190001_studio.sql", "utf8"),
  );
  for (const [id, name] of [
    [a, "alpha"],
    [b, "bravo"],
    [c, "charlie"],
  ]) {
    await q("insert into auth.users values($1)", [id]);
    await q(
      "insert into studio_profiles(id,username,email,status,email_verified_at,consent_reference,credits) values($1,$2,'guardian@example.test','approved',now(),'review-123',1000)",
      [id, name],
    );
  }
  await q(
    "insert into studio_models(id,input_rate,output_rate,enabled) values('test-model',1000000,2000000,true)",
  );
  for (const id of [a, b])
    await q("insert into studio_model_grants values($1,'test-model')", [id]);
});
after(() => db.close());
test("concurrent reservations cannot overspend", async () => {
  const outcomes = await Promise.allSettled([
    q(
      "select studio_reserve($1,'10000000-0000-4000-8000-000000000001','openai','test-model',700)",
      [a],
    ),
    q(
      "select studio_reserve($1,'10000000-0000-4000-8000-000000000002','openai','test-model',700)",
      [a],
    ),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const p = await q("select credits from studio_profiles where id=$1", [a]);
  assert.equal(Number((p.rows[0] as { credits: number }).credits), 300);
});
test("settlement refunds once and cannot overcharge", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  await assert.rejects(q("select studio_settle($1,701,1,1)", [id]));
  await q("select studio_settle($1,200,10,20)", [id]);
  await q("select studio_settle($1,200,10,20)", [id]);
  const p = await q("select credits from studio_profiles where id=$1", [a]);
  assert.equal(Number((p.rows[0] as { credits: number }).credits), 800);
});
test("idempotent grant and rejected negative balance", async () => {
  const id = "20000000-0000-4000-8000-000000000001";
  await q("select studio_grant($1,$2,100,$3)", [a, b, id]);
  await q("select studio_grant($1,$2,100,$3)", [a, b, id]);
  assert.equal(
    Number(
      (await q("select credits from studio_profiles where id=$1", [b])).rows[0]
        .credits,
    ),
    1100,
  );
  await assert.rejects(
    q(
      "select studio_grant($1,$2,-2000,'20000000-0000-4000-8000-000000000002')",
      [a, b],
    ),
  );
});
test("ungranted models, suspended and unverified users cannot spend", async () => {
  await assert.rejects(
    q("select studio_reserve($1,gen_random_uuid(),'openai','test-model',10)", [
      c,
    ]),
  );
  await q("update studio_profiles set status='suspended' where id=$1", [b]);
  await assert.rejects(
    q("select studio_reserve($1,gen_random_uuid(),'openai','test-model',10)", [
      b,
    ]),
  );
  await q(
    "update studio_profiles set status='approved',email_verified_at=null where id=$1",
    [b],
  );
  await assert.rejects(
    q("select studio_reserve($1,gen_random_uuid(),'openai','test-model',10)", [
      b,
    ]),
  );
  await q("update studio_profiles set email_verified_at=now() where id=$1", [
    b,
  ]);
});
test("global and per-user daily caps fail closed", async () => {
  await q("update studio_profiles set daily_cap=1 where id=$1", [b]);
  await assert.rejects(
    q("select studio_reserve($1,gen_random_uuid(),'openai','test-model',10)", [
      b,
    ]),
  );
  await q("update studio_profiles set daily_cap=1000000 where id=$1", [b]);
  await q("update studio_budget set cap=reserved");
  await assert.rejects(
    q("select studio_reserve($1,gen_random_uuid(),'openai','test-model',10)", [
      b,
    ]),
  );
  await q("update studio_budget set cap=5000000");
});
test("RLS hides other users and denies direct grants and writes", async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
  try {
    assert.equal((await q("select * from studio_profiles")).rows.length, 1);
    assert.equal(
      (await q("select * from studio_profiles where id=$1", [b])).rows.length,
      0,
    );
    await assert.rejects(
      q("update studio_profiles set credits=999999 where id=$1", [a]),
    );
    await assert.rejects(
      q("select studio_grant($1,$1,100,gen_random_uuid())", [a]),
    );
    await assert.rejects(q("select * from studio_outbox"));
  } finally {
    await db.exec("reset role");
  }
});
test("room membership, turn order, racing moves, and win validation", async () => {
  const r = await q("insert into studio_rooms(host) values($1) returning id", [
      a,
    ]),
    id = r.rows[0].id;
  await q("select studio_room_action($1,$2,null)", [b, id]);
  await assert.rejects(q("select studio_room_action($1,$2,null)", [c, id]));
  await assert.rejects(q("select studio_room_action($1,$2,0)", [b, id]));
  const outcomes = await Promise.allSettled([
    q("select studio_room_action($1,$2,0)", [a, id]),
    q("select studio_room_action($1,$2,1)", [a, id]),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  await q("select studio_room_action($1,$2,3)", [b, id]);
  await q("select studio_room_action($1,$2,1)", [a, id]);
  await q("select studio_room_action($1,$2,4)", [b, id]);
  await q("select studio_room_action($1,$2,2)", [a, id]);
  assert.equal(
    (await q("select winner from studio_rooms where id=$1", [id])).rows[0]
      .winner,
    "X",
  );
  await assert.rejects(q("select studio_room_action($1,$2,5)", [b, id]));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${c}';`);
  try {
    assert.equal((await q("select * from studio_rooms")).rows.length, 0);
  } finally {
    await db.exec("reset role");
  }
});
test("unapproved consent and expired rooms are denied", async () => {
  await q("update studio_profiles set consent_reference=null where id=$1", [c]);
  await assert.rejects(
    q("select studio_reserve($1,gen_random_uuid(),'elevenlabs','voice',10)", [
      c,
    ]),
  );
  const r = await q(
    "insert into studio_rooms(host,expires_at) values($1,now()-interval '1 hour') returning id",
    [a],
  );
  await assert.rejects(
    q("select studio_room_action($1,$2,null)", [b, r.rows[0].id]),
  );
});
test("generated code sandbox denies network and same-origin access", () => {
  const doc = sandboxDocument('<script>fetch("https://example.test")</script>');
  assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("<script>"));
  assert.match(doc, /connect-src 'none'/);
  assert.match(doc, /form-action 'none'/);
  assert.match(doc, /base-uri 'none'/);
  assert.equal(maximumCost(1000, 2000, 1000000, 2000000), 6024);
});

test("fixed-schema storage enforces ownership and record size", async () => {
  const p = await q(
    "insert into studio_projects(owner_id,title,slug) values($1,'Test','test-project') returning id",
    [a],
  );
  const id = p.rows[0].id;
  await q("select studio_record_put($1,$2,'score','{}'::jsonb)", [a, id]);
  await assert.rejects(
    q("select studio_record_put($1,$2,'score','{}'::jsonb)", [b, id]),
  );
  await assert.rejects(
    q("select studio_record_put($1,$2,'big',$3::jsonb)", [
      a,
      id,
      JSON.stringify("x".repeat(9000)),
    ]),
  );
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}';`);
  try {
    assert.equal((await q("select * from studio_records")).rows.length, 0);
  } finally {
    await db.exec("reset role");
  }
});

test("creation quotas apply in the database", async () => {
  for (let i = 0; i < 5; i++) await q("select studio_room_create($1)", [b]);
  await assert.rejects(q("select studio_room_create($1)", [b]));
  for (let i = 0; i < 50; i++)
    await q("select studio_project_create($1,$2,$3)", [
      b,
      `Project ${i}`,
      `project-${i}`,
    ]);
  await assert.rejects(
    q("select studio_project_create($1,'Extra','extra-project')", [b]),
  );
});
