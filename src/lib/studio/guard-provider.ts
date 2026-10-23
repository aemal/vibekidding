import { guardRequest, parseGuard, type GuardDecision } from "./guard-policy";
import { readBoundedText } from "./request-body";
type Evaluation = { result: GuardDecision; requestId: string | null };
// Server/evaluation CLI only. One bounded attempt; uncertain charges stay reserved.
export async function checkGuardProvider(
  request: ReturnType<typeof guardRequest>, key: string,
  transport: typeof fetch = fetch, timeoutMs = 15000,
): Promise<Evaluation> {
  let requestId: string | null = null;
  const unavailable = (): Evaluation => ({ result: { decision: "unavailable", categories: ["provider_unavailable"] }, requestId });
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) return unavailable();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<Evaluation>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(unavailable()); }, timeoutMs);
  });
  const attempt = async (): Promise<Evaluation> => {
    try {
      const response = await transport("https://api.typesafe.ai/v1/systemone", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(request), signal: controller.signal, cache: "no-store",
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        return unavailable();
      }
      const candidate = response.headers.get("x-request-id");
      if (candidate && /^[a-zA-Z0-9_.:-]{1,200}$/.test(candidate)) requestId = candidate;
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { result: { decision: "unavailable", categories: ["provider_error"] }, requestId };
      }
      const raw = await readBoundedText({ body: response.body, signal: controller.signal }, 65536, timeoutMs);
      if (controller.signal.aborted) return unavailable();
      return { result: parseGuard(JSON.parse(raw)), requestId };
    } catch { return unavailable(); }
  };
  try { return await Promise.race([attempt(), stopped]); }
  finally { clearTimeout(timer); controller.abort(); }
}
