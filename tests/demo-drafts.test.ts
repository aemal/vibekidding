import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDrafts,writeDraft,selectDraft,draftText,parseDrafts,encodeDrafts} from '../src/lib/demo-drafts';

test('new idea and each project retain separate drafts across switches and reload',()=>{
 const ids=['one','two'];let cache=writeDraft(emptyDrafts(),'new idea',ids);
 cache=writeDraft(selectDraft(cache,'one',ids),'first revision',ids);
 cache=writeDraft(selectDraft(cache,'two',ids),'second revision',ids);
 cache=selectDraft(cache,'one',ids);assert.equal(draftText(cache),'first revision');
 cache=parseDrafts(encodeDrafts(cache),ids);assert.equal(cache.activeProjectId,'one');assert.equal(draftText(cache),'first revision');
 assert.equal(draftText(selectDraft(cache,null,ids)),'new idea');
 assert.equal(draftText(selectDraft(cache,'two',ids)),'second revision');
});
test('clearing submitted draft leaves other unsent drafts intact',()=>{
 const ids=['one'];let cache=writeDraft(emptyDrafts(),'new unsent',ids);
 cache=writeDraft(selectDraft(cache,'one',ids),'submitted',ids);
 cache=writeDraft(cache,'',ids);assert.equal(draftText(cache),'');assert.equal(draftText(selectDraft(cache,null,ids)),'new unsent');
});
test('same-project selection retains text; removed projects are pruned',()=>{
 let cache=writeDraft(selectDraft(emptyDrafts(),'one',['one']),'unsent',['one']);
 assert.equal(draftText(selectDraft(cache,'one',['one'])),'unsent');
 cache=parseDrafts(encodeDrafts(cache),[]);assert.deepEqual(cache,emptyDrafts());
});
test('cache rejects malformed or oversized untrusted data and unsafe shape',()=>{
 for(const raw of ['bad','{}',JSON.stringify({...emptyDrafts(),extra:true}),JSON.stringify({...emptyDrafts(),drafts:[{projectId:null,text:'x'.repeat(2001)}]}),JSON.stringify({...emptyDrafts(),drafts:[{projectId:null,text:'a'},{projectId:null,text:'b'}]}),JSON.stringify({...emptyDrafts(),drafts:[{projectId:null,text:123}]})]) assert.throws(()=>parseDrafts(raw,[]));
 assert.throws(()=>parseDrafts(' '.repeat(220001),[]));
 assert.throws(()=>writeDraft(emptyDrafts(),'x'.repeat(2001),[]));
});
test('24 projects plus new idea fit bounded Unicode cache with collision-free IDs',()=>{
 const ids=Array.from({length:24},(_,i)=>i===0?'__proto__':String(i));let cache=writeDraft(emptyDrafts(),'🙂'.repeat(1000),ids);
 for(const id of ids)cache=writeDraft(selectDraft(cache,id,ids),'🙂'.repeat(1000),ids);
 const decoded=parseDrafts(encodeDrafts(cache),ids);assert.equal(decoded.drafts.length,25);
 assert.equal(draftText(selectDraft(decoded,'__proto__',ids)),'🙂'.repeat(1000));
 assert.throws(()=>selectDraft(cache,'extra',[...ids,'extra']));
});
