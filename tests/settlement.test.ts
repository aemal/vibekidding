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
beforeEach(async()=>{await db.exec("begin");await db.query("select studio_reserve($1,$2,'typesafe','fixture',100,0)",[user,usage]);});
afterEach(()=>db.exec("rollback"));
const settle=(charge:number|null,input:number|null,output:number|null)=>db.query("select studio_settle($1,$2,$3,$4)",[usage,charge,input,output]);
test("settlement accepts exact replay but rejects conflicting charge or token evidence",async()=>{
 await settle(40,10,20);await settle(40,10,20);
 // Separate savepoints let PostgreSQL recover from expected statement failures.
 for(const values of [[41,10,20],[40,11,20],[40,null,null]] as const){
  await db.exec("savepoint rejected");
  await assert.rejects(settle(values[0],values[1],values[2]),/conflicts/);
  await db.exec("rollback to savepoint rejected");
 }
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),960);
 assert.equal(Number((await db.query<{reserved:number}>("select reserved from studio_budget")).rows[0].reserved),40);
});
test("invalid values preserve the reservation; paired unknown tokens support reviewed reconciliation",async()=>{
 for(const values of [[null,0,0],[-1,0,0],[40,-1,0],[40,null,0],[101,0,0]] as const){
  await db.exec("savepoint rejected");
  await assert.rejects(settle(values[0],values[1],values[2]));
  await db.exec("rollback to savepoint rejected");
 }
 assert.equal((await db.query<{state:string}>("select state from studio_usage")).rows[0].state,"reserved");
 await settle(40,null,null);await settle(40,null,null);
 assert.equal(Number((await db.query<{credits:number}>("select credits from studio_profiles")).rows[0].credits),960);
});
