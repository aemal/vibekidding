import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotProjectData, encodeDataBackup, parseDataBackup, restoreProjectData, DemoDataBackupError, MAX_DATA_BACKUP_BYTES } from '../src/lib/demo-data-backup';
import { createDemoProjectStore } from '../src/lib/demo-project-storage';
function memory(){const map=new Map<string,string>();let writes=0;return{map,get writes(){return writes},getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{writes++;map.set(key,value)}}}
const code=(wanted:string)=>(error:unknown)=>error instanceof DemoDataBackupError&&error.code===wanted;
const envelope=(records:unknown)=>JSON.stringify({format:'vibekidding-app-data',version:1,records});

test('data-only Unicode backup restores to selected destination and preserves original and shelf',()=>{
 const storage=memory();storage.map.set('vibekidding-demo-projects-v1','source and history');
 const original=createDemoProjectStore(storage,'original');original.write('note','My 🌻 idea');original.write('score','7');
 const snapshot=snapshotProjectData(storage,'original'),file=encodeDataBackup(snapshot.records),parsed=parseDataBackup(file);
 assert.deepEqual(Object.keys(JSON.parse(file)).sort(),['format','records','version']);assert.equal(parsed.keyCount,2);assert.equal(parsed.byteSize,Buffer.byteLength(JSON.stringify({version:1,records:parsed.records})));
 assert.equal(Object.isFrozen(parsed.records),true);
 restoreProjectData(storage,'destination',parsed,null);assert.equal(createDemoProjectStore(storage,'destination').read('note'),'My 🌻 idea');assert.equal(original.read('note'),'My 🌻 idea');assert.equal(storage.map.get('vibekidding-demo-projects-v1'),'source and history');
});
test('restore replaces rather than merges and empty backup is an explicit clear',()=>{
 const storage=memory(),store=createDemoProjectStore(storage,'project');store.write('old','old');const snapshot=snapshotProjectData(storage,'project');
 restoreProjectData(storage,'project',parseDataBackup(envelope({note:'new'})),snapshot.baseline);assert.equal(store.read('old'),null);assert.equal(store.read('note'),'new');
 restoreProjectData(storage,'project',parseDataBackup(envelope({})),snapshotProjectData(storage,'project').baseline);assert.equal(store.read('note'),null);
});
test('malformed versions, unexpected envelope fields and invalid record shapes reject',()=>{
 for(const input of ['bad','null','[]',JSON.stringify({format:'vibekidding-app-data',version:2,records:{}}),JSON.stringify({format:'vibekidding-app-data',version:1,records:{},projectId:'other'}),envelope([]),envelope({note:12}),envelope({constructor:'x'}),envelope({'bad/key':'x'}),'{"format":"vibekidding-app-data","version":1,"records":{"__proto__":"x"}}'])assert.throws(()=>parseDataBackup(input),code('invalid'));
});
test('UTF8, key count and aggregate bounds reject before writes; exact value boundary works',()=>{
 assert.equal(parseDataBackup(envelope({note:'🌻'.repeat(1024)})).keyCount,1);
 assert.throws(()=>parseDataBackup(envelope({note:'🌻'.repeat(1025)})),code('too-large'));
 assert.throws(()=>parseDataBackup(envelope(Object.fromEntries(Array.from({length:17},(_,i)=>['key'+i,'x'])))),code('too-large'));
 assert.throws(()=>parseDataBackup(envelope(Object.fromEntries(Array.from({length:16},(_,i)=>['key'+i,'x'.repeat(4096)])))),code('too-large'));
 assert.throws(()=>parseDataBackup(' '.repeat(MAX_DATA_BACKUP_BYTES+1)),code('too-large'));
});
test('stale baseline refuses overwrite and corruption does not get silently repaired',()=>{
 const storage=memory(),store=createDemoProjectStore(storage,'project');store.write('note','first');const snapshot=snapshotProjectData(storage,'project');store.write('note','newer');const before=storage.writes;
 assert.throws(()=>restoreProjectData(storage,'project',parseDataBackup(envelope({note:'import'})),snapshot.baseline),code('conflict'));assert.equal(storage.writes,before);assert.equal(store.read('note'),'newer');
 const key=[...storage.map.keys()][0];storage.map.set(key,'corrupt');assert.throws(()=>snapshotProjectData(storage,'project'),code('unavailable'));assert.throws(()=>restoreProjectData(storage,'project',parseDataBackup(envelope({})),null),code('unavailable'));assert.equal(storage.map.get(key),'corrupt');
});
test('quota failures and post-write mismatches report unknown outcome, never success',()=>{
 const parsed=parseDataBackup(envelope({note:'restore'}));let writes=0;
 assert.throws(()=>restoreProjectData({getItem:()=>null,setItem:()=>{writes++;throw new Error('private quota text')}},'project',parsed,null),code('outcome-unknown'));assert.equal(writes,1);
 assert.throws(()=>restoreProjectData({getItem:()=>null,setItem:()=>{writes++}},'project',parsed,null),code('outcome-unknown'));
 assert.throws(()=>snapshotProjectData({getItem:()=>{throw new Error('private denial')}},'project'),code('unavailable'));
});
test('restore revalidates preview records and metrics before accessing destination storage',()=>{
 let reads=0,writes=0;const storage={getItem:()=>{reads++;return null},setItem:()=>{writes++}};const parsed=parseDataBackup(envelope({note:'x'}));
 assert.throws(()=>restoreProjectData(storage,'project',{...parsed,keyCount:99},null),code('invalid'));
 assert.throws(()=>restoreProjectData(storage,'project',{...parsed,records:{note:'x'.repeat(4097)}},null),code('too-large'));assert.equal(reads,0);assert.equal(writes,0);
});
