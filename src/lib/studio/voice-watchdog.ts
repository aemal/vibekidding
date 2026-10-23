import { VoicePolicy } from "./voice-policy";
type CloseReason = "ended" | "deadline_or_policy" | "authorization_failed";
type Options = {
  authorize: (signal: AbortSignal) => Promise<boolean>;
  closeClient: (reason: CloseReason) => void | Promise<void>;
  closeProvider: (reason: CloseReason) => void | Promise<void>;
  onStopped?: () => void | Promise<void>;
  // Trusted server options only; never supplied by browser messages.
  pollMs?: number;
  authorizationTimeoutMs?: number;
};
export function watchVoiceSession(policy: VoicePolicy, options: Options) {
  const pollMs = options.pollMs ?? 1000;
  const timeoutMs = options.authorizationTimeoutMs ?? 2000;
  if (!Number.isSafeInteger(pollMs) || pollMs < 10 || pollMs > 1000 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 2000)
    throw new Error("Invalid voice watchdog limits");
  let ended = false, active = false, checking = false;
  let request: AbortController | undefined;
  let authorizationTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveReady: (value: boolean) => void = () => {};
  const ready = new Promise<boolean>(resolve => { resolveReady = resolve; });
  const deadlineTimer = setInterval(() => {
    try { policy.checkDeadline(); } catch { stop("deadline_or_policy"); }
  }, Math.min(pollMs, 100));
  const pollTimer = setInterval(() => { void check(); }, pollMs);
  function stop(reason: CloseReason = "ended") {
    if (ended) return;
    ended = true; active = false;
    clearInterval(deadlineTimer); clearInterval(pollTimer); clearTimeout(authorizationTimer);
    request?.abort(); policy.close(); resolveReady(false);
    // Each transport gets a shutdown attempt, even if its peer's callback throws.
    try { void Promise.resolve(options.closeClient(reason)).catch(() => {}); } catch { /* Still stop provider. */ }
    try { void Promise.resolve(options.closeProvider(reason)).catch(() => {}); } catch { /* Already inactive. */ }
    try { void Promise.resolve(options.onStopped?.()).catch(() => {}); } catch { /* Cleanup cannot reopen the session. */ }
  }
  async function check() {
    if (ended || checking) return;
    checking = true;
    request = new AbortController();
    authorizationTimer = setTimeout(() => stop("authorization_failed"), timeoutMs);
    try {
      const allowed = await options.authorize(request.signal);
      if (ended) return;
      if (allowed !== true) { stop("authorization_failed"); return; }
      policy.checkDeadline();
      active = true;
      resolveReady(true);
    } catch { stop("authorization_failed"); }
    finally { clearTimeout(authorizationTimer); checking = false; }
  }
  void check();
  return {
    ready, stop,
    isActive() {
      if (!active || ended) return false;
      try { policy.checkDeadline(); return true; }
      catch { stop("deadline_or_policy"); return false; }
    },
  };
}
