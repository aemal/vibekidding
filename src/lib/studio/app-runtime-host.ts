import { AppStorageDispatcher } from "./app-storage-dispatcher";

/** Trusted studio-side mount. The caller must bind project/html to the approved server
 * response and close on account, consent, supervision or publication changes.
 * call is parent-only authenticated transport. It must honor AbortSignal.
 */
export function mountAppRuntimeHost(config: {
  executionOrigin: string; projectId: string; html: string; container: HTMLElement;
  call: ConstructorParameters<typeof AppStorageDispatcher>[0]["call"];
}) {
  const origin = new URL(config.executionOrigin);
  if (origin.protocol !== "https:" || origin.origin !== config.executionOrigin ||
      location.protocol !== "https:" || location.origin === origin.origin || document.hidden ||
      new TextEncoder().encode(config.html).length > 400000) throw new Error("Invalid runtime host configuration");
  const session = crypto.randomUUID();
  const frame = document.createElement("iframe");
  frame.title = "Interactive published project";
  // Same-origin is for the fixed trusted outer shell on a DIFFERENT origin only.
  // Generated code is placed in an opaque inner frame by that shell.
  frame.sandbox.add("allow-scripts", "allow-same-origin");
  frame.referrerPolicy = "no-referrer";
  frame.allow = "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'";
  config.container.append(frame);
  const source = frame.contentWindow!;
  let dispatcher: AppStorageDispatcher;
  try {
    dispatcher = new AppStorageDispatcher({ applicationOrigin: location.origin, executionOrigin: origin.origin,
      projectId: config.projectId, session, source, durationMs: 300000, call: config.call });
  } catch (error) { frame.remove(); throw error; }
  let closed = false, initialized = false, sent = false;
  const started = performance.now();
  const close = () => {
    if (closed) return;
    closed = true; dispatcher.close(); clearTimeout(startup); clearTimeout(expiry);
    window.removeEventListener("message", receive); window.removeEventListener("pagehide", close);
    document.removeEventListener("visibilitychange", visibility);
    source.postMessage(JSON.stringify({ version: 1, operation: "runtime.close", session }), origin.origin);
    frame.remove();
  };
  const visibility = () => { if (document.hidden) close(); };
  const receive = (event: MessageEvent) => {
    if (closed || event.source !== source || event.origin !== origin.origin) return;
    if (performance.now() - started >= (initialized ? 300000 : 10000)) { close(); return; }
    if (typeof event.data !== "string" || event.data.length > 16384) return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    const fields = Object.keys(data).sort().join(",");
    if (fields === "operation,version" && data.version === 1 && data.operation === "runtime.ready") {
      // Another readiness announcement means the execution document changed. Never re-send content.
      if (sent) { close(); return; }
      sent = true;
      source.postMessage(JSON.stringify({ version: 1, operation: "runtime.init", session, html: config.html }), origin.origin);
    } else if (fields === "operation,session,version" && data.version === 1 && data.operation === "runtime.initialized" && data.session === session && sent) {
      if (initialized) { close(); return; }
      initialized = true; clearTimeout(startup);
    } else if (initialized) { void dispatcher.handle(event); }
  };
  const startup = setTimeout(close, 10000);
  const expiry = setTimeout(close, 300000);
  window.addEventListener("message", receive); window.addEventListener("pagehide", close);
  document.addEventListener("visibilitychange", visibility);
  frame.src = origin.origin + "/";
  return { close, frame };
}
