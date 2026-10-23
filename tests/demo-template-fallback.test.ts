import assert from 'node:assert/strict';
import test from 'node:test';
import { templateProject } from '../src/lib/demo-server/template';
import { createDemoHandlers } from '../src/lib/demo-server/handler';
import { encodeShareFragment, decodeShareFragment, createShareUrl } from '../src/lib/demo-share';
const prompt='Make it blue';
const original=templateProject('garden collector').html;
const modified=original.replace('</body>','<button id="custom-feature">My feature</button></body>');
function request(html:string){return new Request('http://localhost:3000/api/demo/generate',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({prompt,html})})}

test('all eight exact canonical presets remain revisable',()=>{
 for(const kind of ['collector','memory','drawing','math','story','tictactoe','music','checklist']){
  const build=templateProject('garden '+kind),revised=templateProject(prompt,build.html);
  assert.notEqual(revised.html,build.html);assert.match(revised.html,/"color":"#2563eb"/);assert.match(revised.html,new RegExp(`"kind":"${kind}"`));
 }
});
test('retained valid metadata never discards customized source',()=>{
 for(const html of [modified,original+' ',original.replace('<title>Garden Adventure</title>','<title>My renamed app</title>'),original.replace('Ready to play?','My message'),original.replace('"theme":"garden"','"theme":"ocean"')]){
  const result=templateProject(prompt,html);assert.equal(result.html,html);assert.match(result.message,/unchanged/);assert.match(result.message,/cannot revise custom HTML/);
 }
});
test('only exact historical collector missing-kind form remains editable',()=>{
 const legacy=original.replace(',"kind":"collector"','');assert.notEqual(templateProject(prompt,legacy).html,legacy);
 const custom=legacy.replace('</body>','<p>Added by me</p></body>');assert.equal(templateProject(prompt,custom).html,custom);
});
test('provider failure and configured template mode preserve custom-marker source without new HTML',async()=>{
 for(const failProvider of [true,false]){
  let calls=0;const h=createDemoHandlers({environment:()=>({NODE_ENV:'development',VIBEKIDDING_DEMO_ENABLED:'1',OPENAI_API_KEY:'synthetic',...(failProvider?{}:{VIBEKIDDING_DEMO_PROVIDER:'template'})}),fetcher:async()=>{calls++;return new Response('',{status:503})}});
  const response=await h.POST(request(modified));assert.equal(response.status,200);const result=await response.json();assert.equal(result.mode,'template');assert.equal(result.html,modified);assert.match(result.message,/unchanged/);assert.equal(calls,failProvider?1:0);
 }
});
test('successful provider revision still receives original custom source',async()=>{
 const h=createDemoHandlers({environment:()=>({NODE_ENV:'development',VIBEKIDDING_DEMO_ENABLED:'1',OPENAI_API_KEY:'synthetic'}),fetcher:async(_url,init)=>{
  assert.equal(JSON.parse(JSON.parse(String(init!.body)).messages[1].content).existingProjectHtml,modified);
  return Response.json({choices:[{finish_reason:'stop',message:{content:modified.replace('My feature','My blue feature')}}]});
 }});
 const result=await(await h.POST(request(modified))).json();assert.equal(result.mode,'ai');assert.match(result.html,/My blue feature/);
});
test('canonical compact and modified full-snapshot links remain exact',async()=>{
 const build=templateProject('garden collector');const url=await createShareUrl('https://example.com',build);assert.match(new URL(url).hash,/^#t1=/);assert.deepEqual(await decodeShareFragment(new URL(url).hash),{title:build.title,html:build.html});
 const fragment=await encodeShareFragment({title:'Mine',html:modified});assert.deepEqual(await decodeShareFragment(fragment),{title:'Mine',html:modified});
});
