import { providerCredential, saveDiscoveredModels, type Provider, type ModelOption } from './store';
function headers(provider:Provider,key:string):Record<string,string>{return provider==='openai'?{'content-type':'application/json',authorization:`Bearer ${key}`}:{'content-type':'application/json',authorization:`Bearer ${key}`,'anthropic-version':'2026-10-21'};}
async function jsonResponse(response:Response,provider:Provider){if(!response.ok){await response.body?.cancel();throw new Error(`${provider==='openai'?'OpenAI':'Anthropic'} request failed (HTTP ${response.status}). ${response.status===401?'Check your API key.':response.status===429?'Check your quota and rate limits.':'Check the selected model and provider account.'}`);}const text=await response.text();if(text.length>2_000_000)throw new Error('Provider response exceeded the size limit.');try{return JSON.parse(text);}catch{throw new Error('Provider returned an invalid response.');}}
export async function discoverModels(owner:string,provider:Provider,fetcher:typeof fetch=fetch){const key=await providerCredential(owner,provider);const models:ModelOption[]=[];let after='';for(let page=0;page<10;page++){
 const url=provider==='openai'?'https://api.openai.com/v1/models':`https://api.anthropic.com/v1/models?limit=100${after?'&after_id='+encodeURIComponent(after):''}`;
 let response;try{response=await fetcher(url,{headers:headers(provider,key),signal:AbortSignal.timeout(30000),cache:'no-store'});}catch{throw new Error('Could not reach the provider. Please retry.');}const body=await jsonResponse(response,provider);
 if(!Array.isArray(body.data))throw new Error('Provider returned an invalid model list.');
 for(const model of body.data){if(typeof model.id!=='string')continue;
 // OpenAI list lacks capabilities. Exclude known non-text families, label others honestly.
 if(provider==='openai'&&/(embedding|whisper|tts|dall-e|image|realtime|transcrib|moderation|sora|audio)/i.test(model.id))continue;
 models.push({id:model.id,label:typeof model.display_name==='string'?model.display_name:model.id,capability:provider==='anthropic'?'text-generation':'unverified',...(provider==='anthropic'&&Number.isInteger(model.max_tokens)&&model.max_tokens>0?{maxOutputTokens:model.max_tokens}:{})});}
 if(provider==='openai'||!body.has_more)break;if(typeof body.last_id!=='string'||body.last_id===after)throw new Error('Provider model pagination was invalid.');after=body.last_id;
 }return saveDiscoveredModels(owner,provider,key,[...new Map(models.map(model=>[model.id,model])).values()]);}
export async function generateText(settings:{provider:Provider;apiKey:string;model:string;maxOutputTokens?:number},system:string,input:string,fetcher:typeof fetch=fetch){const {provider,apiKey,model}=settings;
 const url=provider==='openai'?'https://api.openai.com/v1/responses':'https://api.anthropic.com/v1/messages';
 const outputLimit=settings.maxOutputTokens?Math.min(16000,Math.max(1,settings.maxOutputTokens)):16000;
 const body=provider==='openai'?{model,instructions:system,input,max_output_tokens:outputLimit}:{model,system,max_tokens:outputLimit,messages:[{role:'user',content:input}]};
 let response;try{response=await fetcher(url,{method:'POST',headers:headers(provider,apiKey),body:JSON.stringify(body),signal:AbortSignal.timeout(180000),cache:'no-store'});}catch{throw new Error('The coding provider could not be reached or timed out. Please retry.');}const result=await jsonResponse(response,provider);
 if(provider==='anthropic'){if(result.stop_reason!=='end_turn')throw new Error('The coding model did not finish. Try a smaller request.');return (result.content||[]).filter((part:{type:string})=>part.type==='text').map((part:{text:string})=>part.text).join('');}
 if(result.status!=='completed')throw new Error('The coding model did not finish. Try a smaller request.');return (result.output||[]).flatMap((item:{content?:{type:string;text?:string}[]})=>item.content||[]).filter((part:{type:string})=>part.type==='output_text').map((part:{text:string})=>part.text).join('');
}
