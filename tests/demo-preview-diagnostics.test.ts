import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { DemoPreviewDiagnostics, demoPreviewDiagnosticsSdk, PREVIEW_PROBLEM_MESSAGE, PREVIEW_REPAIR_PROMPT } from '../src/lib/demo-preview-diagnostics';

function setup(){const source={},session=randomUUID(),host=new DemoPreviewDiagnostics({source,session});const wire=(category='runtime-error')=>JSON.stringify({version:1,session,operation:'preview.problem',category});return{source,session,host,wire}}
test('current opaque frame yields only fixed generic categories and messages',()=>{
 const {source,host,wire}=setup();assert.deepEqual(host.handle({source,origin:'null',data:wire()}),{category:'runtime-error',message:PREVIEW_PROBLEM_MESSAGE});assert.equal(host.handle({source,origin:'null',data:wire('unhandled-rejection')})?.category,'unhandled-rejection');
});
test('wrong source/origin/session and payload extensions cannot impersonate diagnostics',()=>{
 const {source,session,host,wire}=setup();const data=wire();
 for(const event of [{source:{},origin:'null',data},{source,origin:'https://example.com',data},{source,origin:'null',data:data.replace(session,randomUUID())},{source,origin:'null',data:JSON.stringify({...JSON.parse(data),message:'private input'})},{source,origin:'null',data:wire('unknown')},{source,origin:'null',data:' '.repeat(513)},{source,origin:'null',data:'not json'}])assert.equal(host.handle(event),undefined);
 assert.ok(host.handle({source,origin:'null',data}));
});
test('parent caps reports and revokes stale sessions on close',()=>{
 const {source,host,wire}=setup();for(let i=0;i<3;i++)assert.ok(host.handle({source,origin:'null',data:wire()}));assert.equal(host.handle({source,origin:'null',data:wire()}),undefined);
 const next=setup();next.host.close();assert.equal(next.host.handle({source:next.source,origin:'null',data:next.wire()}),undefined);
});
test('SDK ignores all error data, caps messages and stops after teardown',()=>{
 const callbacks=new Map<string,()=>void>(),sent:{text:string;origin:string}[]=[];
 const script=demoPreviewDiagnosticsSdk(randomUUID(),'https://example.com').slice(8,-9);
 runInNewContext(script,{addEventListener:(name:string,fn:()=>void)=>callbacks.set(name,fn),removeEventListener:(name:string)=>callbacks.delete(name),parent:{postMessage:(text:string,origin:string)=>sent.push({text,origin})}});
 const poisoned=new Proxy({},{get(){throw new Error('Diagnostic read private error content')}});
 (callbacks.get('error') as (event:unknown)=>void)(poisoned);(callbacks.get('unhandledrejection') as (event:unknown)=>void)(poisoned);callbacks.get('error')!();callbacks.get('error')!();assert.equal(sent.length,3);
 for(const item of sent){assert.equal(item.origin,'https://example.com');assert.deepEqual(Object.keys(JSON.parse(item.text)).sort(),['category','operation','session','version']);}
 callbacks.get('pagehide')!();assert.equal(callbacks.has('error'),false);assert.equal(callbacks.has('unhandledrejection'),false);
});
test('repair prompt is fixed and SDK config rejects executable or non-origin inputs',()=>{
 assert.match(PREVIEW_REPAIR_PROMPT,/repair broken controls/);assert.doesNotMatch(PREVIEW_REPAIR_PROMPT,/private|stack|exception text/);
 for(const origin of ['null','file:///tmp/x','https://example.com/path','javascript:alert(1)'])assert.throws(()=>demoPreviewDiagnosticsSdk(randomUUID(),origin));
 assert.throws(()=>demoPreviewDiagnosticsSdk('</script>','https://example.com'));
});
