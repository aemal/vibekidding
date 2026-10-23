import {test} from "node:test";
import assert from "node:assert/strict";
import {AppCapabilityPolicy} from "../src/lib/studio/app-capability-policy";
const source = {};
const config = {applicationOrigin:"https://studio.example",executionOrigin:"https://run.example",source,
 session:"synthetic_session_123",allowed:["record.read","record.write","ai.generate"] as const,durationMs:1000};
const request = {version:1,session:config.session,requestId:"request_identifier_001",operation:"record.read",key:"score"};
const event = (data:unknown=request) => ({source,origin:config.executionOrigin,data:JSON.stringify(data)});
test("capabilities bind exact source, origin, session and one-use request IDs",()=>{
 const policy = new AppCapabilityPolicy(config);
 for(const e of [{...event(),source:{}},{...event(),origin:"null"},{...event(),origin:"https://run.example.evil"},event({...request,session:"another_session_123"})])
  assert.throws(()=>policy.accept(e));
 assert.deepEqual(policy.accept(event()),request);
 assert.throws(()=>policy.accept(event()));
});
test("capabilities reject authority injection, unknown fields, oversized values and ungranted operations",()=>{
 const policy = new AppCapabilityPolicy({...config,allowed:["record.read"]});
 for(const data of [{...request,userId:"victim"},{...request,operation:"sql.execute"},{...request,operation:"ai.generate",prompt:"hello"},{...request,key:"../secret"},null,[]])
  assert.throws(()=>policy.accept(event(data)));
 const all = new AppCapabilityPolicy(config);
 assert.throws(()=>all.accept(event({...request,operation:"record.write",value:"🌻".repeat(1025)})));
 assert.throws(()=>all.accept(event({...request,operation:"ai.generate",key:undefined,prompt:" "})));
 assert.throws(()=>all.accept({...event(),data:" ".repeat(16385)}));
 assert.throws(()=>all.accept({...event(),data:request}));
 assert.equal(all.accept(event({...request,operation:"record.write",value:"🌻".repeat(1024)})).operation,"record.write");
 assert.equal(all.accept(event({version:1,session:config.session,requestId:"request_identifier_002",operation:"ai.generate",prompt:"Make a garden"})).operation,"ai.generate");
});
test("expiration, clock regression, close and quota stop further requests",()=>{
 let now=0;const p=new AppCapabilityPolicy(config,()=>now);
 now=1000;assert.throws(()=>p.accept(event()));now=0;assert.throws(()=>p.accept(event()));
 now=10;const reg=new AppCapabilityPolicy(config,()=>now);now=9;assert.throws(()=>reg.accept(event()));
 const quota=new AppCapabilityPolicy(config,()=>0);
 for(let n=0;n<100;n++) quota.accept(event({...request,requestId:`request_identifier_${n}`}));
 assert.throws(()=>quota.accept(event({...request,requestId:"request_identifier_101"})));
 const closed=new AppCapabilityPolicy(config);closed.close();assert.throws(()=>closed.accept(event()));
});
test("binding rejects same-origin or ambiguous origins and copies caller permissions",()=>{
 for(const executionOrigin of [config.applicationOrigin,"null","http://run.example","https://run.example/","https://run.example/path"])
  assert.throws(()=>new AppCapabilityPolicy({...config,executionOrigin}));
 const allowed:Array<"record.read"|"ai.generate">=["record.read"];
 const policy=new AppCapabilityPolicy({...config,allowed});allowed.push("ai.generate");
 assert.throws(()=>policy.accept(event({version:1,session:config.session,requestId:request.requestId,operation:"ai.generate",prompt:"hello"})));
});
