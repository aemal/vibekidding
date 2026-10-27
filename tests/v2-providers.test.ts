import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateProvider,providerMetadata,resolveGenerationSettings,resolveVoiceSettings } from '../src/lib/v2-providers/store';
import { discoverModels,generateText } from '../src/lib/v2-providers/client';
test('provider keys encrypted and owner isolated; only discovered selection allowed',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'v2-provider-'));const old=process.env.VIBEKIDDING_V2_DATA_DIR;process.env.VIBEKIDDING_V2_DATA_DIR=root;
 try{await updateProvider('alice',{provider:'openai',apiKey:'secret-alice'});
 assert.ok(!(await fs.readFile(path.join(root,'providers/alice.json'),'utf8')).includes('secret-alice'));
 await assert.rejects(resolveGenerationSettings('bob'),/Choose/);
 await assert.rejects(updateProvider('alice',{provider:'openai',model:'invented',select:true}),/Refresh/);
 const fetcher=(async(_url:unknown,init?:RequestInit)=>{assert.equal((init?.headers as Record<string,string>).authorization,'Bearer secret-alice');return Response.json({data:[{id:'account-code-model'},{id:'text-embedding-3'}]});}) as typeof fetch;
 const meta=await discoverModels('alice','openai',fetcher);assert.equal(meta.providers[0].models.length,1);assert.equal(meta.providers[0].models[0].capability,'unverified');
 await updateProvider('alice',{provider:'openai',model:'account-code-model',select:true});assert.equal((await resolveGenerationSettings('alice')).model,'account-code-model');
 await updateProvider('alice',{provider:'elevenlabs',apiKey:'voice-secret',agentId:'agent-123'});assert.equal((await resolveVoiceSettings('alice')).agentId,'agent-123');assert.ok(!JSON.stringify(await providerMetadata('alice')).includes('secret'));
 await fs.copyFile(path.join(root,'providers/alice.json'),path.join(root,'providers/bob.json'));await assert.rejects(providerMetadata('bob'),/decrypt/);
 await updateProvider('alice',{provider:'openai',remove:true});await assert.rejects(resolveGenerationSettings('alice'),/Choose/);
 }finally{if(old===undefined)delete process.env.VIBEKIDDING_V2_DATA_DIR;else process.env.VIBEKIDDING_V2_DATA_DIR=old;await fs.rm(root,{recursive:true,force:true});}
});
test('adapters use selected models and sanitize upstream errors',async()=>{
 for(const provider of ['openai','anthropic'] as const){let sent:Record<string,unknown>={};const fetcher=(async(_url:unknown,init?:RequestInit)=>{sent=JSON.parse(init?.body as string);return Response.json(provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:'result'}]}]}:{stop_reason:'end_turn',content:[{type:'text',text:'result'}]});}) as typeof fetch;
 assert.equal(await generateText({provider,apiKey:'private',model:'selected-account-model'},'system','input',fetcher),'result');assert.equal(sent.model,'selected-account-model');
 await assert.rejects(generateText({provider,apiKey:'private',model:'x'},'s','i',(async()=>new Response('private upstream secret',{status:401})) as typeof fetch),error=>error instanceof Error&&!error.message.includes('private')&&error.message.includes('401'));
 }
});
test('owned generation never borrows server credentials',async()=>{
 const { generateProject }=await import('../src/lib/v2/provider');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'v2-no-fallback-'));const old=process.env.VIBEKIDDING_V2_DATA_DIR;const oldKey=process.env.OPENAI_API_KEY;const oldDemo=process.env.VIBEKIDDING_ALLOW_LOCAL_PROVIDER_DEFAULT;
 process.env.VIBEKIDDING_V2_DATA_DIR=root;process.env.OPENAI_API_KEY='owner-server-secret';process.env.VIBEKIDDING_ALLOW_LOCAL_PROVIDER_DEFAULT='1';
 let called=false;try{await assert.rejects(generateProject('Build a tracker',undefined,(async()=>{called=true;throw new Error('unexpected');}) as typeof fetch,[],'unconfigured-family'),/Settings/);assert.equal(called,false);}finally{for(const [name,value] of Object.entries({VIBEKIDDING_V2_DATA_DIR:old,OPENAI_API_KEY:oldKey,VIBEKIDDING_ALLOW_LOCAL_PROVIDER_DEFAULT:oldDemo})){if(value===undefined)delete process.env[name];else process.env[name]=value;}await fs.rm(root,{recursive:true,force:true});}
});
test('Anthropic output cap uses returned model capability without changing selection',async()=>{
 let sent:Record<string,unknown>={};const fetcher=(async(_url:unknown,init?:RequestInit)=>{sent=JSON.parse(init?.body as string);return Response.json({stop_reason:'end_turn',content:[{type:'text',text:'done'}]});}) as typeof fetch;
 await generateText({provider:'anthropic',apiKey:'secret',model:'account-model',maxOutputTokens:4096},'s','i',fetcher);assert.equal(sent.max_tokens,4096);assert.equal(sent.model,'account-model');
});
