import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createDemoHandlers } from '../src/lib/demo-server/handler';
import { generateWithProvider } from '../src/lib/demo-server/provider';
import { DemoUsage, DEMO_LIMITS } from '../src/lib/demo-server/access';

const env={NODE_ENV:'development',VIBEKIDDING_DEMO_ENABLED:'1',OPENAI_API_KEY:'synthetic-test-key'};
const html='<!DOCTYPE html><html><body>Fixture</body></html>';
const payload=()=>({choices:[{finish_reason:'stop',message:{content:html}}]});
const success=()=>Response.json(payload());
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve}}
function request(signal?:AbortSignal){return new Request('http://localhost:3000/api/demo/generate',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({prompt:'make a game'}),signal})}
async function cancelled(response:Response){assert.equal(response.status,408);assert.deepEqual(await response.json(),{error:'The build was cancelled.'})}

test('pre-aborted requests do not dispatch or reserve a provider call',async()=>{
 const usage=new DemoUsage();let calls=0;const h=createDemoHandlers({environment:()=>env,usage,fetcher:async()=>{calls++;return success()}});
 const c=new AbortController();c.abort();await cancelled(await h.POST(request(c.signal)));
 assert.equal(calls,0);assert.equal(usage.remainingProviderCalls(),DEMO_LIMITS.providerCallsPerProcess);
 await assert.rejects(generateWithProvider('openai',env,{prompt:'x'},async()=>{calls++;return success()},c.signal));assert.equal(calls,0);
});

test('cancel reaches fetch, releases concurrency, retains reservation and keeps provider available',async()=>{
 const entered=deferred<AbortSignal>();const usage=new DemoUsage();let calls=0;
 const h=createDemoHandlers({environment:()=>env,usage,fetcher:async(_url,init)=>{
  if(++calls>1)return success();const signal=init!.signal!;entered.resolve(signal);
  return new Promise<Response>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 }});
 const c=new AbortController(),pending=h.POST(request(c.signal));const upstream=await entered.promise;c.abort();await cancelled(await pending);assert.equal(upstream.aborted,true);
 assert.equal(usage.remainingProviderCalls(),DEMO_LIMITS.providerCallsPerProcess-1);
 assert.equal((await (await h.POST(request())).json()).mode,'ai');assert.equal(calls,2);
});

test('transport ignoring abort cannot produce late success and its late body is cancelled',async()=>{
 const entered=deferred<void>(),late=deferred<Response>(),disposed=deferred<void>();let calls=0;
 const h=createDemoHandlers({environment:()=>env,fetcher:async()=>{calls++;entered.resolve();return late.promise}});
 const c=new AbortController(),pending=h.POST(request(c.signal));await entered.promise;c.abort();await cancelled(await pending);
 late.resolve(new Response(new ReadableStream({cancel(){disposed.resolve()}})));await disposed.promise;assert.equal(calls,1);
});

test('cancellation during stalled response body stops reading without outage fallback',async()=>{
 const reading=deferred<void>(),disposed=deferred<void>();let calls=0;
 const h=createDemoHandlers({environment:()=>env,fetcher:async()=>++calls===1?new Response(new ReadableStream({pull(){reading.resolve();return new Promise(()=>{})},cancel(){disposed.resolve()}},{highWaterMark:0})):success()});
 const c=new AbortController(),pending=h.POST(request(c.signal));await reading.promise;c.abort();await cancelled(await pending);await disposed.promise;
 assert.equal((await (await h.POST(request())).json()).mode,'ai');
});

test('genuine provider failure still latches fallback and does not retry',async()=>{
 let calls=0;const h=createDemoHandlers({environment:()=>env,fetcher:async()=>{calls++;return new Response('',{status:503})}});
 assert.equal((await (await h.POST(request())).json()).mode,'template');
 assert.equal((await (await h.POST(request())).json()).mode,'template');assert.equal(calls,1);
});

test('local HTTP transport observes upstream socket close on request cancellation', {timeout:5000}, async()=>{
 const arrived=deferred<void>(),closed=deferred<void>();let calls=0;
 const server=createServer((_req,res)=>{
  calls++;res.on('close',()=>closed.resolve());
  if(calls===1){arrived.resolve();return}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(payload()));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const h=createDemoHandlers({environment:()=>env,fetcher:(_url,init)=>fetch(`http://127.0.0.1:${address.port}/synthetic-provider`,init)});
  const c=new AbortController(),pending=h.POST(request(c.signal));await arrived.promise;c.abort();await cancelled(await pending);await closed.promise;
  assert.equal((await (await h.POST(request())).json()).mode,'ai');assert.equal(calls,2);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
