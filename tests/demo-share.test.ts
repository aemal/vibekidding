import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { encodeShareFragment, decodeShareFragment, createShareUrl, DemoShareError, MAX_SHARE_PAYLOAD_BYTES, MAX_SHARE_URL_CHARACTERS, type ShareErrorCode } from "../src/lib/demo-share";
import { templateProject } from "../src/lib/demo-server/template";

const rejects = (code: ShareErrorCode) => (error: unknown) => error instanceof DemoShareError && error.code === code;
const packed = (text: string | Uint8Array) => "#v1=" + gzipSync(text).toString("base64url");
const project = { title: "My 🌻 garden", html: "<!DOCTYPE html><html><body><button>مرحبا 🌻</button></body></html>" };

test("Unicode title and executable HTML round-trip as inert text, without metadata", async () => {
  const source = { ...project, prompts: ["private idea"], history: [{ html: "old" }], id: "private-id", provider: "private-provider", timestamp: 123 };
  const fragment = await encodeShareFragment(source);
  const wire = JSON.parse(gunzipSync(Buffer.from(fragment.slice(4), "base64url")).toString());
  assert.deepEqual(wire, { v: 1, ...project });
  assert.deepEqual(await decodeShareFragment(fragment), project);
  assert.equal(Object.isFrozen(await decodeShareFragment(fragment)), true);
  assert.doesNotMatch(JSON.stringify(wire), /private idea|private-id|private-provider|timestamp|history/);
});

test("all six actual templates fit complete share URLs and preserve exact HTML", async () => {
  for (const prompt of ["space collector", "ocean memory", "garden drawing", "space arithmetic quiz", "ocean story", "garden tic-tac-toe"]) {
    const generated = templateProject(prompt);
    const build = { title: generated.title, html: generated.html };
    const url = await createShareUrl("https://vibekidding.example", build);
    assert.ok(url.length <= MAX_SHARE_URL_CHARACTERS, `${prompt} URL ${url.length}`);
    assert.deepEqual(await decodeShareFragment(new URL(url).hash), build);
  }
});

