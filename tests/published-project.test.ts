import {test} from "node:test";
import assert from "node:assert/strict";
import {readPublishedProject} from "../src/lib/studio/published-project";
import {requiredSchemaRevision} from "../src/lib/studio/schema-status";
const ready={data:{revision:requiredSchemaRevision,ready:true},error:null};
const project={title:"Garden",html:"<p>Flowers</p>"};
test("publication read refuses disabled access, invalid routes and schema drift before content lookup",async()=>{
 let calls=0;const read=async()=>{calls++;return ready;};
 assert.equal(await readPublishedProject("ash","garden",false,read),null);
 assert.equal(await readPublishedProject("../ash","garden",true,read),null);assert.equal(calls,0);
 for(const result of [{...ready,error:{}},{data:{revision:requiredSchemaRevision-1,ready:true},error:null},{data:{revision:requiredSchemaRevision,ready:false},error:null}]) {
  let reads=0;
  assert.equal(await readPublishedProject("ash","garden",true,async name=>{assert.equal(name,"studio_schema_status");reads++;return result;}),null);
  assert.equal(reads,1);
 }
});
test("publication state is read fresh and only bounded display fields are returned",async()=>{
 let published=true;let count=0;
 const read=async(name:string,args:Record<string,string>)=>{
  if(name==="studio_schema_status")return ready;
  assert.deepEqual(args,{p_username:"ash",p_slug:"garden"});count++;
  return {data:published?[{...project,privateValue:"never-return"}]:[],error:null};
 };
 assert.deepEqual(await readPublishedProject("ash","garden",true,read),project);
 published=false;assert.equal(await readPublishedProject("ash","garden",true,read),null);assert.equal(count,2);
});
test("malformed, oversized and failed published results fail closed",async()=>{
 for(const data of [null,{},[],[project,project],[{title:5,html:"hello"}],[{...project,html:" "}],[{...project,html:"x".repeat(100001)}]])
  assert.equal(await readPublishedProject("ash","garden",true,async name=>name==="studio_schema_status"?ready:{data,error:null}),null);
 assert.equal(await readPublishedProject("ash","garden",true,async()=>{throw new Error("offline");}),null);
});
test("timeout aborts stalled reads and late schema completion cannot start a content lookup",async()=>{
 let resolve!: (value:typeof ready)=>void;let signal:AbortSignal|undefined;let calls=0;
 const result=await readPublishedProject("ash","garden",true,(_name,_args,s)=>{calls++;signal=s;return new Promise(r=>{resolve=r;});},10);
 assert.equal(result,null);assert.equal(signal?.aborted,true);resolve(ready);
 await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
});
