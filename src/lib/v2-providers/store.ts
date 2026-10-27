import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { dataRoot } from '../v2/store';
export type Provider = 'openai'|'anthropic';
export type ModelOption = {id:string;label:string;capability:'text-generation'|'unverified';maxOutputTokens?:number};
type Setting={apiKey?:string;model?:string;models?:ModelOption[];modelsCheckedAt?:string};
type Settings={selectedProvider?:Provider;openai?:Setting;anthropic?:Setting;elevenlabs?:{apiKey?:string;agentId?:string}};
const queues=new Map<string,Promise<unknown>>();
function ownerPath(owner:string){if(!/^[\w-]{1,100}$/.test(owner))throw new Error('Invalid account.');return path.join(dataRoot(),'providers',owner+'.json');}
async function encryptionKey(){
 const dir=path.join(dataRoot(),'providers');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const configured=process.env.VIBEKIDDING_PROVIDER_ENCRYPTION_KEY;
 if(configured){const key=Buffer.from(configured,'base64');if(key.length!==32)throw new Error('Provider encryption configuration is invalid.');return key;}
 const file=path.join(dir,'.encryption-key');
 try{return Buffer.from(await fs.readFile(file,'utf8'),'base64');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const key=randomBytes(32);try{await fs.writeFile(file,key.toString('base64'),{flag:'wx',mode:0o600});return key;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;return Buffer.from(await fs.readFile(file,'utf8'),'base64');}
}
async function read(owner:string):Promise<Settings>{
 const file=ownerPath(owner);let raw;try{raw=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};throw new Error('Provider settings could not be read.');}
 try{const decipher=createDecipheriv('aes-256-gcm',await encryptionKey(),Buffer.from(raw.iv,'base64'));decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(Buffer.from(raw.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw.data,'base64')),decipher.final()]).toString());}catch{throw new Error('Provider settings could not be decrypted.');}
}
async function write(owner:string,value:Settings){const key=await encryptionKey();const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(owner));const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);const file=ownerPath(owner);const temp=file+'.'+randomBytes(6).toString('hex');await fs.writeFile(temp,JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});await fs.rename(temp,file);}
async function mutate(owner:string,work:(settings:Settings)=>Promise<void>|void){const previous=queues.get(owner)||Promise.resolve();const pending=previous.catch(()=>{}).then(async()=>{const settings=await read(owner);await work(settings);await write(owner,settings);});queues.set(owner,pending);try{await pending;}finally{if(queues.get(owner)===pending)queues.delete(owner);}return providerMetadata(owner);}
export async function providerMetadata(owner:string){const settings=await read(owner);return {selectedProvider:settings.selectedProvider||null,providers:(['openai','anthropic'] as Provider[]).map(provider=>({provider,configured:!!settings[provider]?.apiKey,model:settings[provider]?.model||null,models:settings[provider]?.models||[],modelsCheckedAt:settings[provider]?.modelsCheckedAt})),voice:{configured:!!settings.elevenlabs?.apiKey,agentId:settings.elevenlabs?.agentId||null}};}
export function providerName(value:unknown):Provider{if(value!=='openai'&&value!=='anthropic')throw new Error('Choose OpenAI or Anthropic.');return value;}
export async function updateProvider(owner:string,input:Record<string,unknown>){return mutate(owner,settings=>{
 const provider=input.provider;if(provider!=='openai'&&provider!=='anthropic'&&provider!=='elevenlabs')throw new Error('Unknown provider.');
 if(input.remove===true){delete settings[provider];if(settings.selectedProvider===provider)delete settings.selectedProvider;return;}
 if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||!input.apiKey.trim()||input.apiKey.length>4096||/[\r\n]/.test(input.apiKey)))throw new Error('Enter a valid API key.');
 if(provider==='elevenlabs'){if(input.agentId!==undefined&&(typeof input.agentId!=='string'||!/^[\w-]{1,200}$/.test(input.agentId)))throw new Error('Enter a valid ElevenLabs agent ID.');settings.elevenlabs={...settings.elevenlabs,...(input.apiKey?{apiKey:(input.apiKey as string).trim()}:{}),...(input.agentId?{agentId:input.agentId as string}:{})};return;}
 const current={...settings[provider]};if(input.apiKey){current.apiKey=(input.apiKey as string).trim();current.models=[];delete current.modelsCheckedAt;delete current.model;}
 if(input.model!==undefined){if(typeof input.model!=='string'||(!current.models?.some(m=>m.id===input.model)&&current.model!==input.model))throw new Error('Refresh available models and choose one from your account.');current.model=input.model;}
 if(input.select===true){if(!current.apiKey||!current.model)throw new Error('Configure a key and select an available model first.');settings.selectedProvider=provider;}
 settings[provider]=current;
});}
export async function providerCredential(owner:string,provider:Provider){const setting=(await read(owner))[provider];if(!setting?.apiKey)throw new Error(`Configure your ${provider==='openai'?'OpenAI':'Anthropic'} API key in Settings.`);return setting.apiKey;}
export async function resolveGenerationSettings(owner:string){const settings=await read(owner);const provider=settings.selectedProvider;if(!provider||!settings[provider]?.apiKey||!settings[provider]?.model)throw new Error('Choose your coding provider and model in Settings before generating.');return {provider,apiKey:settings[provider]!.apiKey!,model:settings[provider]!.model!,maxOutputTokens:settings[provider]!.models?.find(item=>item.id===settings[provider]!.model)?.maxOutputTokens};}
export async function resolveVoiceSettings(owner:string){const voice=(await read(owner)).elevenlabs;if(!voice?.apiKey||!voice.agentId)throw new Error('Configure your ElevenLabs API key and agent ID in Settings.');return {apiKey:voice.apiKey,agentId:voice.agentId};}
export async function saveDiscoveredModels(owner:string,provider:Provider,key:string,models:ModelOption[]){return mutate(owner,settings=>{const setting=settings[provider];if(setting?.apiKey!==key)throw new Error('The API key changed. Refresh models again.');setting.models=models;setting.modelsCheckedAt=new Date().toISOString();});}
