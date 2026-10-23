// Inert foundation: no listener, network calls or storage access are installed here.
// Acceptance validates the transport only. The server must authorize every operation.
export type AppCapabilityRequest = {
  version: 1;
  session: string;
  requestId: string;
} & (
  | { operation: "record.read"; key: string }
  | { operation: "record.write"; key: string; value: string }
  | { operation: "ai.generate"; prompt: string }
);
type Operation = AppCapabilityRequest["operation"];
const operations: readonly Operation[] = ["record.read", "record.write", "ai.generate"];
const identifier = /^[a-zA-Z0-9_-]{16,96}$/;
function origin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value || url.username || url.password)
    throw new Error("An exact HTTPS origin is required");
  return value;
}
export class AppCapabilityPolicy {
  private readonly source: object;
  private readonly executionOrigin: string;
  private readonly session: string;
  private readonly allowed: Set<Operation>;
  private readonly durationMs: number;
  private readonly started: number;
  private last: number;
  private closed = false;
  private readonly seen = new Set<string>();
  constructor(config: {
    applicationOrigin: string; executionOrigin: string; source: object;
    session: string; allowed: readonly Operation[]; durationMs: number;
  }, private readonly clock = () => performance.now()) {
    this.executionOrigin = origin(config.executionOrigin);
    if (origin(config.applicationOrigin) === this.executionOrigin || !config.source ||
        typeof config.source !== "object" || !identifier.test(config.session) ||
        !Number.isSafeInteger(config.durationMs) || config.durationMs < 1 || config.durationMs > 300000 ||
        config.allowed.some(op => !operations.includes(op))) throw new Error("Invalid capability binding");
    this.source = config.source;
    this.session = config.session;
    this.allowed = new Set(config.allowed);
    this.durationMs = config.durationMs;
    this.started = this.last = clock();
    if (!Number.isFinite(this.started)) throw new Error("Invalid capability clock");
  }
  close() { this.closed = true; this.seen.clear(); }
  private deny(): never { throw new Error("Capability request rejected"); }
  accept(event: { source: unknown; origin: string; data: unknown }): AppCapabilityRequest {
    const now = this.clock();
    if (this.closed || !Number.isFinite(now) || now < this.last || now - this.started >= this.durationMs) {
      this.close(); return this.deny();
    }
    this.last = now;
    // Ignore unrelated windows without consuming this session's request quota.
    if (event.source !== this.source || event.origin !== this.executionOrigin) return this.deny();
    if (typeof event.data !== "string" || event.data.length > 16384 || new TextEncoder().encode(event.data).length > 16384)
      return this.deny();
    let data;
    try { data = JSON.parse(event.data); } catch { return this.deny(); }
    if (!data || typeof data !== "object" || Array.isArray(data) || data.version !== 1 ||
        data.session !== this.session || typeof data.requestId !== "string" || !identifier.test(data.requestId) ||
        !this.allowed.has(data.operation) || this.seen.has(data.requestId)) return this.deny();
    const fields = ["operation", "requestId", "session", "version"];
    if (data.operation === "ai.generate") {
      fields.push("prompt");
      if (typeof data.prompt !== "string" || !data.prompt.trim() || data.prompt.length > 2000) return this.deny();
    } else {
      fields.push("key");
      if (typeof data.key !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(data.key)) return this.deny();
      if (data.operation === "record.write") {
        fields.push("value");
        if (typeof data.value !== "string" || new TextEncoder().encode(data.value).length > 4096) return this.deny();
      }
    }
    if (Object.keys(data).sort().join(",") !== fields.sort().join(",")) return this.deny();
    if (this.seen.size >= 100) { this.close(); return this.deny(); }
    this.seen.add(data.requestId);
    return data as AppCapabilityRequest;
  }
}
