/** Optional local workshop capability. The child cannot choose an endpoint or project. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AppAIState = Readonly<{ attempts: number; pending: boolean; enabled: boolean }>;
type Request = { requestId: string; controller: AbortController; timer: ReturnType<typeof setTimeout> };
export class DemoAppAISession {
  private enabled = false;
  private closed = false;
  private attempts = 0;
  private active: Request | null = null;
  private seen = new Set<string>();
  constructor(private config: {
    source: object; session: string;
    ask: (prompt: string, signal: AbortSignal) => Promise<string>;
    reply: (message: string) => void;
    onState?: (state: AppAIState) => void;
  }) { if (!uuid.test(config.session)) throw new Error('Invalid AI session'); }
  private state() { this.config.onState?.({ attempts: this.attempts, pending: !!this.active, enabled: this.enabled }); }
  private reply(requestId: string, result: {text: string} | {error: string}) {
    if (!this.closed) this.config.reply(JSON.stringify({ version: 1, session: this.config.session, operation: 'ai.reply', requestId, ...result }));
  }
  private cancel(error: string) {
    const active = this.active;
    if (!active) return;
    this.active = null; clearTimeout(active.timer); active.controller.abort();
    this.reply(active.requestId, {error});
  }
  setEnabled(enabled: boolean) {
    if (this.closed || this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.cancel('disabled');
    this.state();
  }
  close() { this.closed = true; this.enabled = false; this.cancel('disabled'); }
  handle(event: {source: unknown; origin: string; data: unknown}) {
    if (this.closed || event.source !== this.config.source || event.origin !== 'null' || typeof event.data !== 'string' || event.data.length > 8192 || new TextEncoder().encode(event.data).length > 8192) return;
    let request;
    try { request = JSON.parse(event.data); } catch { return; }
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).sort().join(',') !== 'operation,prompt,requestId,session,version' || request.version !== 1 || request.session !== this.config.session || request.operation !== 'ai.ask' || typeof request.requestId !== 'string' || !uuid.test(request.requestId) || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 1000 || this.seen.has(request.requestId)) return;
    if (!this.enabled) { this.reply(request.requestId, {error:'disabled'}); return; }
    if (this.active) { this.reply(request.requestId, {error:'busy'}); return; }
    if (this.attempts >= 3) { this.reply(request.requestId, {error:'limit'}); return; }
    this.seen.add(request.requestId); this.attempts++;
    const controller = new AbortController();
    const active: Request = {requestId: request.requestId, controller, timer: setTimeout(() => {
      if (this.active !== active) return;
      this.cancel('unavailable'); this.state();
    }, 30_000)};
    this.active = active; this.state();
    void Promise.resolve().then(() => {
      if (this.active !== active || controller.signal.aborted) throw new Error('Stopped');
      return this.config.ask(request.prompt, controller.signal);
    }).then(text => {
      if (this.closed || this.active !== active || controller.signal.aborted) return;
      if (typeof text !== 'string' || !text.trim() || new TextEncoder().encode(text).length > 4096) throw new Error('Invalid reply');
      this.reply(active.requestId, {text});
    }).catch(() => {
      if (!this.closed && this.active === active && !controller.signal.aborted) this.reply(active.requestId, {error:'unavailable'});
    }).finally(() => {
      clearTimeout(active.timer);
      if (this.active === active) { this.active = null; this.state(); }
    });
  }
}

/** Fixed same-origin route; never accept a child-provided URL or headers. */
export async function askDemoAppAI(prompt: string, signal: AbortSignal): Promise<string> {
  const response = await fetch('/api/demo/app-ai', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt}),signal});
  if (!response.ok || signal.aborted || !response.body) throw new Error('unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (signal.aborted) throw new Error('unavailable');
      if (done) break;
      size += value.byteLength;
      if (size > 16384) throw new Error('unavailable');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Object.keys(value).join(',') !== 'text' || typeof value.text !== 'string' || !value.text.trim() || new TextEncoder().encode(value.text).length > 4096) throw new Error('unavailable');
    return value.text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function demoAppAISdk(session: string, parentOrigin: string): string {
  const origin = new URL(parentOrigin);
  if (!uuid.test(session) || !['http:','https:'].includes(origin.protocol) || origin.origin !== parentOrigin) throw new Error('Invalid AI binding');
  return `<script>(()=>{const session=${JSON.stringify(session)},origin=${JSON.stringify(parentOrigin)};let pending=null,closed=false;const messages={disabled:'AI replies are off or unavailable. Ask your grown-up about the control above this preview.',busy:'Please wait for the current reply.',limit:'This play session has used its three AI attempts.',unavailable:'AI could not reply. Please try again if you have attempts left.'};addEventListener('message',e=>{if(closed||e.source!==parent||e.origin!==origin||typeof e.data!=='string'||e.data.length>16384||!pending)return;let r;try{r=JSON.parse(e.data)}catch{return}if(!r||r.version!==1||r.session!==session||r.operation!=='ai.reply'||r.requestId!==pending.id)return;const fields=Object.keys(r).sort().join(',');if(fields==='operation,requestId,session,text,version'){if(typeof r.text!=='string'||new TextEncoder().encode(r.text).length>4096)return}else if(fields==='error,operation,requestId,session,version'){if(!Object.hasOwn(messages,r.error))return}else return;const p=pending;pending=null;clearTimeout(p.timer);if(r.error)p.reject(new Error(messages[r.error]));else p.resolve(r.text)});Object.defineProperty(window,'vibeAI',{value:Object.freeze({ask(text){if(closed)return Promise.reject(new Error(messages.unavailable));if(pending)return Promise.reject(new Error(messages.busy));if(typeof text!=='string'||!text.trim()||text.length>1000)return Promise.reject(new Error('Use a short idea, up to 1000 characters.'));return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{pending=null;reject(new Error(messages.unavailable))},35000);pending={id,timer,resolve,reject};parent.postMessage(JSON.stringify({version:1,session,requestId:id,operation:'ai.ask',prompt:text}),origin)})}}),writable:false,configurable:false});addEventListener('pagehide',()=>{closed=true;if(pending){clearTimeout(pending.timer);pending.reject(new Error(messages.unavailable));pending=null}},{once:true});})();<\/script>`;
}
