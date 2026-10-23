/** Local workspace only. No provider, database, global storage or production bridge access. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[a-z][a-z0-9_-]{0,63}$/;
const bytes = (value: string) => new TextEncoder().encode(value).length;
export const DEMO_DATA_LIMITS = Object.freeze({valueBytes:4096,keys:16,projectBytes:65536,messageBytes:16384,requests:100,windowMs:60000,replayWindowMs:300000,replayEntries:500});
const validKey = (key: unknown): key is string => typeof key === 'string' && keyPattern.test(key) && !['__proto__','constructor','prototype'].includes(key);
function namespace(projectId:string){if(typeof projectId!=='string'||!projectId.trim()||projectId.length>128)throw new Error('Invalid project binding');return 'vibekidding-demo-data-v1:'+projectId.split('').map(char=>char.charCodeAt(0).toString(16).padStart(4,'0')).join('')}
function decode(raw:string|null):Record<string,string>{
 if(raw===null)return Object.create(null);
 if(raw.length>DEMO_DATA_LIMITS.projectBytes||bytes(raw)>DEMO_DATA_LIMITS.projectBytes)throw new Error('unavailable');
 const value=JSON.parse(raw);
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='records,version'||value.version!==1||!value.records||typeof value.records!=='object'||Array.isArray(value.records))throw new Error('unavailable');
 const entries=Object.entries(value.records);
 if(entries.length>16||entries.some(([key,value])=>!validKey(key)||typeof value!=='string'||bytes(value)>4096))throw new Error('unavailable');
 return Object.assign(Object.create(null),value.records);
}
export type DemoProjectStore = {read(key:string):string|null;write(key:string,value:string):void};
export function createDemoProjectStore(storage:Pick<Storage,'getItem'|'setItem'>,projectId:string):DemoProjectStore{
 const storageKey=namespace(projectId);
 return {
  read(key){if(!validKey(key))throw new Error('invalid_request');try{return decode(storage.getItem(storageKey))[key]??null}catch{throw new Error('unavailable')}},
  write(key,value){
   if(!validKey(key)||typeof value!=='string'||bytes(value)>4096)throw new Error('invalid_request');
   let baseline:string|null,records:Record<string,string>;
   try{baseline=storage.getItem(storageKey);records=decode(baseline)}catch{throw new Error('unavailable')}
   records[key]=value;
   const encoded=JSON.stringify({version:1,records});
   if(Object.keys(records).length>16||bytes(encoded)>65536)throw new Error('limit_reached');
   try{
    if(storage.getItem(storageKey)!==baseline)throw new Error('conflict');
    storage.setItem(storageKey,encoded);
    if(storage.getItem(storageKey)!==encoded)throw new Error('conflict');
   }catch{throw new Error('outcome_unknown')}
  },
 };
}
export function deleteProjectData(storage:Pick<Storage,'removeItem'>,projectId:string):void{try{storage.removeItem(namespace(projectId))}catch{throw new Error('Data removal could not be confirmed')}}
export const removeProjectData = deleteProjectData;

export class DemoStorageSession {
 private closed=false;private readonly seen=new Map<string,number>();private recent:number[]=[];private last:number;
 constructor(private readonly config:{source:object;session:string;store:DemoProjectStore;now?:()=>number}){
  if(!config.source||!uuid.test(config.session))throw new Error('Invalid session');
  this.last=this.now();if(!Number.isFinite(this.last))throw new Error('Invalid clock');
 }
 private now(){return this.config.now?.()??performance.now()}
 close(){this.closed=true;this.seen.clear();this.recent=[]}
 handle(event:{source:unknown;origin:string;data:unknown}):string|undefined{
  const now=this.now();if(this.closed||!Number.isFinite(now)||now<this.last){this.close();return}this.last=now;
  if(event.source!==this.config.source||event.origin!=='null'||typeof event.data!=='string'||event.data.length>16384||bytes(event.data)>16384)return;
  // Sessions live until host teardown. Retain bounded replay history and a rolling rate window.
  for(const [id,at] of this.seen)if(now-at>=300000)this.seen.delete(id);
  this.recent=this.recent.filter(at=>now-at<60000);
  let request;try{request=JSON.parse(event.data)}catch{return}
  if(!request||typeof request!=='object'||Array.isArray(request)||request.version!==1||request.session!==this.config.session||typeof request.requestId!=='string'||!uuid.test(request.requestId)||this.seen.has(request.requestId)||!validKey(request.key))return;
  const write=request.operation==='record.write';if(!write&&request.operation!=='record.read')return;
  if(Object.keys(request).sort().join(',')!==(write?'key,operation,requestId,session,value,version':'key,operation,requestId,session,version')||write&&(typeof request.value!=='string'||bytes(request.value)>4096))return;
  const base={version:1,session:this.config.session,requestId:request.requestId};
  if(this.recent.length>=100||this.seen.size>=500)return JSON.stringify({...base,error:'busy'});
  this.seen.set(request.requestId,now);this.recent.push(now);
  try{if(write)this.config.store.write(request.key,request.value);const value=write?request.value:this.config.store.read(request.key);if(value!==null&&(typeof value!=='string'||bytes(value)>4096))throw new Error('unavailable');return JSON.stringify({...base,value})}
  catch(error){const allowed=['unavailable','outcome_unknown','limit_reached','invalid_request'];const message=error instanceof Error&&allowed.includes(error.message)?error.message:write?'outcome_unknown':'unavailable';return JSON.stringify({...base,error:message})}
 }
}

/** Inject before generated HTML, only in the trusted local-workspace preview. */
export function demoStorageSdk(session:string,parentOrigin:string):string{
 const origin=new URL(parentOrigin);if(!uuid.test(session)||!['http:','https:'].includes(origin.protocol)||origin.origin!==parentOrigin)throw new Error('Invalid SDK binding');
 return `<script>(()=>{const session=${JSON.stringify(session)},origin=${JSON.stringify(parentOrigin)},pending=new Map();let closed=false;
 addEventListener('message',e=>{if(closed||e.source!==parent||e.origin!==origin||typeof e.data!=='string'||e.data.length>16384)return;let r;try{r=JSON.parse(e.data)}catch{return}if(!r||r.version!==1||r.session!==session||!pending.has(r.requestId))return;const fields=Object.keys(r).sort().join(',');if(fields==='requestId,session,value,version'){if(r.value!==null&&(typeof r.value!=='string'||new TextEncoder().encode(r.value).length>4096))return}else if(fields==='error,requestId,session,version'){if(!['unavailable','outcome_unknown','limit_reached','invalid_request','busy'].includes(r.error))return}else return;const p=pending.get(r.requestId);pending.delete(r.requestId);clearTimeout(p.timer);if(r.error)p.reject(new Error(r.error));else p.resolve(r.value)});
 function call(operation,key,value){if(closed)return Promise.reject(new Error('unavailable'));if(pending.size>=4)return Promise.reject(new Error('busy'));if(typeof key!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(key)||['constructor','prototype'].includes(key)||operation==='record.write'&&(typeof value!=='string'||new TextEncoder().encode(value).length>4096))return Promise.reject(new Error('invalid_request'));return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(operation==='record.write'?'outcome_unknown':'unavailable'))},5000);pending.set(requestId,{resolve,reject,timer});const r={version:1,session,requestId,operation,key};if(operation==='record.write')r.value=value;parent.postMessage(JSON.stringify(r),origin)})}
 addEventListener('pagehide',()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('unavailable'))}pending.clear()});
 Object.defineProperty(window,'vibeStorage',{value:Object.freeze({read:key=>call('record.read',key),write:(key,value)=>call('record.write',key,value)}),writable:false,configurable:false});})();<\/script>`;
}
