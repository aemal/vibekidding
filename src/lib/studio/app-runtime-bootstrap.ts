import { mountAppRuntime } from "./app-runtime-shell";

/** Install from a fixed runtime entrypoint. applicationOrigin is deployment configuration,
 * never a query parameter, referrer, message field or generated-app choice.
 */
export function installAppRuntimeBootstrap(config: { applicationOrigin: string; container: HTMLElement }) {
  const origin = new URL(config.applicationOrigin);
  if (origin.protocol !== "https:" || origin.origin !== config.applicationOrigin ||
      location.protocol !== "https:" || origin.origin === location.origin || window.parent === window)
    throw new Error("Invalid runtime parent origin");
  const expires = performance.now() + 10000;
  let closed = false;
  let initialized = false;
  let session: string | undefined;
  let runtime: ReturnType<typeof mountAppRuntime> | undefined;
  const close = () => {
    if (closed) return;
    closed = true; clearTimeout(deadline); runtime?.close();
    window.removeEventListener("message", receive); window.removeEventListener("pagehide", close);
  };
  const receive = (event: MessageEvent) => {
    if (closed || event.source !== window.parent || event.origin !== origin.origin ||
        typeof event.data !== "string" || event.data.length > 500000 ||
        new TextEncoder().encode(event.data).length > 500000) return;
    if (!initialized && performance.now() >= expires) { close(); return; }
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data || typeof data !== "object" || Array.isArray(data) || data.version !== 1) return;
    const fields = Object.keys(data).sort().join(",");
    if (initialized) {
      if (fields === "operation,session,version" && data.operation === "runtime.close" && data.session === session) close();
      return;
    }
    if (fields !== "html,operation,session,version" || data.operation !== "runtime.init" ||
        typeof data.session !== "string" || !/^[a-zA-Z0-9_-]{16,96}$/.test(data.session) ||
        typeof data.html !== "string" || new TextEncoder().encode(data.html).length > 400000) return;
    initialized = true; session = data.session; clearTimeout(deadline);
    try {
      runtime = mountAppRuntime({ ...config, session: data.session, html: data.html });
      window.parent.postMessage(JSON.stringify({ version: 1, operation: "runtime.initialized", session }), origin.origin);
    } catch { close(); }
  };
  const deadline = setTimeout(close, 10000);
  window.addEventListener("message", receive); window.addEventListener("pagehide", close);
  window.parent.postMessage(JSON.stringify({ version: 1, operation: "runtime.ready" }), origin.origin);
  return { close };
}
