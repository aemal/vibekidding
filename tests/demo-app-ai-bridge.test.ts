import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoAppAISession, demoAppAISdk } from '../src/lib/demo-app-ai-bridge';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(ask: (prompt:string,signal:AbortSignal)=>Promise<string> = async () => 'A creative idea') {
  const source = {}, session = randomUUID(), replies: {text?:string;error?:string}[] = [];
  const bridge = new DemoAppAISession({source,session,ask,reply:wire=>replies.push(JSON.parse(wire))});
  const event = (extra={}) => ({source,origin:'null',data:JSON.stringify({version:1,session,requestId:randomUUID(),operation:'ai.ask',prompt:'Draw an animal',...extra})});
  return {bridge,event,replies,source,session};
}
test('explicit opt in, exact binding and schema protect fixed capability', async () => {
  let calls=0;const t=setup(async()=>{calls++;return 'Idea'});
  t.bridge.handle(t.event());assert.equal(t.replies.at(-1)?.error,'disabled');assert.equal(calls,0);
  t.bridge.setEnabled(true);
  t.bridge.handle({...t.event(),source:{}});t.bridge.handle({...t.event(),origin:'https://example.com'});
  t.bridge.handle(t.event({session:randomUUID()}));t.bridge.handle(t.event({url:'https://example.com'}));t.bridge.handle(t.event({prompt:'x'.repeat(1001)}));
  await flush();assert.equal(calls,0);
  const event=t.event();t.bridge.handle(event);await flush();assert.equal(calls,1);assert.equal(t.replies.at(-1)?.text,'Idea');
  t.bridge.handle(event);await flush();assert.equal(calls,1);t.bridge.close();
});
test('three attempts persist across disable toggles and failed attempts consume budget', async () => {
  let calls=0;const t=setup(async()=>{calls++;throw new Error('private provider failure')});
  t.bridge.setEnabled(true);
  for(let i=0;i<3;i++){t.bridge.handle(t.event());await flush();t.bridge.setEnabled(false);t.bridge.setEnabled(true)}
  t.bridge.handle(t.event());await flush();assert.equal(calls,3);assert.equal(t.replies.at(-1)?.error,'limit');
  assert.ok(t.replies.every(r=>!JSON.stringify(r).includes('private')));t.bridge.close();
});
test('one pending request; disable aborts and rejects while late success is ignored', async () => {
  let resolve!: (value:string)=>void;let signal!:AbortSignal;let calls=0;
  const t=setup(async(_prompt,s)=>{calls++;signal=s;return new Promise<string>(done=>{resolve=done})});
  t.bridge.setEnabled(true);t.bridge.handle(t.event());await flush();t.bridge.handle(t.event());assert.equal(t.replies.at(-1)?.error,'busy');
  t.bridge.setEnabled(false);assert.equal(signal.aborted,true);assert.equal(t.replies.at(-1)?.error,'disabled');
  resolve('Late private reply');await flush();assert.equal(calls,1);assert.ok(!t.replies.some(r=>r.text));t.bridge.close();
});
test('close revokes pending and old session; invalid provider text is never forwarded', async () => {
  let resolve!:(value:string)=>void;let signal!:AbortSignal;
  const t=setup(async(_prompt,s)=>{signal=s;return new Promise<string>(done=>{resolve=done})});
  t.bridge.setEnabled(true);t.bridge.handle(t.event());await flush();t.bridge.close();assert.equal(signal.aborted,true);resolve('Late');await flush();assert.equal(t.replies.length,0);
  const oversized=setup(async()=> '🙂'.repeat(2000));oversized.bridge.setEnabled(true);oversized.bridge.handle(oversized.event());await flush();assert.equal(oversized.replies.at(-1)?.error,'unavailable');oversized.bridge.close();
});
test('SDK compiles, contains no fetch and rejects invalid bindings',()=>{
  const sdk=demoAppAISdk(randomUUID(),'http://127.0.0.1:3217');
  new Function(sdk.slice(8,-9));assert.equal(sdk.includes('fetch('),false);
  assert.throws(()=>demoAppAISdk('bad','http://127.0.0.1:3217'));
});