test("origins allow HTTP(S) only, without credentials, paths or query strings", async () => {
  assert.match(await createShareUrl("http://localhost:3217", project), /^http:\/\/localhost:3217\/demo\/play#v1=/);
  assert.match(await createShareUrl("https://example.com/", project), /^https:\/\/example.com\/demo\/play#v1=/);
  for (const origin of ["javascript:alert(1)", "data:text/html,x", "file:///tmp/a", "https://user:pass@example.com", "https://example.com/private", "https://example.com/?q=secret", "https://example.com/#secret", "not an origin"])
    await assert.rejects(createShareUrl(origin, project), rejects("invalid-link"));
});

test("invalid alphabets, empty links, version prefixes and gzip fail safely", async () => {
  for (const fragment of ["", "#v1=", "#v1=%%%", "#v1=A", "#v1=Zg==", "v1=abcd", "#v1=Z h", "#v1=Zh"])
    await assert.rejects(decodeShareFragment(fragment), rejects("invalid-link"));
  await assert.rejects(decodeShareFragment("#v2=AAAA"), rejects("unsupported-version"));
  await assert.rejects(decodeShareFragment("#v1=" + Buffer.from("not gzip").toString("base64url")), rejects("invalid-payload"));
  const valid = await encodeShareFragment(project);
  await assert.rejects(decodeShareFragment(valid.slice(0, -4)), rejects("invalid-payload"));
});

test("decoder rejects malformed UTF8, invalid JSON and nonexact v1 schema", async () => {
  for (const value of ["null", "[]", "{", JSON.stringify({ v: 1, title: "a", html: " " }), JSON.stringify({ v: 1, title: " ", html: "a" }), JSON.stringify({ v: 1, title: "a", html: "x", history: [] })])
    await assert.rejects(decodeShareFragment(packed(value)), rejects("invalid-payload"));
  await assert.rejects(decodeShareFragment(packed(Uint8Array.of(255, 254))), rejects("invalid-payload"));
  await assert.rejects(decodeShareFragment(packed(JSON.stringify({ v: 2, ...project }))), rejects("unsupported-version"));
  await assert.rejects(decodeShareFragment(packed(JSON.stringify({ v: 1, title: "a".repeat(71), html: "x" }))), rejects("too-large"));
});

test("UTF8 payload bound accepts exact boundary and rejects encoder and decompression overflow", async () => {
  const overhead = new TextEncoder().encode(JSON.stringify({ v: 1, title: "a", html: "" })).length;
  const exact = { title: "a", html: "x".repeat(MAX_SHARE_PAYLOAD_BYTES - overhead) };
  assert.deepEqual(await decodeShareFragment(await encodeShareFragment(exact)), exact);
  await assert.rejects(encodeShareFragment({ ...exact, html: exact.html + "x" }), rejects("too-large"));
  await assert.rejects(encodeShareFragment({ title: "a", html: "🌻".repeat(21000) }), rejects("too-large"));
  const bomb = packed(JSON.stringify({ v: 1, title: "a", html: "x".repeat(MAX_SHARE_PAYLOAD_BYTES * 16) }));
  assert.ok(bomb.length < 8000);
  await assert.rejects(decodeShareFragment(bomb), rejects("too-large"));
});

test("compressed URL and complete origin-plus-path sizes are bounded", async () => {
  await assert.rejects(decodeShareFragment("#v1=" + "A".repeat(8000)), rejects("too-large"));
  await assert.rejects(encodeShareFragment({ title: "random", html: randomBytes(10000).toString("base64") }), rejects("too-large"));
  const fragment = await encodeShareFragment(project);
  const longOrigin = "https://" + "a".repeat(MAX_SHARE_URL_CHARACTERS - fragment.length);
  await assert.rejects(createShareUrl(longOrigin, project), rejects("too-large"));
});

test("missing compression features report unsupported without package fallback", async () => {
  const zip = globalThis.CompressionStream, unzip = globalThis.DecompressionStream;
  const fragment = await encodeShareFragment(project);
  try {
    Object.defineProperty(globalThis, "CompressionStream", { configurable: true, value: undefined });
    await assert.rejects(encodeShareFragment(project), rejects("unsupported"));
    Object.defineProperty(globalThis, "DecompressionStream", { configurable: true, value: undefined });
    await assert.rejects(decodeShareFragment(fragment), rejects("unsupported"));
  } finally {
    Object.defineProperty(globalThis, "CompressionStream", { configurable: true, value: zip });
    Object.defineProperty(globalThis, "DecompressionStream", { configurable: true, value: unzip });
  }
});

test("errors never echo source HTML or private payload values", async () => {
  const secret = "private-content-marker";
  try { await decodeShareFragment(packed(JSON.stringify({ v: 1, title: "ok", html: secret, extra: secret }))); assert.fail("expected failure"); }
  catch (error) { assert.ok(error instanceof DemoShareError); assert.ok(!error.message.includes(secret)); }
});

test("overflow cancels decompression without waiting for a hanging cancellation hook", async () => {
  const original = globalThis.DecompressionStream;
  let cancelled = false;
  class OverflowStream {
    readable = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_SHARE_PAYLOAD_BYTES + 1)); },
      cancel() { cancelled = true; return new Promise<void>(() => {}); },
    });
    writable = new WritableStream();
  }
  try {
    Object.defineProperty(globalThis, "DecompressionStream", { configurable: true, value: OverflowStream });
    await assert.rejects(decodeShareFragment(packed(JSON.stringify({ v: 1, ...project }))), rejects("too-large"));
    assert.equal(cancelled, true);
  } finally { Object.defineProperty(globalThis, "DecompressionStream", { configurable: true, value: original }); }
});
