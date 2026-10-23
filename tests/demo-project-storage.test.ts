import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Script } from 'node:vm';
import { createDemoProjectStore, deleteProjectData, DemoStorageSession, demoStorageSdk } from '../src/lib/demo-project-storage';
import { notesStarter } from '../src/lib/demo-notes-starter';
import { generateWithProvider } from '../src/lib/demo-server/provider';
function memory(){const map=new Map<string,string>();return{map,getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)}}}

test('legacy IDs and independent namespaces persist only their own keys and delete narrowly',()=>{
 const storage=memory(),first=createDemoProjectStore(storage,'legacy/project'),second=createDemoProjectStore(storage,'legacy%2Fproject');
 first.write('note','private fixture');assert.equal(first.read('note'),'private fixture');assert.equal(second.read('note'),null);
 second.write('note','other');assert.equal(storage.map.size,2);deleteProjectData(storage,'legacy/project');assert.equal(first.read('note'),null);assert.equal(second.read('note'),'other');
});
test('UTF8 value, key count and serialized total limits reject without altering stored state',()=>{
 const storage=memory(),store=createDemoProjectStore(storage,'test');
 for(let i=0;i<16;i++)store.write('key'+i,'a'.repeat(4000));const before=[...storage.map.values()][0];
 assert.throws(()=>store.write('extra','x'),/limit_reached/);assert.throws(()=>store.write('key0','🌻'.repeat(1025)),/invalid_request/);assert.equal([...storage.map.values()][0],before);
 for(const key of ['__proto__','constructor','prototype','A','x'.repeat(65),'../other'])assert.throws(()=>store.read(key));
 const large=createDemoProjectStore(storage,'large');for(let i=0;i<15;i++)large.write('key'+i,'a'.repeat(4096));assert.throws(()=>large.write('key15','a'.repeat(4096)),/limit_reached/);
});
test('corrupt or unavailable storage does not claim save or overwrite corrupt data',()=>{
 const storage=memory(),store=createDemoProjectStore(storage,'test');store.write('note','x');const key=[...storage.map.keys()][0];storage.map.set(key,'bad json');assert.throws(()=>store.read('note'),/unavailable/);assert.throws(()=>store.write('note','new'),/unavailable/);assert.equal(storage.map.get(key),'bad json');
 const denied=createDemoProjectStore({getItem:()=>null,setItem:()=>{throw new Error('private quota details')}},'denied');assert.throws(()=>denied.write('note','x'),/outcome_unknown/);
 assert.throws(()=>deleteProjectData({removeItem:()=>{throw new Error('private')}},'denied'),/Data removal could not be confirmed/);
});
test('protocol binds source, opaque origin, session and schema; replay/authority spoofing rejected',()=>{
 const source={},session=randomUUID(),storage=memory(),store=createDemoProjectStore(storage,'parent-owned');const host=new DemoStorageSession({source,session,store});
 const base={version:1,session,requestId:randomUUID(),operation:'record.write',key:'note',value:'secret'};
 const event=(data:unknown)=>({source,origin:'null',data:JSON.stringify(data)});
 assert.equal(host.handle({...event(base),source:{}}),undefined);assert.equal(host.handle({...event(base),origin:'https://evil.test'}),undefined);assert.equal(host.handle(event({...base,session:randomUUID()})),undefined);
 assert.equal(host.handle(event({...base,projectId:'other'})),undefined);assert.equal(host.handle(event({...base,operation:'ai.generate'})),undefined);
 assert.equal(JSON.parse(host.handle(event(base))!).value,'secret');assert.equal(host.handle(event(base)),undefined);
 const read={version:1,session,requestId:randomUUID(),operation:'record.read',key:'note'};assert.equal(JSON.parse(host.handle(event(read))!).value,'secret');
 host.close();assert.equal(host.handle(event({...read,requestId:randomUUID()})),undefined);
});
test('rolling request limit recovers and notes still save after six minutes with bounded replay history',()=>{
 let now=0;const source={},session=randomUUID(),store=createDemoProjectStore(memory(),'test'),host=new DemoStorageSession({source,session,store,now:()=>now});
 const call=(operation='record.read',value?:string,id=randomUUID())=>host.handle({source,origin:'null',data:JSON.stringify({version:1,session,requestId:id,operation,key:'note',...(value===undefined?{}:{value})})});
 const first=randomUUID();assert.ok(call('record.read',undefined,first));assert.equal(call('record.read',undefined,first),undefined);
 for(let i=1;i<100;i++)assert.ok(call());assert.equal(JSON.parse(call()!).error,'busy');
 now=60000;assert.equal(JSON.parse(call('record.write','after one minute')!).value,'after one minute');
 for(let minute=1;minute<5;minute++){now=minute*60000;for(let i=minute===1?1:0;i<100;i++)call()}
 // Bounded cache has at most five rolling minutes; the sixth minute prunes old IDs.
 assert.ok((host as unknown as {seen:Map<string,number>}).seen.size<=500);
 now=360000;assert.equal(JSON.parse(call('record.write','six minute note')!).value,'six minute note');assert.equal(JSON.parse(call()!).value,'six minute note');
 assert.ok((host as unknown as {seen:Map<string,number>}).seen.size<=500);
 const backwards=new DemoStorageSession({source,session,store,now:()=>now});now--;assert.equal(backwards.handle({source,origin:'null',data:'{}'}),undefined);
});
test('safe error replies never disclose host details and large wire messages are ignored',()=>{
 const source={},session=randomUUID(),host=new DemoStorageSession({source,session,store:{read:()=>{throw new Error('private host error')},write:()=>{throw new Error('private host error')}}});
 const read={version:1,session,requestId:randomUUID(),operation:'record.read',key:'note'};
 assert.equal(JSON.parse(host.handle({source,origin:'null',data:JSON.stringify(read)})!).error,'unavailable');
 assert.equal(host.handle({source,origin:'null',data:' '.repeat(16385)}),undefined);
});
test('SDK and starter compile; notes remain source-only with no external assets',()=>{
 new Script(demoStorageSdk(randomUUID(),'https://example.com').slice(8,-9));
 new Script(notesStarter.html.match(/<script>([\s\S]*)<\/script>/)![1]);
 assert.doesNotMatch(notesStarter.html,/fetch\(|localStorage|https?:\/\//);
 assert.match(notesStarter.html,/Standalone preview/);assert.match(notesStarter.html,/Save could not be confirmed/);
 assert.throws(()=>demoStorageSdk(randomUUID(),'https://example.com/path'));
});
test('provider instruction describes optional bounded SDK without enabling app-time AI',async()=>{
 let instruction='';await generateWithProvider('openai',{OPENAI_API_KEY:'synthetic'}, {prompt:'make notes'},async(_url,init)=>{instruction=JSON.parse(String(init!.body)).messages[0].content;return Response.json({choices:[{finish_reason:'stop',message:{content:'<!DOCTYPE html><html><body>fixture</body></html>'}}]})});
 for(const expected of ['window.vibeStorage.read','window.vibeStorage.write','4096 UTF-8 bytes','in-memory state','Never embed saved user data','Await successful writes'])assert.ok(instruction.includes(expected));
 assert.match(instruction,/Use no network requests/);
 assert.match(instruction,/sandbox blocks form submissions/);
 assert.match(instruction,/Never generate form elements, submit controls, or submit event handlers/);
 assert.match(instruction,/type="button" and click handlers/);
 assert.match(instruction,/native buttons must remain keyboard accessible/);
});
