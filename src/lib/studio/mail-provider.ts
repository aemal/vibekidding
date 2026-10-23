import { readBoundedText } from "./request-body";
export type MailPayload = { from: string; to: string[]; subject: string; text: string };
type Result = { providerId: string | null; error: string | null };

// One bounded attempt. Only the durable queue retries, using the same key/payload.
export async function submitMail(payload: MailPayload, id: string, key: string, transport: typeof fetch = fetch, timeoutMs = 10000): Promise<Result> {
  let acceptedHeaders = false;
  const unknown = (): Result => ({ providerId: null, error: acceptedHeaders ? "ambiguous_response" : "network_or_timeout" });
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) return unknown();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<Result>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(unknown()); }, timeoutMs);
  });
  const attempt = async (): Promise<Result> => {
    let response: Response;
    try {
      response = await transport("https://api.resend.com/emails", {
        method: "POST", headers: {
          Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": id,
        }, body: JSON.stringify(payload), signal: controller.signal,
      });
    } catch { return unknown(); }
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => {});
      return unknown();
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return { providerId: null, error: `provider_http_${response.status}` };
    }
    acceptedHeaders = true;
    try {
      const raw = await readBoundedText({ body: response.body, signal: controller.signal }, 65536, timeoutMs);
      const result = JSON.parse(raw);
      if (!controller.signal.aborted && result && typeof result.id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(result.id))
        return { providerId: result.id, error: null };
    } catch {
      // Even without a usable ID, the message may have been sent/billed.
    }
    return unknown();
  };
  try { return await Promise.race([attempt(), stopped]); }
  finally { clearTimeout(timer); controller.abort(); }
}
