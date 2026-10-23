import { AppCapabilityPolicy } from "./app-capability-policy";

type StorageInput = { projectId: string; requestId: string; operation: "read" | "write"; key: string; value?: string };
type Event = { source: unknown; origin: string; data: unknown };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Trusted parent adapter. Credentials stay inside call; never pass this object to a frame.
 * Host must close on navigation, account/supervision changes and document hiding.
 * Server authorization is required on every call. This does not enable any preview.
 */
export class AppStorageDispatcher {
  private readonly policy: AppCapabilityPolicy;
  private readonly pending = new Set<AbortController>();
  private readonly expiry: ReturnType<typeof setTimeout>;
  private closed = false;
  private readonly deadline: number;
  private readonly config;
  constructor(config: {
    applicationOrigin: string; executionOrigin: string;
    source: { postMessage(message: string, targetOrigin: string): void };
    session: string; projectId: string; durationMs: number;
    call: (input: StorageInput, signal: AbortSignal) => Promise<unknown>;
  }) {
    if (!uuid.test(config.projectId)) throw new Error("Invalid project binding");
    this.config = { ...config };
    this.deadline = performance.now() + config.durationMs;
    this.policy = new AppCapabilityPolicy({ ...config, allowed: ["record.read", "record.write"] });
    this.expiry = setTimeout(() => this.close(), config.durationMs);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.expiry);
    this.policy.close();
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }
  async handle(event: Event): Promise<void> {
    if (this.closed) return;
    let request;
    try { request = this.policy.accept(event); } catch { return; }
    // Database replay keys are UUIDs; never translate or silently replace a supplied ID.
    if (!uuid.test(request.requestId) || request.operation === "ai.generate") return;
    const reply = (result: object) => {
      if (this.closed) return;
      if (performance.now() >= this.deadline) { this.close(); return; }
      try {
        this.config.source.postMessage(JSON.stringify({ version: 1, session: this.config.session,
          requestId: request.requestId, ...result }), this.config.executionOrigin);
      } catch { this.close(); }
    };
    if (this.pending.size >= 4) { reply({ error: "busy" }); return; }
    const controller = new AbortController();
    this.pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("Stopped")), { once: true });
      timer = setTimeout(() => controller.abort(), 10000);
    });
    try {
      const input: StorageInput = { projectId: this.config.projectId, requestId: request.requestId,
        operation: request.operation === "record.read" ? "read" : "write", key: request.key };
      if (request.operation === "record.write") input.value = request.value;
      const result = await Promise.race([Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Stopped");
        return this.config.call(input, controller.signal);
      }), cancelled]);
      if (controller.signal.aborted || this.closed) return;
      // Copy only the explicitly supported value, never errors, headers, identities or tokens.
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid result");
      const value = (result as { value?: unknown }).value;
      if (value !== null && (typeof value !== "string" || new TextEncoder().encode(value).length > 4096))
        throw new Error("Invalid result");
      reply({ value });
    } catch {
      // A failed/aborted write may have committed. No retry or claim of rollback.
      reply({ error: request.operation === "record.write" ? "outcome_unknown" : "unavailable" });
    } finally {
      clearTimeout(timer);
      this.pending.delete(controller);
    }
  }
}
