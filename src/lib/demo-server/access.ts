export type DemoEnvironment = Record<string, string | undefined>;

const promptCharacters = 2000;
const htmlBytes = 80000;
// A JSON string can encode each UTF-16 unit as six ASCII bytes (\\uXXXX).
// HTML's UTF-8 byte bound also bounds its UTF-16 unit count. Keep a finite
// framing/whitespace allowance; decoded field limits still apply before billing.
const bodyBytes = 6 * (htmlBytes + promptCharacters) + 1024;
export const DEMO_LIMITS = {
  promptCharacters,
  htmlBytes,
  bodyBytes,
  outputTokens: 6000,
  requestsPerMinute: 10,
  providerCallsPerProcess: 20,
} as const;

export function demoEnabled(env: DemoEnvironment) {
  return publicTemplateDemo(env) || (env.VIBEKIDDING_DEMO_ENABLED === "1" && env.NODE_ENV !== "production");
}

export function publicTemplateDemo(env: DemoEnvironment) {
  return env.VIBEKIDDING_PUBLIC_TEMPLATE_DEMO === "1";
}

// Local AI mode MUST bind to 127.0.0.1: Web Requests have no peer socket address.
// Explicit public template mode permits hosting proxies, but retains browser-origin checks.
export function demoAccessError(request: Request, env: DemoEnvironment): string | undefined {
  if (!demoEnabled(env)) return "Demo is disabled.";
  const isPublic = publicTemplateDemo(env);
  const url = new URL(request.url);
  if (!["http:", "https:"].includes(url.protocol) || (!isPublic && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    return "Local demo requires a loopback address.";
  const host = request.headers.get("host");
  let browserUrl: URL;
  try { browserUrl = new URL(`${url.protocol}//${host}`); } catch { return "Demo host mismatch."; }
  if (!host || browserUrl.host !== host.toLowerCase() || (!isPublic && !["localhost", "127.0.0.1", "[::1]"].includes(browserUrl.hostname)))
    return "Demo host mismatch.";
  // Next itself inserts x-forwarded-* from the socket. Accept only its exact local
  // values; proxy chains and remote peers fail closed. The loopback bind is still required.
  const expected: Record<string, string[]> = {
    "x-forwarded-for": ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
    "x-forwarded-host": [host],
    "x-forwarded-proto": [url.protocol.slice(0, -1)],
    "x-forwarded-port": [browserUrl.port || (url.protocol === "https:" ? "443" : "80")],
  };
  for (const [name, value] of request.headers)
    if (!isPublic && (name === "forwarded" || name === "x-real-ip" ||
      (name.startsWith("x-forwarded-") && !expected[name]?.includes(value))))
      return "Nonlocal or forwarded demo requests are disabled.";
  const origin = request.headers.get("origin");
  if (origin && origin !== browserUrl.origin) return "Demo requires the same origin.";
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "Cross-site demo requests are disabled.";
}

export class DemoUsage {
  private recent: number[] = [];
  private active = false;
  private providerCalls = 0;
  admit(now = Date.now()) {
    this.recent = this.recent.filter(time => now - time < 60000);
    if (this.active || this.recent.length >= DEMO_LIMITS.requestsPerMinute) return false;
    this.recent.push(now);
    this.active = true;
    return true;
  }
  finish() { this.active = false; }
  reserveProviderCall() {
    if (this.providerCalls >= DEMO_LIMITS.providerCallsPerProcess) return false;
    this.providerCalls++;
    return true;
  }
  remainingProviderCalls() { return DEMO_LIMITS.providerCallsPerProcess - this.providerCalls; }
}
