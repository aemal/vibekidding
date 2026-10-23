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
 await db.query("select studio_reserve($1,$2,'typesafe','fixture',100,0)",[user,usage]);
 await db.query("update studio_usage set created_at=now()-interval '2 hours',provider_request_id='request-fixture' where id=$1",[usage]);
});
afterEach(()=>db.exec("rollback"));
const row={usageId:usage,provider:"typesafe",requestId:"request-fixture",chargeMicroUsd:40};
const run=(apply:boolean,rows:unknown[]=[row],digest="a".repeat(64))=>db.query<{result:{eligible:number;already_imported:number}}>("select studio_billing_import($1,$2,$3,$4) result",[user,digest,JSON.stringify(rows),apply]);
test("billing preview is read-only, apply is audited, identical replay is idempotent",async()=>{
 assert.equal((await run(false)).rows[0].result.eligible,1);
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),900);
 await run(true);
 assert.equal((await run(true)).rows[0].result.already_imported,1);
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),960);
 assert.equal(Number((await db.query<{n:number}>("select count(*) n from studio_billing_imports")).rows[0].n),1);
});
test("billing import rejects mismatch, duplicate, overrun and conflicting evidence",async()=>{
 for(const rows of [[{...row,requestId:"other"}],[row,row],[{...row,chargeMicroUsd:101}]]){
  await db.exec("savepoint bad");await assert.rejects(run(true,rows));await db.exec("rollback to savepoint bad");
 }
 await run(true);await db.exec("savepoint conflict");
 await assert.rejects(run(true,[row],"b".repeat(64)),/Conflicting/);await db.exec("rollback to savepoint conflict");
});
test("one invalid row rolls back the complete imported batch",async()=>{
 await db.exec("savepoint batch");
 await assert.rejects(run(true,[row,{...row,usageId:"ffffffff-ffff-ffff-ffff-ffffffffffff",requestId:"missing"}]));
 await db.exec("rollback to savepoint batch");
 assert.equal((await db.query<{state:string}>("select state from studio_usage")).rows[0].state,"reserved");
 assert.equal(Number((await db.query<{n:number}>("select count(*) n from studio_billing_imports")).rows[0].n),0);
});

import {parseBillingImport} from "../src/lib/studio/billing-import";
test("normalized billing parser rejects ambiguous, excessive or duplicate input",()=>{
 assert.equal(parseBillingImport(JSON.stringify([row])).digest.length,64);
 for(const value of [[],[row,row],[{...row,chargeMicroUsd:0.5}],[{...row,extra:"untrusted"}], [{...row,provider:"other"}]])
  assert.throws(()=>parseBillingImport(JSON.stringify(value)));
 assert.throws(()=>parseBillingImport(" ".repeat(100001)));
});
