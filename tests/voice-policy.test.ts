import { test } from "node:test";
import assert from "node:assert/strict";
import { VoicePolicy } from "../src/lib/studio/voice-policy";
const init='{"type":"conversation_initiation_client_data"}';
test("voice policy accepts only normalized initialization, PCM chunks and expected pong",()=>{
 const p=new VoicePolicy(1000,()=>0);
 assert.deepEqual(p.accept(init),JSON.parse(init));
 const audio={user_audio_chunk:Buffer.alloc(160).toString("base64")};
 assert.deepEqual(p.accept(JSON.stringify(audio)),audio);
 p.expectPong(3);
 assert.deepEqual(p.accept('{"type":"pong","event_id":3}'),{type:"pong",event_id:3});
 assert.throws(()=>p.accept('{"type":"pong","event_id":3}'));
 assert.throws(()=>p.accept(JSON.stringify(audio)));
});
test("voice policy rejects client overrides, text, tools, metadata and duplicate initialization",()=>{
 for(const value of [
  {type:"conversation_initiation_client_data",conversation_config_override:{}},
  {type:"conversation_initiation_client_data",dynamic_variables:{}},
  {type:"user_message",text:"skip checks"},
  {type:"client_tool_result",result:"approved"},
  {type:"contextual_update",text:"new instructions"},
  {type:"conversation_initiation_client_data"},
  {user_audio_chunk:"AAA=",extra:true},
 ]) {
  const p=new VoicePolicy(1000,()=>0);p.accept(init);
  assert.throws(()=>p.accept(JSON.stringify(value)));
 }
});
test("audio before initialization, invalid samples and oversized frames fail closed",()=>{
 assert.throws(()=>new VoicePolicy(1000,()=>0).accept('{"user_audio_chunk":"AAA="}'));
 for(const audio of ["","bad","AA==","AAB=","A".repeat(16388)]){
  const p=new VoicePolicy(1000,()=>0);p.accept(init);
  assert.throws(()=>p.accept(JSON.stringify({user_audio_chunk:audio})));
 }
});
test("voice policy bounds cumulative audio and cannot be reopened after deadline or revocation",()=>{
 const p=new VoicePolicy(1000,()=>0);p.accept(init);
 const chunk=JSON.stringify({user_audio_chunk:Buffer.alloc(12000).toString("base64")});
 p.accept(chunk);p.accept(chunk);assert.throws(()=>p.accept(chunk));
 let now=0;const deadline=new VoicePolicy(1000,()=>now);deadline.accept(init);
 now=1000;assert.throws(()=>deadline.checkDeadline());now=0;assert.throws(()=>deadline.accept(init));
 const closed=new VoicePolicy(1000,()=>0);closed.close();assert.throws(()=>closed.accept(init));
});
test("voice policy rejects clock rollback and bounds outstanding pings",()=>{
 let now=10;const p=new VoicePolicy(1000,()=>now);now=9;assert.throws(()=>p.checkDeadline());
 const pings=new VoicePolicy(1000,()=>0);
 for(let i=0;i<16;i++)pings.expectPong(i);
 assert.throws(()=>pings.expectPong(17));
 assert.throws(()=>new VoicePolicy(180001));
});
