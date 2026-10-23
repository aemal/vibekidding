import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppAiHandlers } from '../src/lib/demo-server/app-ai-handler';
import { createDemoHandlers } from '../src/lib/demo-server/handler';
import { DemoUsage } from '../src/lib/demo-server/access';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { sharedDemoUsage } from '../src/lib/demo-server/usage';
const env={NODE_ENV:'development',VIBEKIDDING_DEMO_ENABLED:'1',VIBEKIDDING_DEMO_APP_AI_ENABLED:'1',OPENAI_API_KEY:'synthetic-private-key'};
function req(body?:unknown,signal?:AbortSignal,origin='http://localhost:3000'){return new Request('http://localhost:3000/api/demo/app-ai',{method:body===undefined?'GET':'POST',headers:{host:'localhost:3000',origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal})}
const success=(text='A friendly idea.')=>Response.json({choices:[{finish_reason:'stop',message:{content:text}}]});
function setup(extra:Parameters<typeof createAppAiHandlers>[0]={}){return createAppAiHandlers({environment:()=>env,usage:new DemoUsage(),...extra})}
test('public, production, missing opt-in and cross-origin deny before provider or reservation',async()=>{
 for(const environment of [{...env,NODE_ENV:'production'},{...env,VIBEKIDDING_PUBLIC_TEMPLATE_DEMO:'1'},{...env,VIBEKIDDING_DEMO_APP_AI_ENABLED:'0'},{...env,VIBEKIDDING_DEMO_ENABLED:'0'},{...env,VIBEKIDDING_DEMO_PROVIDER:'template'},{...env,VIBEKIDDING_DEMO_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'synthetic-anthropic'}]){
  const usage=new DemoUsage();let calls=0;const h=setup({environment:()=>environment,usage,fetcher:async()=>{calls++;return success()}});
  assert.equal((await h.POST(req({prompt:'idea'}))).status,403);const readiness=await h.GET(req());assert.equal(readiness.status,200);const state=await readiness.json();assert.equal(state.enabled,false);assert.equal(state.configured,false);assert.equal(calls,0);assert.equal(usage.remainingProviderCalls(),20);
 }
 assert.equal((await setup().POST(req({prompt:'idea'},undefined,'https://evil.test'))).status,403);
});
test('readiness never probes provider and never exposes keys',async()=>{
 let calls=0;const h=setup({fetcher:async()=>{calls++;return success()}});const r=await h.GET(req()),data=await r.json();assert.equal(data.enabled,true);assert.equal(data.configured,true);assert.equal(data.localOnly,true);assert.equal(data.limits.outputTokens,256);assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(data),/synthetic-private-key/);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await setup({environment:()=>({...env,OPENAI_API_KEY:''})}).POST(req({prompt:'x'}))).status,403);
});
test('strict prompt only shape and input bounds fail without provider calls',async()=>{
 let calls=0;const h=setup({fetcher:async()=>{calls++;return success()}});
 for(const body of [{prompt:''},{prompt:' '},{prompt:'x'.repeat(1001)},{prompt:'x',model:'other'},{prompt:'x',html:'data'},[],null])assert.equal((await h.POST(req(body))).status,400);
 assert.equal(calls,0);
});
test('fixed model and bounded plain text request/response, no raw provider errors',async()=>{
 let seen:Record<string,unknown>={};const h=setup({fetcher:async(url,init)=>{seen={url,body:JSON.parse(String(init?.body))};return success('🌻 Try a garden sketch.')}});
 const response=await h.POST(req({prompt:'idea'}));assert.deepEqual(await response.json(),{text:'🌻 Try a garden sketch.'});assert.equal(seen.url,'https://api.openai.com/v1/chat/completions');assert.equal((seen.body as {model:string}).model,'gpt-4.1-mini');assert.equal((seen.body as {max_tokens:number}).max_tokens,256);
 for(const text of ['<script>bad</script>','a'.repeat(4097),'']){const r=await setup({fetcher:async()=>success(text)}).POST(req({prompt:'x'}));assert.equal(r.status,503)}
 const failure=await setup({fetcher:async()=>new Response('private upstream key',{status:401})}).POST(req({prompt:'x'}));assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private upstream/);
});
test('generation and app AI share exact concurrency and 20-call pool without refunds',async()=>{
 assert.equal(sharedDemoUsage(),sharedDemoUsage());const usage=new DemoUsage();let release!:(value:Response)=>void,entered!:()=>void;const started=new Promise<void>(r=>entered=r);
 const generation=createDemoHandlers({environment:()=>env,usage,fetcher:async()=>{entered();return new Promise<Response>(r=>release=r)}}),app=setup({usage,fetcher:async()=>success()});
 const pending=generation.POST(req({prompt:'generate'}));await started;assert.equal((await app.POST(req({prompt:'ask'}))).status,429);
 release(success('<!DOCTYPE html><html><body>fixture</body></html>'));assert.equal((await pending).status,200);assert.equal(usage.remainingProviderCalls(),19);
 assert.equal((await app.POST(req({prompt:'ask'}))).status,200);assert.equal(usage.remainingProviderCalls(),18);
 while(usage.reserveProviderCall()){}assert.equal((await app.POST(req({prompt:'ask'}))).status,429);
});
test('abort stops ignored transport, retains budget, disposes late body and permits next call',async()=>{
 const usage=new DemoUsage();let enter!:()=>void,finish!:(r:Response)=>void,dispose!:()=>void;const entered=new Promise<void>(r=>enter=r),disposed=new Promise<void>(r=>dispose=r);let calls=0;
 const h=setup({usage,fetcher:async()=>{if(++calls>1)return success();enter();return new Promise<Response>(r=>finish=r)}});
 const c=new AbortController(),pending=h.POST(req({prompt:'x'},c.signal));await entered;c.abort();assert.equal((await pending).status,408);assert.equal(usage.remainingProviderCalls(),19);
 finish(new Response(new ReadableStream({cancel(){dispose()}})));await disposed;
 assert.equal((await h.POST(req({prompt:'again'}))).status,200);
});
test('abort during response body cancels stream and does not return late text',async()=>{
 let started!:()=>void,dispose!:()=>void;const reading=new Promise<void>(r=>started=r),disposed=new Promise<void>(r=>dispose=r);
 const h=setup({fetcher:async()=>new Response(new ReadableStream({pull(){started();return new Promise(()=>{})},cancel(){dispose()}},{highWaterMark:0}))});
 const c=new AbortController(),pending=h.POST(req({prompt:'x'},c.signal));await reading;c.abort();assert.equal((await pending).status,408);await disposed;
});

