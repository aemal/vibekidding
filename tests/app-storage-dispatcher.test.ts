import { test } from "node:test";
import assert from "node:assert/strict";
import { AppStorageDispatcher } from "../src/lib/studio/app-storage-dispatcher";
const projectId = "11111111-1111-4111-8111-111111111111";
const requestId = (n = 1) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
function fixture(call: ConstructorParameters<typeof AppStorageDispatcher>[0]["call"], durationMs = 1000) {
  const replies: Array<{ data: Record<string, unknown>; origin: string }> = [];
  const source = { postMessage: (data: string, origin: string) => { replies.push({ data: JSON.parse(data), origin }); } };
  const dispatcher = new AppStorageDispatcher({ applicationOrigin: "https://studio.example", executionOrigin: "https://run.example",
    source, session: "synthetic_session_123", projectId, durationMs, call });
  const event = (extra: object = {}) => ({ source, origin: "https://run.example", data: JSON.stringify({ version: 1,
    session: "synthetic_session_123", requestId: requestId(), operation: "record.read", key: "score", ...extra }) });
  return { dispatcher, replies, event };
}
test("dispatch binds project and filters server responses, rejecting injected authority and AI", async () => {
  const calls: unknown[] = [];
  const f = fixture(async input => { calls.push(input); return { value: "7", token: "never-forward" }; });
  try {
    for (const extra of [{ projectId }, { userId: "other" }, { operation: "ai.generate", prompt: "hi" }, { requestId: "not_a_uuid_but_long" }])
      await f.dispatcher.handle(f.event(extra));
    await f.dispatcher.handle({ ...f.event(), origin: "null" });
    await f.dispatcher.handle({ ...f.event(), source: {} });
    assert.equal(calls.length, 0);
    await f.dispatcher.handle(f.event()); await f.dispatcher.handle(f.event());
    assert.deepEqual(calls, [{ projectId, requestId: requestId(), operation: "read", key: "score" }]);
    assert.deepEqual(f.replies, [{ origin: "https://run.example", data: { version: 1, session: "synthetic_session_123", requestId: requestId(), value: "7" } }]);
  } finally { f.dispatcher.close(); }
});
test("close aborts operations and suppresses late results", async () => {
  let finish!: (value: unknown) => void; let signal!: AbortSignal;
  const f = fixture(async (_, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); });
  const running = f.dispatcher.handle(f.event()); await Promise.resolve();
  f.dispatcher.close(); assert.equal(signal.aborted, true);
  await running; finish({ value: "private" }); await Promise.resolve();
  await f.dispatcher.handle(f.event({ requestId: requestId(2) }));
  assert.deepEqual(f.replies, []);
});
test("session expiration stops even a transport ignoring abort", async () => {
  const f = fixture(async () => new Promise(() => {}), 20);
  await f.dispatcher.handle(f.event());
  assert.deepEqual(f.replies, []);
});
test("concurrency is bounded and failures never expose provider errors", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return new Promise(() => {}); });
  const requests = Array.from({ length: 5 }, (_, n) => f.dispatcher.handle(f.event({ requestId: requestId(n + 1) })));
  await Promise.resolve(); assert.equal(calls, 4);
  assert.equal(f.replies[0].data.error, "busy"); f.dispatcher.close(); await Promise.all(requests);
  const failed = fixture(async () => { throw new Error("secret bearer token"); });
  try {
    await failed.dispatcher.handle(failed.event({ operation: "record.write", value: "7" }));
    assert.equal(failed.replies[0].data.error, "outcome_unknown");
    assert.equal(JSON.stringify(failed.replies).includes("secret"), false);
  } finally { failed.dispatcher.close(); }
});
test("oversized and malformed values are rejected", async () => {
  for (const value of [undefined, 5, { nested: true }, "🌻".repeat(1025)]) {
    const f = fixture(async () => ({ value }));
    try { await f.dispatcher.handle(f.event()); assert.equal(f.replies[0].data.error, "unavailable"); }
    finally { f.dispatcher.close(); }
  }
});
