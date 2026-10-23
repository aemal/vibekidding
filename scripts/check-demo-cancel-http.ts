/** Isolated Next dev route + real loopback HTTP transport. No real providers or keys. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { build } from 'esbuild';

async function listen(server:Server){server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');return address.port}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
async function until(check:()=>Promise<boolean>,ms:number){const deadline=Date.now()+ms;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Fixture deadline exceeded')}
async function main(){
 const root=process.cwd(),dir=await mkdtemp(path.join(tmpdir(),'vibekidding-next-cancel-'));
 let child:ChildProcess|undefined,logs='',providerRequests=0,firstClosed=false;const envKeys=['PATH','HOME','TMPDIR','SystemRoot'];
 const provider=createServer((req,res)=>{providerRequests++;req.resume();if(providerRequests===1){res.on('close',()=>{firstClosed=true});return}res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'<!DOCTYPE html><html><body>Next cancellation fixture</body></html>'}}]}))});
 try{
  const providerPort=await listen(provider);const reservation=createServer();const port=await listen(reservation);await close(reservation);
  await mkdir(path.join(dir,'app','api','generate'),{recursive:true});
  await symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
  await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'isolated-cancel-fixture',private:true}));
  await writeFile(path.join(dir,'next.config.mjs'),'export default { devIndicators: false };\n');
  await writeFile(path.join(dir,'app','layout.js'),'export default function Layout({children}) { return <html><body>{children}</body></html> }');
  await writeFile(path.join(dir,'app','page.js'),'export default function Page() { return <p>Isolated cancellation fixture</p> }');
  await build({entryPoints:[path.join(root,'src/lib/demo-server/handler.ts')],bundle:true,platform:'node',format:'esm',outfile:path.join(dir,'handler.mjs'),logLevel:'silent'});
  await writeFile(path.join(dir,'app/api/generate/route.js'),`
import {createDemoHandlers} from '../../../handler.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
let incomingAborts=0;
const handlers=createDemoHandlers({environment:()=>({NODE_ENV:'development',VIBEKIDDING_DEMO_ENABLED:'1',OPENAI_API_KEY:'synthetic-fixture-key'}),fetcher:(_url,init)=>fetch('http://127.0.0.1:${providerPort}/fake-provider',init)});
export async function GET(request){const response=await handlers.GET(request);return Response.json({...await response.json(),fixtureIncomingAborts:incomingAborts},{status:response.status})}
export async function POST(request){request.signal.addEventListener('abort',()=>{incomingAborts++},{once:true});return handlers.POST(request)}
`);
  const childEnv:NodeJS.ProcessEnv={NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1'};for(const key of envKeys)if(process.env[key])childEnv[key]=process.env[key];
  child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev',dir,'--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:dir,env:childEnv,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream?.on('data',data=>{logs=(logs+String(data)).slice(-8000)});
  const url=`http://127.0.0.1:${port}/api/generate`,origin=`http://127.0.0.1:${port}`;
  await until(async()=>{if(child?.exitCode!==null)throw new Error('Next fixture exited');try{return(await fetch(url,{signal:AbortSignal.timeout(1000)})).ok}catch{return false}},60000);
  const controller=new AbortController();const pending=fetch(url,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({prompt:'fixture one'}),signal:controller.signal}).then(()=>false,error=>error instanceof Error&&error.name==='AbortError');
  await until(async()=>providerRequests===1,10000);controller.abort();assert.equal(await pending,true);
  await until(async()=>firstClosed,5000);
  let evidence:{fixtureIncomingAborts:number;providerCallsRemaining:number}|undefined;
  await until(async()=>{evidence=await(await fetch(url)).json();return evidence!.fixtureIncomingAborts===1},5000);
  assert.equal(evidence!.providerCallsRemaining,19);
  const second=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({prompt:'fixture two'}),signal:AbortSignal.timeout(10000)});
  assert.equal(second.status,200);assert.equal((await second.json()).mode,'ai');assert.equal(providerRequests,2);
  console.log(JSON.stringify({passed:true,evidence:'Native HTTP client abort -> real Next dev Request.signal -> real loopback fake-provider connection close; next call succeeds',incomingAborts:evidence!.fixtureIncomingAborts,upstreamConnectionClosed:firstClosed,providerRequests,liveProviderCalls:0,productionRuntimeVerified:false}));
 }catch(error){console.error(logs);throw error}
 finally{
  if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)child.kill('SIGKILL')}
  await close(provider);await rm(dir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
