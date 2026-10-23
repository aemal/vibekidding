import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedCopy, parseCopyFragment } from '../src/lib/demo-shared-copy';
import { createShareUrl, encodeShareFragment, DemoShareError } from '../src/lib/demo-share';
import { templateProject } from '../src/lib/demo-server/template';
import { parseBackup, serializeBackup, validProjects } from '../src/components/demo/project-backup';

const identity={projectId:'recipient-project',versionId:'recipient-version',createdAt:1234};
const build={title:'A shared 🌻 creation',html:'<h1>Hello</h1><script>window.example=1</script>'};

test('copy carries exactly one version and truthful provenance, never donor metadata',()=>{
 const donor=Object.freeze({...build,id:'donor-id',versions:[{prompt:'private donor prompt'}],history:['private'],provider:'private-provider'});
 const result=createSharedCopy(donor,identity);
 assert.deepEqual(result,{id:identity.projectId,title:build.title,emoji:'✦',updatedAt:1234,versions:[{id:identity.versionId,html:build.html,prompt:'Imported shared snapshot',createdAt:1234,mode:'shared'}]});
 assert.equal(validProjects([result]),true);
 assert.deepEqual(parseBackup(serializeBackup(result)),result);
 assert.doesNotMatch(JSON.stringify(result),/donor-id|private/);
});

test('independent copies do not share mutable arrays or version objects',()=>{
 const first=createSharedCopy(build,identity),second=createSharedCopy(build,{...identity,projectId:'second-project',versionId:'second-version'});
 first.versions[0].html='changed';first.title='Changed';
 assert.equal(second.versions[0].html,build.html);assert.equal(second.title,build.title);
 assert.equal(validProjects([first,second]),true);
});

test('copy handoff supports canonical compact and old full snapshots exactly',async()=>{
 for(const value of [templateProject('garden music'),build]){
  const url=await createShareUrl('https://example.com',value);
  const decoded=await parseCopyFragment('#copy='+new URL(url).hash.slice(1));
  assert.deepEqual(decoded,{title:value.title,html:value.html});
  assert.equal(createSharedCopy(decoded,identity).versions[0].html,value.html);
  const v1=await encodeShareFragment(value);
  assert.deepEqual(await parseCopyFragment('#copy='+v1.slice(1)),decoded);
 }
});

test('copy handoff rejects absent, nested, encoded, malformed and oversized links',async()=>{
 for(const value of ['', '#v1=abc','#copy=', '#copy=#t1=1.music.garden.purple.30.10','#copy=copy=t1=1.music.garden.purple.30.10','#copy=t1%3D1.music.garden.purple.30.10','#copy=t1=2.music.garden.purple.30.10','#copy='+'x'.repeat(8001)])
  await assert.rejects(parseCopyFragment(value),DemoShareError);
});

test('invalid identities and oversized or blank source fail without leaking source',()=>{
 for(const context of [{...identity,projectId:''},{...identity,versionId:identity.projectId},{...identity,createdAt:NaN},{...identity,createdAt:-1},{...identity,createdAt:Infinity},{...identity,versionId:'x'.repeat(129)}]) assert.throws(()=>createSharedCopy(build,context),DemoShareError);
 for(const value of [{...build,title:' '},{...build,title:'x'.repeat(71)},{...build,html:''},{...build,html:'🌻'.repeat(30000)}]) assert.throws(()=>createSharedCopy(value,identity),(error:unknown)=>error instanceof DemoShareError&&(!value.html || !error.message.includes(value.html)));
});

test('construction does not read time, randomness, storage, DOM, or execute HTML',()=>{
 const oldNow=Date.now;Date.now=()=>{throw new Error('Unexpected clock read')};
 try{assert.deepEqual(createSharedCopy(build,identity),createSharedCopy(build,identity));}finally{Date.now=oldNow}
 assert.equal('example' in globalThis,false);
});
