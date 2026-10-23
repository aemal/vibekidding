import { AppCapabilityPolicy } from "./app-capability-policy";
import { sandboxDocument } from "./sandbox";

/** Invoke only from fixed, trusted code on the dedicated execution origin.
 * Configuration comes from the validated parent bootstrap, never generated content.
 * No cookies, credentials or private data belong on this origin.
 */
export function mountAppRuntime(config: {
  applicationOrigin: string; session: string; html: string; container: HTMLElement;
}) {
  if (window.parent === window || typeof config.html !== "string" ||
      new TextEncoder().encode(config.html).length > 400000) throw new Error("Invalid runtime configuration");
  const frame = document.createElement("iframe");
  frame.title = "Published project";
  frame.sandbox.add("allow-scripts");
  frame.referrerPolicy = "no-referrer";
  frame.allow = "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'";
  config.container.append(frame);
  const source = frame.contentWindow!;
  let policy: AppCapabilityPolicy;
  try {
    policy = new AppCapabilityPolicy({ applicationOrigin: config.applicationOrigin, executionOrigin: location.origin,
      source, session: config.session, allowed: ["record.read", "record.write"], durationMs: 300000 });
  } catch (error) { frame.remove(); throw error; }
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  const started = performance.now();
  const send = (data: object) => { if (!closed) source.postMessage(JSON.stringify(data), "*"); };
  const close = () => {
    if (closed) return;
    closed = true; policy.close(); clearTimeout(expiry);
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear(); window.removeEventListener("message", receive);
    window.removeEventListener("pagehide", close); frame.remove();
  };
  const receive = (event: MessageEvent) => {
    if (closed) return;
    if (performance.now() - started >= 300000) { close(); return; }
    if (event.source === source && event.origin === "null") {
      let request;
      // The opaque inner origin was checked above. Policy supplies shape/replay limits;
      // its execution-origin argument is not used as proof of this inner frame's origin.
      try { request = policy.accept({ source, origin: location.origin, data: event.data }); } catch { return; }
      if (pending.size >= 4) {
        send({ version: 1, session: config.session, requestId: request.requestId, error: "busy" }); return;
      }
      const timer = setTimeout(() => {
        pending.delete(request.requestId);
        send({ version: 1, session: config.session, requestId: request.requestId,
          error: request.operation === "record.write" ? "outcome_unknown" : "unavailable" });
      }, 12000);
      pending.set(request.requestId, timer);
      window.parent.postMessage(JSON.stringify(request), config.applicationOrigin);
      return;
    }
    if (event.source !== window.parent || event.origin !== config.applicationOrigin ||
        typeof event.data !== "string" || event.data.length > 16384) return;
    let result;
    try { result = JSON.parse(event.data); } catch { return; }
    if (!result || Array.isArray(result) || result.version !== 1 || result.session !== config.session || !pending.has(result.requestId)) return;
    const fields = Object.keys(result).sort().join(",");
    if (fields === "requestId,session,value,version") {
      if (result.value !== null && (typeof result.value !== "string" || new TextEncoder().encode(result.value).length > 4096)) return;
    } else if (fields === "error,requestId,session,version") {
      if (!["busy", "unavailable", "outcome_unknown"].includes(result.error)) return;
    } else return;
    clearTimeout(pending.get(result.requestId)); pending.delete(result.requestId); send(result);
  };
  const expiry = setTimeout(close, 300000);
  window.addEventListener("message", receive); window.addEventListener("pagehide", close);
  // The nonce is validated by policy before interpolation. It is a channel binding, not a credential.
  const sdk = `<script>(()=>{const pending=new Map();const session=${JSON.stringify(config.session)};
    addEventListener('message',e=>{if(e.source!==parent||e.origin!==${JSON.stringify(location.origin)}||typeof e.data!=='string'||e.data.length>16384)return;
      let r;try{r=JSON.parse(e.data)}catch{return}if(!r||r.session!==session||r.version!==1||!pending.has(r.requestId))return;
      const p=pending.get(r.requestId);pending.delete(r.requestId);clearTimeout(p.timer);if(r.error)p.reject(new Error(r.error));else p.resolve(r.value);});
    function call(operation,key,value){if(pending.size>=4)return Promise.reject(new Error('busy'));
      return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(operation==='record.write'?'outcome_unknown':'unavailable'));},14000);
        pending.set(requestId,{resolve,reject,timer});const r={version:1,session,requestId,operation,key};if(operation==='record.write')r.value=value;
        parent.postMessage(JSON.stringify(r),${JSON.stringify(location.origin)});});}
    Object.defineProperty(window,'vibeStorage',{value:Object.freeze({read:key=>call('record.read',key),write:(key,value)=>call('record.write',key,value)}),writable:false});})();<\/script>`;
  frame.srcdoc = sandboxDocument(sdk + config.html);
  return { close, frame };
}
