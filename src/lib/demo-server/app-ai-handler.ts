import { demoAccessError, publicTemplateDemo, type DemoEnvironment, type DemoUsage } from './access';
import { configuredProvider } from './provider';
import { sharedDemoUsage } from './usage';
import { APP_AI_LIMITS, appAiConfigured, appAiText } from './app-ai-provider';
import { readBoundedText, RequestBodyError } from '../studio/request-body';
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function denied(request:Request,env:DemoEnvironment){return env.NODE_ENV==='production'||publicTemplateDemo(env)||env.VIBEKIDDING_DEMO_APP_AI_ENABLED!=='1'||configuredProvider(env)!=='openai'?'App AI is unavailable in this mode.':demoAccessError(request,env)}
export function createAppAiHandlers(options:{environment?:()=>DemoEnvironment;usage?:DemoUsage;fetcher?:typeof fetch}={}){
 const environment=options.environment??(()=>process.env),usage=options.usage??sharedDemoUsage();
 return{
  async GET(request:Request){const env=environment(),error=denied(request,env),configured=!error&&appAiConfigured(env);return response({enabled:!!configured&&usage.remainingProviderCalls()>0,configured:!!configured,localOnly:true,limits:APP_AI_LIMITS,providerCallsRemaining:error?0:usage.remainingProviderCalls(),...(error?{error}:{})},error?403:200)},
  async POST(request:Request){
   const env=environment(),error=denied(request,env);if(error)return response({error},403);
   if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response({error:'Send application/json.'},415);
   if(request.signal.aborted)return response({error:'The request was cancelled.'},408);
   if(!appAiConfigured(env))return response({error:'AI replies are unavailable right now.'},503);
   if(!usage.admit())return response({error:'The demo is busy or its rate limit was reached.'},429);
   try{
    const raw=await readBoundedText(request,APP_AI_LIMITS.bodyBytes);let body;
    try{body=JSON.parse(raw)}catch{return response({error:'Invalid JSON.'},400)}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join(',')!=='prompt'||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>1000)return response({error:'Provide only a prompt of 1-1000 characters.'},400);
    if(request.signal.aborted)return response({error:'The request was cancelled.'},408);
    if(!usage.reserveProviderCall())return response({error:'This demo process has reached its AI call limit.'},429);
    const text=await appAiText(env,body.prompt.trim(),request.signal,options.fetcher);
    if(request.signal.aborted)return response({error:'The request was cancelled.'},408);
    return response({text});
   }catch(error){
    if(request.signal.aborted)return response({error:'The request was cancelled.'},408);
    if(error instanceof RequestBodyError)return response({error:'The request could not be completed.'},error.status);
    return response({error:'AI replies are unavailable right now.'},503);
   }finally{usage.finish()}
  },
 };
}
