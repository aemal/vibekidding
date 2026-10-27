import { loadEnvConfig } from '@next/env';
import Database from 'better-sqlite3';
import path from 'node:path';
import { providerMetadata,updateProvider } from '../src/lib/v2-providers/store';
import { discoverModels } from '../src/lib/v2-providers/client';
loadEnvConfig(process.cwd());
async function main(){const root=process.env.VIBEKIDDING_V2_DATA_DIR;if(!root)throw new Error('Set isolated verification data root.');const db=new Database(path.join(root,'accounts.sqlite'),{readonly:true});const account=db.prepare('SELECT id,username FROM accounts WHERE username=?').get('qa-v2-ui') as {id:string;username:string}|undefined;db.close();if(!account)throw new Error('Existing QA account not found.');const old=await providerMetadata(account.id);if(old.providers.find(p=>p.provider==='openai')?.configured)throw new Error('Existing OpenAI settings present; refusing to overwrite.');const key=process.env.OPENAI_API_KEY;if(!key)throw new Error('Server key absent.');await updateProvider(account.id,{provider:'openai',apiKey:key});const metadata=await discoverModels(account.id,'openai');const models=metadata.providers.find(p=>p.provider==='openai')!.models;const selected=models.find(m=>m.id==='gpt-6-sol');if(selected)await updateProvider(account.id,{provider:'openai',model:selected.id,select:true});console.log(JSON.stringify({username:account.username,models:models.length,selected:selected?.id||null,capability:selected?.capability,realDiscovery:true}));}
main().catch(error=>{console.error(error instanceof Error?error.message:'Verification failed');process.exitCode=1;});
