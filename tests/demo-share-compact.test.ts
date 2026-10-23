import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { templateProject } from '../src/lib/demo-server/template';
import { renderCompactTemplateV1 } from '../src/lib/demo-server/template-v1';
import { createShareUrl, decodeShareFragment, encodeShareFragment, DemoShareError } from '../src/lib/demo-share';

test('all 1512 allowed template settings preserve exact HTML and title through compact links',async()=>{
 let count=0;const digest=createHash('sha256');
 for(const kind of ['collector','memory','drawing','math','story','tictactoe','music','checklist'])
 for(const theme of ['space','ocean','garden'])
 for(const color of ['purple','pink','blue','green','red','orange','yellow'])
 for(const seconds of [15,30,60])
 for(const goal of [5,10,20]){
  const token=[kind,theme,color,seconds,goal].join('.');
  const generated=renderCompactTemplateV1(token)!;
  assert.ok(generated);
  const build={title:generated.title,html:generated.html};
  const url=await createShareUrl('https://vibekidding.example',build);
  assert.equal(new URL(url).hash,'#t1=1.'+token);
  assert.ok(url.length<110);
  assert.deepEqual(await decodeShareFragment(new URL(url).hash),build);
  assert.equal(Object.isFrozen(await decodeShareFragment(new URL(url).hash)),true);
  digest.update(JSON.stringify(build));count++;
 }
 assert.equal(count,1512);
 // Frozen output fingerprint: never update this for routine template edits.
 assert.equal(digest.digest('hex'),'0a830e6ab2346c0e6589668d17acbee7ff2e036ca3b3d4cc07e6e34a699240f5');
});

test('canonical matching refuses changed HTML, titles, markers, and older metadata',async()=>{
 const p=templateProject('garden music');
 const cases=[{...p,title:'My music'}, {...p,html:p.html+' '}, {...p,html:p.html.replace('Make a little melody!','Changed!')}, {...p,html:p.html.replace('"kind":"music"','"kind":"story"')}, {...p,html:p.html.replace(',"kind":"music"','')}, {title:'Custom',html:'<p>Music</p>'}];
 for(const value of cases){
  const url=await createShareUrl('https://example.com',value);
  assert.match(new URL(url).hash,/^#v1=/);
  assert.deepEqual(await decodeShareFragment(new URL(url).hash),{title:value.title,html:value.html});
 }
});

test('explicit v1 encoding remains v1 for all eight templates',async()=>{
 for(const kind of ['collector','memory','drawing','math','story','tictactoe','music','checklist']){
  const p=renderCompactTemplateV1(`${kind}.garden.purple.30.10`)!;
  const fragment=await encodeShareFragment(p);
  assert.match(fragment,/^#v1=/);
  assert.deepEqual(await decodeShareFragment(fragment),{title:p.title,html:p.html});
 }
});

test('compact parsing rejects unknown versions and noncanonical or unbounded settings',async()=>{
 for(const value of ['#t2=1.music.garden.purple.30.10','#t1=2.music.garden.purple.30.10'])
  await assert.rejects(decodeShareFragment(value),(error:unknown)=>error instanceof DemoShareError&&error.code==='unsupported-version');
 for(const token of ['music.garden.purple.030.10','music.garden.purple.30.10.extra','music.garden.__proto__.30.10','music.garden.purple.0.10','music.garden.purple.30.100','music.garden.purple.30.10%00','MUSIC.garden.purple.30.10','music.garden.purple.30.10\n','<script>.garden.purple.30.10','music.missing.purple.30.10','music.garden.constructor.30.10'])
  await assert.rejects(decodeShareFragment('#t1=1.'+token),DemoShareError);
 await assert.rejects(decodeShareFragment('#t1=1.'+'a'.repeat(200)),(error:unknown)=>error instanceof DemoShareError&&error.code==='too-large');
});

test('compact links work without compression browser APIs',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'CompressionStream');
 const decompressor=Object.getOwnPropertyDescriptor(globalThis,'DecompressionStream');
 try{
  Object.defineProperty(globalThis,'CompressionStream',{value:undefined,configurable:true});
  Object.defineProperty(globalThis,'DecompressionStream',{value:undefined,configurable:true});
  const p=templateProject('garden checklist');const url=await createShareUrl('https://example.com',p);
  assert.deepEqual(await decodeShareFragment(new URL(url).hash),{title:p.title,html:p.html});
 }finally{
  if(descriptor)Object.defineProperty(globalThis,'CompressionStream',descriptor);
  if(decompressor)Object.defineProperty(globalThis,'DecompressionStream',decompressor);
 }
});
