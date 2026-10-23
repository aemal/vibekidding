import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { VoiceOutputGate } from "../src/lib/studio/voice-output-gate";

test("output is copied, held for complete review and released only once", async () => {
  const gate = new VoiceOutputGate("turn_1");
  const audio = Buffer.from([1, 2, 3, 4]);
  assert.equal(gate.append("turn_1", audio), true);
  audio.fill(9);
  let approve!: (safe: boolean) => void;
  let released = false;
  const result = gate.finish("turn_1", "Hello!", async (text, signal) => {
    assert.equal(text, "Hello!"); assert.equal(signal.aborted, false);
    return new Promise<boolean>(resolve => { approve = resolve; });
  }).then(value => { released = true; return value; });
  await delay(1);
  assert.equal(released, false);
  approve(true);
  assert.deepEqual(await result, Buffer.from([1, 2, 3, 4]));
  assert.equal(await gate.finish("turn_1", "Hello!", async () => true), null);
  assert.equal(gate.append("turn_1", audio), false);
});

test("unsafe, uncertain and failed reviewers never release audio", async () => {
  for (const review of [async () => false, async () => undefined as unknown as boolean,
    async () => "true" as unknown as boolean, async () => { throw new Error("private provider error"); }]) {
    const gate = new VoiceOutputGate("turn");
    gate.append("turn", new Uint8Array(2));
    assert.equal(await gate.finish("turn", "Complete text", review), null);
  }
});

test("whole-turn deadline aborts an uncooperative reviewer and rejects late success", async () => {
  const gate = new VoiceOutputGate("turn", 20);
  let approve!: (safe: boolean) => void;
  let captured: AbortSignal | undefined;
  gate.append("turn", new Uint8Array(2));
  const result = gate.finish("turn", "Hello", async (_, signal) => {
    captured = signal;
    return new Promise<boolean>(resolve => { approve = resolve; });
  });
  assert.equal(await result, null);
  assert.equal(captured?.aborted, true);
  approve(true);
  assert.equal(gate.append("turn", new Uint8Array(2)), false);
  const collecting = new VoiceOutputGate("turn", 5);
  collecting.append("turn", new Uint8Array(2));
  await delay(15);
  assert.equal(await collecting.finish("turn", "Hello", async () => true), null);
});

test("revocation and concurrent or late frames invalidate pending review", async () => {
  for (const invalidate of [
    (gate: VoiceOutputGate) => gate.close(),
    (gate: VoiceOutputGate) => gate.append("turn", new Uint8Array(2)),
    (gate: VoiceOutputGate) => gate.finish("turn", "Different text", async () => true),
  ]) {
    const gate = new VoiceOutputGate("turn");
    gate.append("turn", new Uint8Array(2));
    let approve!: (safe: boolean) => void;
    const result = gate.finish("turn", "Hello", async () => new Promise<boolean>(resolve => { approve = resolve; }));
    await delay(1);
    await invalidate(gate);
    assert.equal(await result, null);
    approve(true);
  }
});

test("mismatched turns, invalid PCM and buffer limits close permanently", () => {
  for (const audio of [new Uint8Array(0), new Uint8Array(3), new Uint8Array(32770)]) {
    const gate = new VoiceOutputGate("turn");
    assert.equal(gate.append("turn", audio), false);
    assert.equal(gate.append("turn", new Uint8Array(2)), false);
  }
  const mismatch = new VoiceOutputGate("turn");
  assert.equal(mismatch.append("other", new Uint8Array(2)), false);
  for (const size of [2, 32000]) {
    const gate = new VoiceOutputGate("turn");
    for (let i = 0; i < (size === 2 ? 256 : 8); i++) assert.equal(gate.append("turn", new Uint8Array(size)), true);
    assert.equal(gate.append("turn", new Uint8Array(size)), false);
  }
});

test("missing or invalid complete transcript cannot invoke review", async () => {
  for (const text of ["", "  ", "a".repeat(16001)]) {
    const gate = new VoiceOutputGate("turn");
    gate.append("turn", new Uint8Array(2));
    assert.equal(await gate.finish("turn", text, async () => { assert.fail("must not review"); }), null);
  }
  const mismatch = new VoiceOutputGate("turn");
  mismatch.append("turn", new Uint8Array(2));
  assert.equal(await mismatch.finish("other", "Hello", async () => true), null);
  const empty = new VoiceOutputGate("turn");
  assert.equal(await empty.finish("turn", "Hello", async () => true), null);
  for (const timeout of [0, 15001, NaN, 1.5]) assert.throws(() => new VoiceOutputGate("turn", timeout));
  assert.throws(() => new VoiceOutputGate(""));
});
