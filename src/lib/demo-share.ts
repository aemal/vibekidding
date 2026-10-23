import { compactTokenForBuildV1, renderCompactTemplateV1 } from "./demo-server/template-v1";

/** Portable snapshots only. No storage, network, provider, or DOM dependencies. */
export type SharedBuild = Readonly<{ title: string; html: string }>;
export type ShareErrorCode = "unsupported" | "too-large" | "invalid-link" | "invalid-payload" | "unsupported-version";
export const MAX_SHARE_URL_CHARACTERS = 8000;
export const MAX_SHARE_PAYLOAD_BYTES = 80 * 1024;
export const MAX_SHARE_TITLE_CHARACTERS = 70;

const messages: Record<ShareErrorCode, string> = {
  unsupported: "This browser cannot create or open compressed play links. Try a current browser or export the HTML instead.",
  "too-large": "This project or link is too large to share this way. Try a smaller project or export the HTML instead.",
  "invalid-link": "This play link is incomplete or invalid. Ask for a new link.",
  "invalid-payload": "This play link does not contain a valid project. Ask for a new link.",
  "unsupported-version": "This play-link version is not supported. Ask for a supported play link.",
};
export class DemoShareError extends Error {
  constructor(public readonly code: ShareErrorCode) { super(messages[code]); this.name = "DemoShareError"; }
}
const fail = (code: ShareErrorCode): never => { throw new DemoShareError(code); };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function checkedBuild(value: unknown): SharedBuild {
  if (!record(value) || typeof value.title !== "string" || !value.title.trim() || typeof value.html !== "string" || !value.html.trim()) return fail("invalid-payload");
  if (value.title.length > MAX_SHARE_TITLE_CHARACTERS) return fail("too-large");
  if (value.html.length > MAX_SHARE_PAYLOAD_BYTES) return fail("too-large");
  return { title: value.title, html: value.html };
}

async function boundedBytes(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return fail("too-large");
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } catch (error) {
    // Never await an untrusted cancellation hook before reporting the size limit.
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

function compressor() {
  if (typeof CompressionStream === "undefined" || typeof btoa === "undefined") return fail("unsupported");
  try { return new CompressionStream("gzip"); } catch { return fail("unsupported"); }
}
function decompressor() {
  if (typeof DecompressionStream === "undefined" || typeof atob === "undefined" || typeof btoa === "undefined") return fail("unsupported");
  try { return new DecompressionStream("gzip"); } catch { return fail("unsupported"); }
}
function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function encodeShareFragment(build: SharedBuild): Promise<string> {
  try {
    const clean = checkedBuild(build);
    // Strip all metadata supplied by callers; export only the current title and HTML.
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, title: clean.title, html: clean.html }));
    if (bytes.byteLength > MAX_SHARE_PAYLOAD_BYTES) return fail("too-large");
    const stream = new Blob([bytes]).stream().pipeThrough(compressor());
    const compressed = await boundedBytes(stream, Math.floor((MAX_SHARE_URL_CHARACTERS - 4) * 3 / 4));
    const fragment = "#v1=" + base64url(compressed);
    if (fragment.length > MAX_SHARE_URL_CHARACTERS) return fail("too-large");
    return fragment;
  } catch (error) { if (error instanceof DemoShareError) throw error; return fail("invalid-payload"); }
}

export async function decodeShareFragment(fragment: string): Promise<SharedBuild> {
  if (typeof fragment !== "string") return fail("invalid-link");
  if (fragment.length > MAX_SHARE_URL_CHARACTERS) return fail("too-large");
  if (fragment.startsWith("#t1=")) {
    if (fragment.length > 110) return fail("too-large");
    const encoded = fragment.slice(4);
    const separator = encoded.indexOf(".");
    if (separator < 0) return fail("invalid-link");
    if (encoded.slice(0, separator) !== "1") return fail("unsupported-version");
    const generated = renderCompactTemplateV1(encoded.slice(separator + 1));
    if (!generated) return fail("invalid-payload");
    return Object.freeze({ title: generated.title, html: generated.html });
  }
  if (!fragment.startsWith("#v1=")) return fail(/^#[vt]\d+=/.test(fragment) ? "unsupported-version" : "invalid-link");
  const encoded = fragment.slice(4);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return fail("invalid-link");
  const unzip = decompressor();
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    // Reject noncanonical encodings with unused trailing bits or padding variants.
    if (base64url(bytes) !== encoded) return fail("invalid-link");
  } catch { return fail("invalid-link"); }
  let text: string;
  try {
    const decoded = await boundedBytes(new Blob([bytes]).stream().pipeThrough(unzip), MAX_SHARE_PAYLOAD_BYTES);
    text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch (error) { if (error instanceof DemoShareError) throw error; return fail("invalid-payload"); }
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail("invalid-payload"); }
  if (!record(value)) return fail("invalid-payload");
  if (value.v !== 1) return fail("unsupported-version");
  if (Object.keys(value).sort().join(",") !== "html,title,v") return fail("invalid-payload");
  return Object.freeze(checkedBuild(value));
}

export async function createShareUrl(origin: string, build: SharedBuild): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return fail("invalid-link"); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || parsed.origin === "null") return fail("invalid-link");
  const clean = checkedBuild(build);
  const token = compactTokenForBuildV1(clean);
  const fragment = token ? "#t1=1." + token : await encodeShareFragment(clean);
  const url = parsed.origin + "/demo/play" + fragment;
  if (url.length > MAX_SHARE_URL_CHARACTERS) return fail("too-large");
  return url;
}
