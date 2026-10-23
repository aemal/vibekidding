import { readBoundedText } from "../studio/request-body";

export class VoiceProviderError extends Error {
  constructor(public readonly status?: number, public readonly validation: Array<{ path: string; type: string }> = [], public readonly diagnostic?: { code?: string; message?: string }) {
    super("Voice provider request failed. Check dedicated demo configuration and permissions.");
  }
}

export function voiceSetupDiagnostic(value: unknown, key: string): { code?: string; message?: string } | undefined {
  if (!value || typeof value !== "object") return;
  const root = value as Record<string, unknown>;
  const detail = root.detail && typeof root.detail === "object" && !Array.isArray(root.detail) ? root.detail as Record<string, unknown> : root;
  const sanitize = (input: unknown, limit: number) => {
    if (typeof input !== "string") return undefined;
    return (key ? input.split(key).join("[redacted]") : input)
      .replace(/https?:\/\/[^\s"'<>]+|wss?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
      .replace(/\b(?:sk|key|token)[_-][A-Za-z0-9_-]+\b/gi, "[redacted]")
      .replace(/\b(?:authorization|xi-api-key|api[_ -]?key|conversation_signature)\s*[:=]\s*[^\s,;]+/gi, "[redacted]")
      .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]")
      .replace(/[\r\n\t]+/g, " ").slice(0, limit);
  };
  const code = sanitize(detail.status ?? detail.type ?? root.type, 80);
  const message = sanitize(detail.message ?? root.message ?? (typeof root.detail === "string" ? root.detail : undefined), 400);
  return code || message ? { code, message } : undefined;
}

// Only schema coordinates and error codes are retained, never messages or input values.
export function voiceValidationDiagnostics(value: unknown): Array<{ path: string; type: string }> {
  if (!value || typeof value !== "object") return [];
  const detail = (value as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return [];
  return detail.slice(0, 20).flatMap(item => {
    if (!item || typeof item !== "object" || !Array.isArray(item.loc) || typeof item.type !== "string") return [];
    // Coordinate names must be plausible schema identifiers, excluding arbitrary values/URLs.
    const coordinates = item.loc.slice(0, 16).map((part: unknown) =>
      typeof part === "number" && Number.isSafeInteger(part) && part >= 0 ? String(part) :
        typeof part === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(part) ? part : "[redacted]");
    const type = /^[a-z][a-z0-9_.]{0,79}$/.test(item.type) ? item.type : "validation_error";
    return [{ path: coordinates.join("."), type }];
  });
}

export async function voiceProviderRequest(path: string, apiKey: string, fetcher: typeof fetch = fetch, body?: unknown): Promise<Record<string, unknown>> {
  try {
    const signal = AbortSignal.timeout(12000);
    const response = await fetcher(`https://api.elevenlabs.io${path}`, {
      method: body === undefined ? "GET" : "POST", signal, redirect: "error", cache: "no-store",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let validation: Array<{ path: string; type: string }> = [];
      let diagnostic: { code?: string; message?: string } | undefined;
      try {
        const raw = await readBoundedText({ body: response.body, signal }, 64000, 5000);
        const errorBody = JSON.parse(raw);
        validation = voiceValidationDiagnostics(errorBody);
        diagnostic = voiceSetupDiagnostic(errorBody, apiKey);
      } catch { /* A malformed error body must not hide the HTTP status. */ }
      throw new VoiceProviderError(response.status, validation, diagnostic);
    }
    const value = JSON.parse(await readBoundedText({ body: response.body, signal }, 1000000, 12000));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new VoiceProviderError();
    return value;
  } catch (error) { if (error instanceof VoiceProviderError) throw error; throw new VoiceProviderError(); }
}

export function validateVoiceSignedUrl(value: unknown, agentId: string): value is string {
  if (typeof value !== "string" || value.length > 8000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "wss:" && url.hostname === "api.elevenlabs.io" && !url.port && !url.username && !url.password && !url.hash &&
      url.pathname === "/v1/convai/conversation" && url.searchParams.get("agent_id") === agentId &&
      !!url.searchParams.get("conversation_signature") && !!url.searchParams.get("conversation_id");
  } catch { return false; }
}
