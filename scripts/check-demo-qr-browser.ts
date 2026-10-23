/**
 * QR acceptance against an existing loopback app. No server/build/provider calls.
 * DEMO_BASE_URL=http://127.0.0.1:3217 npx tsx scripts/check-demo-qr-browser.ts
 * Independently decodes rendered PNG pixels with jsqr; physical scanning unverified.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, expect as baseExpect, type BrowserContext, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { decodeShareFragment } from "../src/lib/demo-share";
import { templateProject } from "../src/lib/demo-server/template";
import type { Project } from "../src/components/demo/project-backup";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as { PNG: { sync: { read(buffer: Buffer): { data: Buffer; width: number; height: number } } } };
const expect = baseExpect.configure({ timeout: 15_000 });
const base = new URL(process.env.DEMO_BASE_URL || "http://127.0.0.1:3217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Loopback only");
const output = path.resolve(process.env.DEMO_TEST_OUTPUT || `tests/demo-browser-artifacts/qr-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const key = "vibekidding-demo-projects-v1";
const canonical = templateProject("garden tic-tac-toe");
const customHtml = '<!doctype html><html><body><h1>Custom snapshot</h1><button id="counter" disabled>Count: 0</button><script>let n=0;const b=document.getElementById("counter");b.onclick=()=>{b.textContent="Count: "+(++n)};b.disabled=false;</script></body></html>';
const projects: Project[] = [
  { id: "canonical-qr-fixture", title: canonical.title, emoji: "✦", updatedAt: 100, versions: [{ id: "canonical-version", html: canonical.html, prompt: "PRIVATE_CANONICAL_PROMPT", createdAt: 100, mode: "template" }] },
  { id: "custom-qr-fixture", title: "Custom snapshot", emoji: "✦", updatedAt: 101, versions: [{ id: "custom-version", html: customHtml, prompt: "PRIVATE_CUSTOM_PROMPT", createdAt: 101, mode: "ai" }] },
];
const steps: { name: string; status: string; error?: string }[] = [];
const violations: string[] = [];
const errors: string[] = [];
const decodedImages: { name: string; exactUrl: boolean; width: number; height: number; urlCharacters: number }[] = [];
const artifacts = new Map<string, Buffer | string>();
let activeStep = "startup";

// A CI failure delivered the click to the parent IFRAME while auto-scrolling it
// from offscreen; settle parent visibility before dispatching a child gesture.
async function readyParentFrame(page: Page) {
  const iframe = page.locator('iframe');
  await iframe.scrollIntoViewIfNeeded();
  await expect(iframe).toBeInViewport({ ratio: 0.5 });
  const child = await (await iframe.elementHandle())?.contentFrame();
  assert.ok(child);
  await child.waitForLoadState('load');
}

const pointerDiagnostics: unknown[] = [];
async function observePointerFrame(page: Page) {
  const frame = await (await page.locator('iframe').elementHandle())?.contentFrame();
  assert.ok(frame);
  await frame.waitForLoadState('load');
  const lifecycle: unknown[] = [];
  page.on('framenavigated', changed => { if (changed === frame && lifecycle.length < 20) lifecycle.push({ event: 'navigated', at: Date.now() }); });
  page.on('framedetached', changed => { if (changed === frame && lifecycle.length < 20) lifecycle.push({ event: 'detached', at: Date.now() }); });
  await page.evaluate(() => {
    const events: unknown[] = [];
    (window as unknown as { __parentPointer: unknown[] }).__parentPointer = events;
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      if (events.length >= 20) return;
      const e = event as MouseEvent;
      const target = event.target as HTMLElement;
      events.push({ type, tag: target.tagName, id: target.id, x: e.clientX, y: e.clientY });
    }, true);
  });
  await frame.evaluate(() => {
    const state = { epoch: performance.timeOrigin, events: [] as unknown[] };
    (window as unknown as { __pointerEvidence: typeof state }).__pointerEvidence = state;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown']) {
      document.addEventListener(type, event => {
        if (state.events.length >= 40) return;
        const target = event.target as HTMLElement;
        const pointer = event as MouseEvent;
        state.events.push({ type, id: target.id, label: target.getAttribute('aria-label'), text: target.textContent?.slice(0, 70), x: pointer.clientX, y: pointer.clientY, at: performance.now() });
      }, true);
    }
  });
  return async (label: string) => {
    pointerDiagnostics.push({ label, lifecycle: [...lifecycle], frameDetached: frame.isDetached(), parent: await page.evaluate(() => ({ x: scrollX, y: scrollY, active: document.activeElement?.tagName, events: (window as unknown as { __parentPointer: unknown[] }).__parentPointer })), box: await page.locator('iframe').boundingBox(), child: await frame.evaluate(() => ({ evidence: (window as unknown as { __pointerEvidence: unknown }).__pointerEvidence, ready: document.readyState, x: scrollX, y: scrollY, active: document.activeElement?.outerHTML.slice(0, 200), status: document.querySelector('#status')?.textContent, cells: Array.from(document.querySelectorAll('#tic-board button')).map(b => b.textContent) })).catch(error => ({ error: String(error) })) });
  };
}


async function step(name: string, action: () => Promise<void>) {
  activeStep = name;
  try { await action(); steps.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
  catch (error) { steps.push({ name, status: "failed", error: String(error) }); throw error; }
}
async function guard(context: BrowserContext, reader: boolean) {
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (["data:", "about:"].includes(url.protocol)) return route.continue();
    if (url.origin !== base.origin || url.pathname.startsWith("/api/") && (reader || request.method() !== "GET")) {
      violations.push(`${reader ? "reader" : "source"}: ${request.method()} ${url.origin}${url.pathname}`); return route.abort();
    }
    return route.continue();
  });
  context.on("page", page => { page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message)); });
}
async function saved(page: Page) { return page.evaluate(storageKey => localStorage.getItem(storageKey), key); }
async function share(page: Page, title: string) {
  await page.locator(".demo-project-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).click();
  await page.getByRole("button", { name: "Share playable link", exact: true }).click();
  await page.getByRole("button", { name: "Create playable link", exact: true }).click();
  const field = page.getByRole("textbox", { name: "Playable link", exact: true });
  await expect(field).toHaveValue(/\/demo\/play#/);
  return field.inputValue();
}
async function decodeImage(page: Page, name: string, expected: string) {
  const qr = page.getByRole("img", { name: "QR code for this playable link", exact: true });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png/);
  const version = Number(await qr.getAttribute("data-qr-version"));
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 8);
  const bytes = await qr.screenshot();
  const png = PNG.sync.read(bytes);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(decoded, "Independent decoder must recognize rendered QR pixels");
  assert.equal(decoded.data, expected, "QR must preserve the exact origin/path/fragment");
  artifacts.set(`${name}.png`, bytes);
  decodedImages.push({ name, exactUrl: true, width: png.width, height: png.height, urlCharacters: decoded.data.length });
}
async function consent(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play shared project", exact: true })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
}
async function main() {
  const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || "chromium", headless: true });
  const source = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await guard(source, false); await guard(recipient, true);
  await source.addInitScript(({ origin, storageKey, value }) => {
    if (window.top === window && location.origin === origin && !sessionStorage.getItem("qr-fixture-seeded")) {
      localStorage.setItem(storageKey, value); sessionStorage.setItem("qr-fixture-seeded", "yes");
    }
  }, { origin: base.origin, storageKey: key, value: JSON.stringify(projects) });
  const sourcePage = await source.newPage(); const page = await recipient.newPage();
  let failure: unknown; let compactUrl = "";
  let expectedShelf = JSON.stringify(projects);
  try {
    await step("canonical snapshot uses compact link without altering source shelf", async () => {
      await sourcePage.goto(new URL("/demo", base).href);
      compactUrl = await share(sourcePage, canonical.title);
      assert.equal(new URL(compactUrl).origin, base.origin);
      assert.match(new URL(compactUrl).hash, /^#t1=/);
      assert.deepEqual(await decodeShareFragment(new URL(compactUrl).hash), { title: canonical.title, html: canonical.html });
      assert.equal(await saved(sourcePage), JSON.stringify(projects));
    });
    await step("explicit QR display independently decodes exact compact URL", async () => {
      await expect(sourcePage.getByRole("img", { name: "QR code for this playable link", exact: true })).toHaveCount(0);
      await sourcePage.getByRole("button", { name: "Show QR code", exact: true }).click();
      await decodeImage(sourcePage, "01-qr-desktop", compactUrl);
      artifacts.set("02-share-dialog.png", await sourcePage.screenshot({ fullPage: true }));
    });
    await step("mobile QR remains visible and independently readable", async () => {
      await sourcePage.setViewportSize({ width: 390, height: 844 });
      await decodeImage(sourcePage, "03-qr-mobile", compactUrl);
      const box = await sourcePage.getByRole("img", { name: "QR code for this playable link", exact: true }).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
      artifacts.set("04-mobile-dialog.png", await sourcePage.screenshot());
    });
    await step("decoded recipient link requires consent then plays canonical game", async () => {
      await page.goto(compactUrl); await consent(page, canonical.title); assert.equal(await saved(page), null);
      await page.getByRole("button", { name: "Play shared project", exact: true }).click();
      await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
      const frame = page.frameLocator("iframe");
      await expect(page.locator("#playing-project-title")).toBeFocused();
      const record = await observePointerFrame(page);
      await record("before recipient tic pointer");
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Row 1, column 1: empty", exact: true }).click();
      await record("after recipient tic pointer");
      await expect(frame.getByRole("button", { name: "Row 1, column 1: X", exact: true })).toBeVisible();
      assert.equal(await saved(page), null);
      artifacts.set("05-mobile-recipient.png", await page.screenshot());
    });
    await step("custom snapshot keeps full v1 HTML and fallback link usable", async () => {
      await sourcePage.getByRole("button", { name: "Close sharing", exact: true }).click();
      await sourcePage.setViewportSize({ width: 1280, height: 900 });
      const url = await share(sourcePage, "Custom snapshot");
      assert.match(new URL(url).hash, /^#v1=/);
      assert.deepEqual(await decodeShareFragment(new URL(url).hash), { title: "Custom snapshot", html: customHtml });
      await expect(sourcePage.getByRole("img", { name: "QR code for this playable link", exact: true })).toHaveCount(0);
      const fallback = sourcePage.getByRole("region", { name: "QR sharing", exact: true });
      await expect(fallback).toContainText("QR codes are available for compact template links");
      await expect(fallback.getByRole("button", { name: "Show QR code", exact: true })).toHaveCount(0);
      await expect(fallback.getByRole("button", { name: "Export HTML instead", exact: true })).toBeEnabled();
      await page.goto(url); await consent(page, "Custom snapshot");
      await page.getByRole("button", { name: "Play shared project", exact: true }).click();
      const counter = page.frameLocator("iframe").getByRole("button", { name: "Count: 0", exact: true });
      await readyParentFrame(page);
      await counter.click();
      await expect(page.frameLocator("iframe").getByRole("button", { name: "Count: 1", exact: true })).toBeVisible();
    });
    await step("preexisting v1 links still decode and reach confirmation", async () => {
      const old = new URL("/demo/play", base).href + "#v1=" + gzipSync(JSON.stringify({ v: 1, title: "Legacy v1 snapshot", html: customHtml })).toString("base64url");
      await page.goto(old); await consent(page, "Legacy v1 snapshot");
      assert.equal(await saved(page), null);
    });
    await step("new built-in starter shares a compact independently readable QR", async () => {
      await sourcePage.getByRole("button", { name: "Close sharing", exact: true }).click();
      await sourcePage.locator(".demo-starter").filter({ has: sourcePage.getByRole("heading", { name: "Music garden", exact: true }) }).click();
      await expect(sourcePage.locator("#preview-heading")).toHaveText("Garden Music Studio");
      expectedShelf = (await saved(sourcePage))!;
      const updated = JSON.parse(expectedShelf) as Project[];
      assert.equal(updated.length, 3);
      assert.deepEqual(updated.slice(1), projects, "Starter creation must preserve existing projects");
      const url = await share(sourcePage, "Garden Music Studio");
      assert.match(new URL(url).hash, /^#t1=/);
      await sourcePage.getByRole("button", { name: "Show QR code", exact: true }).click();
      await decodeImage(sourcePage, "06-real-starter-qr", url);
    });
    await step("no reader APIs, generation, voice, or source shelf changes", async () => {
      assert.deepEqual(violations, []); assert.deepEqual(errors, []);
      assert.equal(await saved(sourcePage), expectedShelf);
    });
  } catch (error) {
    failure = error;
    artifacts.set("failure-recipient.png", await page.screenshot({ fullPage: true }));
    artifacts.set("failure-recipient-frames.json", JSON.stringify(await Promise.all(page.frames().slice(1).map(frame => frame.locator("body").innerText().catch(() => "Unavailable"))), null, 2));
    artifacts.set("failure-source.html", await sourcePage.content().catch(() => "Unavailable"));
    await sourcePage.screenshot({ fullPage: true, timeout: 5000 }).then(bytes => artifacts.set("failure.png", bytes)).catch(() => {});
  } finally {
    await browser.close(); await mkdir(output, { recursive: true });
    for (const [name, value] of artifacts) await writeFile(path.join(output, name), value);
    await writeFile(path.join(output, "report.json"), JSON.stringify({ timestamp: new Date().toISOString(), base: base.href, passed: !failure, activeStep, steps, pointerDiagnostics, decodedImages, violations, errors, evidence: "Actual loopback UI with isolated synthetic shelves, independently decoded rendered QR pixels. No physical camera scan or production-host acceptance. No generation or voice sessions.", failure: failure ? String(failure) : undefined }, null, 2));
  }
  console.log(`Evidence: ${output}`); if (failure) throw failure;
  console.log(`PASS ${steps.length} QR checks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
