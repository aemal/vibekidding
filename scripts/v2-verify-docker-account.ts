import { loadEnvConfig } from '@next/env';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
loadEnvConfig(process.cwd());
async function main(){
 const origin='http://localhost:3230';const filename='/tmp/vibekidding-docker-qa-account.json';
 const state=await fetch(origin+'/api/v2/auth/session').then(r=>r.json());if(!state.setupRequired)throw new Error('Account already exists; refusing duplicate setup.');
 const username='docker-qa';const password=randomBytes(24).toString('base64url');
 await fs.writeFile(filename,JSON.stringify({origin,username,password}),{mode:0o600,flag:'wx'});
 const setup=await fetch(origin+'/api/v2/auth/setup',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({username,password})});if(!setup.ok)throw new Error('QA account setup failed (HTTP '+setup.status+').');
 const cookie=setup.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Setup returned no session.');
 const user=(await setup.json()).user;
 const request=async(url:string,method:string,body?:unknown)=>{const response=await fetch(origin+url,{method,headers:{'content-type':'application/json',origin,cookie},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error('QA configuration request failed (HTTP '+response.status+').');return response.json();};
 const existing=await request('/api/v2/providers','GET');if(existing.providers.some((p:{configured:boolean})=>p.configured))throw new Error('Refusing to overwrite configured providers.');
 if(!process.env.OPENAI_API_KEY)throw new Error('Server OpenAI key is absent.');
 await request('/api/v2/providers','PUT',{provider:'openai',apiKey:process.env.OPENAI_API_KEY});
 const models=await request('/api/v2/providers/models','POST',{provider:'openai'});if(!models.providers.find((p:{provider:string})=>p.provider==='openai').models.some((m:{id:string})=>m.id==='gpt-6-sol'))throw new Error('Requested model is unavailable.');
 await request('/api/v2/providers','PUT',{provider:'openai',model:'gpt-6-sol',select:true});
 console.log(JSON.stringify({origin,username,userId:user.userId,credentialFile:filename,configured:true,model:'gpt-6-sol'}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'QA configuration failed');process.exitCode=1;});
