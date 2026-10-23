import type { SupabaseClient } from "@supabase/supabase-js";
import { VoicePolicy } from "./voice-policy";
import { watchVoiceSession } from "./voice-watchdog";

// Trusted server context only: IDs must come from authenticated identity and a
// successful single-use claim. This adapter neither admits nor opens a socket.
export function watchDatabaseVoiceSession(
  db: SupabaseClient,
  binding: { userId: string; usageId: string; durationMs: number },
  transports: Pick<Parameters<typeof watchVoiceSession>[1], "closeClient" | "closeProvider">,
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(binding.userId) || !uuid.test(binding.usageId)) throw new Error("Invalid voice binding");
  // Copy immutable scalar identities before any asynchronous work.
  const args = { p_user: binding.userId, p_id: binding.usageId };
  const policy = new VoicePolicy(binding.durationMs);
  let resolveEnd: (saved: boolean) => void = () => {};
  const endRecorded = new Promise<boolean>(resolve => { resolveEnd = resolve; });
  const watcher = watchVoiceSession(policy, {
    ...transports,
    authorize: async signal => {
      const result = await db.rpc("studio_voice_authorized", args).abortSignal(signal);
      return !signal.aborted && !result.error && result.data === true;
    },
    onStopped: () => {
      // Independent from transport cleanup; never delay shutdown for persistence.
      // Bound the outcome even if a faulty transport ignores AbortSignal.
      const controller = new AbortController();
      let complete = false;
      const finish = (saved: boolean) => {
        if (complete) return;
        complete = true; clearTimeout(timer); resolveEnd(saved);
      };
      const timer = setTimeout(() => { finish(false); controller.abort(); }, 2000);
      void (async () => {
        try {
          const result = await db.rpc("studio_voice_end", args).abortSignal(controller.signal);
          finish(!controller.signal.aborted && !result.error);
        } catch { finish(false); }
      })();
    },
  });
  return { ...watcher, policy, endRecorded };
}
