import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoHandlers } from '../src/lib/demo-server/handler';
import { DEMO_LIMITS, DemoUsage } from '../src/lib/demo-server/access';
const env={NODE_ENV:'development',VIBEKIDDING_DEMO_ENABLED:'1',OPENAI_API_KEY:'synthetic-fixture'};
const prefix='<!DOCTYPE html><html><body>',suffix='</body></html>';
const result='<!DOCTYPE html><html><body>Revised</body></html>';
function request(raw:string){return new Request('http://localhost:3000/api/demo/generate',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'},body:raw})}
function fullHtml(character:string,extra=0){const available=DEMO_LIMITS.htmlBytes-Buffer.byteLength(prefix+suffix)+extra,count=Math.floor(available/Buffer.byteLength(character));return prefix+character.repeat(count)+'x'.repeat(available-count*Buffer.byteLength(character))+suffix}
function escaped(value:string){return '"'+value.split('').map(char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).join('')+'"'}

for(const [name,character] of [['quotes','"'],['backslashes','\\'],['controls','\u0001'],['Unicode','🌻']]){
 test(`exact decoded HTML/prompt limits survive ${name} JSON encoding`,async()=>{
  const html=fullHtml(character),prompt='p'.repeat(DEMO_LIMITS.promptCharacters);let calls=0;
  const h=createDemoHandlers({environment:()=>env,fetcher:async(_url,init)=>{calls++;const message=JSON.parse(JSON.parse(String(init!.body)).messages[1].content);assert.equal(message.existingProjectHtml,html);assert.equal(message.request,prompt);return Response.json({choices:[{finish_reason:'stop',message:{content:result}}]})}});
  assert.equal(Buffer.byteLength(html),DEMO_LIMITS.htmlBytes);
  const raw=JSON.stringify({prompt,html});assert.ok(Buffer.byteLength(raw)<=DEMO_LIMITS.bodyBytes);
  const response=await h.POST(request(raw));assert.equal(response.status,200);assert.equal((await response.json()).mode,'ai');assert.equal(calls,1);
 });
}
test('fully unicode-escaped keys and field values fit finite ingress bound at decoded limits',async()=>{
 const html=fullHtml('x'),prompt='p'.repeat(2000),raw='{'+escaped('prompt')+':'+escaped(prompt)+','+escaped('html')+':'+escaped(html)+'}';let calls=0;
 const h=createDemoHandlers({environment:()=>({...env,VIBEKIDDING_DEMO_PROVIDER:'template'}),fetcher:async()=>{calls++;throw new Error('Forbidden')}});
 assert.ok(Buffer.byteLength(raw)>480000);assert.ok(Buffer.byteLength(raw)<=DEMO_LIMITS.bodyBytes);
 const response=await h.POST(request(raw));assert.equal(response.status,200);assert.equal((await response.json()).html,html);assert.equal(calls,0);
});
test('oversized decoded HTML and prompt reject before reservation despite expanded envelope',async()=>{
 for(const body of [{prompt:'x',html:fullHtml('"',1)},{prompt:'x',html:fullHtml('🌻',1)},{prompt:'x'.repeat(2001),html:fullHtml('x')}]){
  const usage=new DemoUsage();let calls=0;const h=createDemoHandlers({environment:()=>env,usage,fetcher:async()=>{calls++;throw new Error('Forbidden')}});
  assert.equal((await h.POST(request(JSON.stringify(body)))).status,400);assert.equal(calls,0);assert.equal(usage.remainingProviderCalls(),20);
 }
});
test('raw body exact cap accepted and one byte over rejected before provider',async()=>{
 const base=JSON.stringify({prompt:'x',html:'<p>Custom</p>'});let calls=0;const h=createDemoHandlers({environment:()=>({...env,VIBEKIDDING_DEMO_PROVIDER:'template'}),fetcher:async()=>{calls++;throw new Error('Forbidden')}});
 const raw=base+' '.repeat(DEMO_LIMITS.bodyBytes-Buffer.byteLength(base));assert.equal((await h.POST(request(raw))).status,200);assert.equal((await h.POST(request(raw+' '))).status,413);assert.equal(calls,0);
 assert.equal(DEMO_LIMITS.htmlBytes,80000);assert.equal(DEMO_LIMITS.promptCharacters,2000);assert.equal(DEMO_LIMITS.outputTokens,6000);
});