test('truncated and oversized provider payloads fail safely while generation teaches optional SDK',async()=>{
 const truncated=setup({fetcher:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]})});assert.equal((await truncated.POST(req({prompt:'x'}))).status,503);
 const oversized=setup({fetcher:async()=>new Response('x'.repeat(32769))});assert.equal((await oversized.POST(req({prompt:'x'}))).status,413);
 let system='';const generation=createDemoHandlers({environment:()=>env,usage:new DemoUsage(),fetcher:async(_url,init)=>{system=JSON.parse(String(init?.body)).messages[0].content;return success('<!DOCTYPE html><html><body>fixture</body></html>')}});
 await generation.POST(req({prompt:'make an AI idea app'}));
 for(const expected of ['window.vibeAI.ask(text)','Promise<string>','explicitly clicks','1000 characters','never invent an AI reply','textContent, never HTML','Never call fetch'])assert.ok(system.includes(expected));
});

test('proxy allows only exact app AI route and retains archived API blocking',()=>{
 assert.equal(proxy(new NextRequest('http://localhost:3000/api/demo/app-ai')).headers.get('x-middleware-next'),'1');
 for(const path of ['/api/demo/app-ai/other','/api/demo/app-aix','/api/generate','/api/preview'])assert.equal(proxy(new NextRequest('http://localhost:3000'+path)).status,410);
});
