/** Advisory local-preview diagnostics. Never collect exception text, stacks or app/user data. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_PREVIEW_PROBLEMS = 3;
export const PREVIEW_PROBLEM_MESSAGE = 'This version hit a problem. You can try an earlier version or ask for a repair.';
export const PREVIEW_REPAIR_PROMPT = 'This version hit a problem while I was playing. Please check the code and repair broken controls or JavaScript errors while keeping the existing features. Use sandbox-compatible buttons and keep saved app data separate from the code.';
export type PreviewProblem = Readonly<{category:'runtime-error'|'unhandled-rejection';message:string}>;

/** Bind to the current opaque frame only. These reports are untrusted hints, not proof of correctness. */
export class DemoPreviewDiagnostics {
 private closed=false;private count=0;
 private readonly source:object;private readonly session:string;
 constructor(config:{source:object;session:string}){
  if(!config.source||typeof config.source!=='object'||!uuid.test(config.session))throw new Error('Invalid diagnostic binding');
  this.source=config.source;this.session=config.session;
 }
 close(){this.closed=true}
 handle(event:{source:unknown;origin:string;data:unknown}):PreviewProblem|undefined{
  if(this.closed||this.count>=MAX_PREVIEW_PROBLEMS||event.source!==this.source||event.origin!=='null'||typeof event.data!=='string'||event.data.length>512||new TextEncoder().encode(event.data).length>512)return;
  let data;try{data=JSON.parse(event.data)}catch{return}
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!=='category,operation,session,version'||data.version!==1||data.operation!=='preview.problem'||data.session!==this.session||!['runtime-error','unhandled-rejection'].includes(data.category))return;
  this.count++;
  return Object.freeze({category:data.category,message:PREVIEW_PROBLEM_MESSAGE});
 }
}

/** Place before generated HTML. Deliberately ignore event.message, error, reason and target. */
export function demoPreviewDiagnosticsSdk(session:string,parentOrigin:string):string{
 const origin=new URL(parentOrigin);
 if(!uuid.test(session)||!['http:','https:'].includes(origin.protocol)||origin.origin!==parentOrigin)throw new Error('Invalid diagnostic binding');
 return `<script>(()=>{const session=${JSON.stringify(session)},origin=${JSON.stringify(parentOrigin)};let count=0,closed=false;function report(category){if(closed||count>=3)return;count++;parent.postMessage(JSON.stringify({version:1,session,operation:'preview.problem',category}),origin)}function runtime(){report('runtime-error')}function rejection(){report('unhandled-rejection')}addEventListener('error',runtime);addEventListener('unhandledrejection',rejection);addEventListener('pagehide',()=>{closed=true;removeEventListener('error',runtime);removeEventListener('unhandledrejection',rejection)},{once:true});})();<\/script>`;
}
