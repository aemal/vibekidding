import { test } from "node:test";
import assert from "node:assert/strict";
import { readStudioBody, RequestBodyError } from "../src/lib/studio/request-body";
function request(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  return new Request("http://localhost/fixture", { method: "POST", body: stream, signal, duplex: "half" } as RequestInit);
}
const status = (code: number) => (e: unknown) => e instanceof RequestBodyError && e.status === code;
test("body accepts a JSON object split across UTF-8 chunks", async () => {
  const bytes = new TextEncoder().encode('{"idea":"🌻"}');
  assert.deepEqual(await readStudioBody(request(new ReadableStream({
    start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); },
  }))), { idea: "🌻" });
});
test("body rejects malformed UTF-8 and non-object JSON", async () => {
  for (const text of ["null", "[]", "42", '"text"', "{"]) {
    await assert.rejects(readStudioBody(new Request("http://localhost", { method: "POST", body: text })), status(400));
  }
  await assert.rejects(readStudioBody(request(new ReadableStream({
    start(c) { c.enqueue(Uint8Array.of(123, 34, 120, 34, 58, 34, 255, 34, 125)); c.close(); },
  }))), status(400));
});
test("oversized body cancels without waiting for a hanging cancellation hook", async () => {
  let cancelled = false;
  await assert.rejects(readStudioBody(request(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array(120001)); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  }))), status(413));
  assert.equal(cancelled, true);
});
test("size limit counts bytes and accepts the exact boundary", async () => {
  const exact = JSON.stringify({ text: "a".repeat(119989) });
  assert.equal(Buffer.byteLength(exact), 120000);
  assert.equal((await readStudioBody(new Request("http://localhost", { method: "POST", body: exact }))).text.length, 119989);
  const multibyte = JSON.stringify({ text: "🌻".repeat(30000) });
  assert.ok(multibyte.length < 120000);
  await assert.rejects(readStudioBody(new Request("http://localhost", { method: "POST", body: multibyte })), status(413));
});
test("stalled body times out and cancels the reader", async () => {
  let cancelled = false;
  await assert.rejects(readStudioBody(request(new ReadableStream({
    cancel() { cancelled = true; },
  })), 20), status(408));
  assert.equal(cancelled, true);
});
test("aborted and broken streams fail with safe errors", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readStudioBody(request(new ReadableStream(), controller.signal)), status(408));
  await assert.rejects(readStudioBody(request(new ReadableStream({
    start(c) { c.error(new Error("sensitive upstream detail")); },
  }))), (e: unknown) => status(400)(e) && !(e as Error).message.includes("sensitive"));
});
