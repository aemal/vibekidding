/**
 * Portable share acceptance against an existing loopback server. Never starts one.
 * DEMO_BASE_URL=http://127.0.0.1:3219 npx tsx scripts/check-demo-share-browser.ts
 * Uses synthetic shelf fixtures in isolated contexts; no generation or voice sessions.
 * Reader must make no API requests. Unexpected requests are blocked and fail the run.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, expect as baseExpect, type BrowserContext, type Page } from "@playwright/test";
import { createShareUrl, decodeShareFragment } from "../src/lib/demo-share";
import { templateProject } from "../src/lib/demo-server/template";
import type { Project } from "../src/components/demo/project-backup";

const expect = baseExpect.configure({ timeout: 15_000 });
const base = new URL(process.env.DEMO_BASE_URL || "http://127.0.0.1:3219");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Loopback only");
const output = path.resolve(process.env.DEMO_TEST_OUTPUT || `tests/demo-browser-artifacts/share-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const storageKey = "vibekidding-demo-projects-v1";
const counterHtml = '<!doctype html><html><body><h1>Shared counter</h1><button id="count">Count: 0</button><script>let n=0;document.getElementById("count").onclick=function(){this.textContent="Count: "+(++n)};</script></body></html>';
const fixture: Project = {
  id: "source-fixture", title: "Portable counter", emoji: "✦", updatedAt: 100,
  versions: [
    { id: "old-version", html: "<p>OLD_HISTORY_SENTINEL</p>", prompt: "PRIVATE_OLD_PROMPT", createdAt: 90, mode: "template" },
    { id: "current-version", html: counterHtml, prompt: "PRIVATE_CURRENT_PROMPT", createdAt: 100, mode: "template" },
  ],
};
const steps: { name: string; status: string; error?: string }[] = [];
const violations: string[] = [];
const pageErrors: string[] = [];
const navigations: string[] = [];
const artifacts = new Map<string, Buffer | string>();
let activeStep = "startup";
async function step(name: string, action: () => Promise<void>) {
  activeStep = name;
  try { await action(); steps.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
  catch (error) { steps.push({ name, status: "failed", error: String(error) }); throw error; }
}
function wire(payload: unknown) { return `#v1=${gzipSync(JSON.stringify(payload)).toString("base64url")}`; }
async function shelf(page: Page) { return page.evaluate(key => localStorage.getItem(key), storageKey); }
async function guard(context: BrowserContext, reader: boolean) {
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "about:") return route.continue();
    const prohibited = url.origin !== base.origin || (url.pathname.startsWith("/api/") && (reader || request.method() !== "GET"));
    if (prohibited) { violations.push(`${reader ? "reader" : "source"}: ${request.method()} ${url.origin}${url.pathname}`); await route.abort(); }
    else await route.continue();
  });
  context.on("page", page => {
    page.setDefaultTimeout(15_000); page.on("pageerror", error => pageErrors.push(error.message));
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(`${reader ? "reader" : "source"}: ${frame.url().split("#")[0]} hash-length=${new URL(frame.url()).hash.length}`); });
  });
}
async function seed(context: BrowserContext) {
  // Only seed once, on the top-level origin, so navigation cannot mask shelf writes.
  await context.addInitScript(({ origin, key, value }) => {
    if (window.top === window && location.origin === origin && !sessionStorage.getItem("share-fixture-seeded")) {
      localStorage.setItem(key, value); sessionStorage.setItem("share-fixture-seeded", "yes");
    }
  }, { origin: base.origin, key: storageKey, value: JSON.stringify([fixture]) });
}
async function pending(page: Page, title: string) {
  await expect(page.getByRole("button", { name: "Play shared project", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
}
async function playCounter(page: Page) {
  await page.getByRole("button", { name: "Play shared project", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.locator("iframe")).toHaveAttribute("referrerpolicy", "no-referrer");
  const handle = await page.locator("iframe").elementHandle();
  const frame = await handle?.contentFrame();
  assert.ok(frame);
  await frame.waitForLoadState("load");
  const counter = page.frameLocator("iframe").getByRole("button", { name: "Count: 0", exact: true });
  // A visible fixture button alone does not prove its inline handler has run.
  // Keep the real pointer click and Count: 1 assertion; no retry or synthetic click.
  await expect.poll(() => counter.evaluate(element => typeof (element as HTMLButtonElement).onclick)).toBe("function");
  await counter.click();
  await expect(page.frameLocator("iframe").getByRole("button", { name: "Count: 1", exact: true })).toBeVisible();
}
async function main() {
  const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || "chrome", headless: true });
  const source = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const recipient = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await guard(source, false); await guard(recipient, true); await seed(source);
  // Simulate denied clipboard access only, never a successful copy or API response.
  await source.addInitScript({ content: `
    window.shareCopyAttempts = 0;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async function () { window.shareCopyAttempts++; throw new DOMException("Clipboard denied for test", "NotAllowedError"); }
    } });
  ` });
  const sourcePage = await source.newPage(); const page = await recipient.newPage();
  let failure: unknown; let sharedUrl = "";
  try {
    await step("source shares only current build without changing shelf", async () => {
      await sourcePage.goto(new URL("/demo", base).href);
      await sourcePage.getByRole("button", { name: /Portable counter 2 versions/ }).click();
      const before = await shelf(sourcePage);
      await sourcePage.getByRole("button", { name: "Share playable link", exact: true }).click();
      await expect(sourcePage.getByRole("dialog", { name: "Share a playable snapshot" })).toBeVisible();
      await sourcePage.getByRole("button", { name: "Create playable link", exact: true }).click();
      const link = sourcePage.getByRole("textbox", { name: "Playable link", exact: true });
      await expect(link).toHaveValue(/\/demo\/play#v1=/);
      sharedUrl = await link.inputValue();
      const decoded = await decodeShareFragment(new URL(sharedUrl).hash);
      assert.deepEqual(decoded, { title: fixture.title, html: counterHtml });
      assert.ok(!JSON.stringify(decoded).includes("PRIVATE_"));
      assert.ok(!JSON.stringify(decoded).includes("OLD_HISTORY_SENTINEL"));
      assert.equal(await shelf(sourcePage), before);
      assert.equal(await sourcePage.evaluate(() => (window as unknown as { shareCopyAttempts: number }).shareCopyAttempts), 0);
      artifacts.set("01-source-share.png", await sourcePage.screenshot({ fullPage: true }));
    });
    await step("clipboard denial leaves a selected manual-copy link", async () => {
      await sourcePage.getByRole("button", { name: "Copy link", exact: true }).click();
      await expect(sourcePage.getByRole("dialog", { name: "Share a playable snapshot" }).getByRole("status")).toContainText("Automatic copy is unavailable");
      const link = sourcePage.getByRole("textbox", { name: "Playable link", exact: true });
      await expect(link).toBeFocused();
      assert.equal(await link.evaluate(element => {
        const text = element as HTMLTextAreaElement;
        return text.selectionStart === 0 && text.selectionEnd === text.value.length;
      }), true);
      assert.equal(await shelf(sourcePage), JSON.stringify([fixture]));
    });
    await step("fresh recipient requires confirmation and cancel preserves empty shelf", async () => {
      // Cancel is in-memory only. Explicit reload must return to consent, never autoplay.
      for (let cycle = 0; cycle < 3; cycle++) {
        if (cycle === 0) await page.goto(sharedUrl);
        else if (cycle === 1) await page.getByRole("button", { name: "Review link again", exact: true }).click();
        else await page.reload();
        await pending(page, fixture.title);
        assert.equal(await shelf(page), null);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Project not opened", exact: true })).toBeVisible();
        assert.equal(new URL(page.url()).hash, new URL(sharedUrl).hash);
        await expect(page.locator("iframe")).toHaveCount(0);
        assert.equal(await shelf(page), null);
      }
    });
    await step("explicit playback works without creating a saved project", async () => {
      await page.reload(); await pending(page, fixture.title); await playCounter(page);
      assert.equal(await shelf(page), null);
      await page.getByRole("button", { name: "Restart play", exact: true }).click();
      await expect(page.frameLocator("iframe").getByRole("button", { name: "Count: 0", exact: true })).toBeVisible();
      artifacts.set("02-reader-playing.png", await page.screenshot({ fullPage: true }));
    });
    await step("fragment replacement removes running game and requires new consent", async () => {
      const next = await createShareUrl(base.origin, { title: "Second counter", html: counterHtml });
      await page.evaluate(hash => { location.hash = hash; }, new URL(next).hash);
      await pending(page, "Second counter");
      await playCounter(page);
      await page.evaluate(() => { location.hash = "#v1=invalid!"; });
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);
      assert.equal(await shelf(page), null);
    });
    await step("rapid fragment changes cannot revive an earlier decoded project", async () => {
      const first = await createShareUrl(base.origin, { title: "Obsolete counter", html: counterHtml });
      const last = await createShareUrl(base.origin, { title: "Latest counter", html: counterHtml });
      await page.evaluate(([older, newer]) => {
        location.hash = older;
        setTimeout(() => { location.hash = newer; }, 0);
      }, [new URL(first).hash, new URL(last).hash]);
      await pending(page, "Latest counter");
      await playCounter(page);
      await expect(page.getByRole("heading", { name: "Obsolete counter", exact: true })).toHaveCount(0);
    });
    await step("shared titles render as text without executing markup", async () => {
      const title = '<img src=x onerror="window.titleExecuted=true">';
      await page.goto(await createShareUrl(base.origin, { title, html: counterHtml }));
      await pending(page, title);
      assert.equal(await page.evaluate(() => "titleExecuted" in window), false);
      await expect(page.locator("h1 img")).toHaveCount(0);
    });
    await step("malformed and oversized fragments fail before iframe creation", async () => {
      const bad = ["#v2=AAAA", "#v1=invalid!", "#v1=AA", wire({ v: 1, title: "bad", html: "" }), wire({ v: 1, title: "bad", html: "x", surprise: true }), wire({ v: 1, title: "too big", html: "x".repeat(90 * 1024) }), `#v1=${"A".repeat(8001)}`];
      for (const fragment of bad) {
        await page.goto(new URL("/demo/play", base).href + fragment);
        await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
        await expect(page.locator("iframe")).toHaveCount(0);
        assert.equal(await shelf(page), null);
      }
    });
    await step("all six local templates fit portable links and reach consent", async () => {
      for (const prompt of ["space collector", "ocean memory", "garden drawing", "addition quiz", "garden story", "garden tic-tac-toe"]) {
        const build = templateProject(prompt);
        const url = await createShareUrl(base.origin, { title: build.title, html: build.html });
        assert.ok(url.length <= 8000);
        await page.goto(url); await pending(page, build.title);
      }
    });
    await step("mobile consent and playable controls are reachable", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(sharedUrl); await pending(page, fixture.title);
      const box = await page.getByRole("button", { name: "Play shared project", exact: true }).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
      await playCounter(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const control of [page.getByRole("button", { name: "Restart play", exact: true }), page.getByRole("link", { name: "Back to workshop", exact: true })]) {
        const controlBox = await control.boundingBox();
        assert.ok(controlBox && controlBox.x >= 0 && controlBox.y >= 0 && controlBox.x + controlBox.width <= 390 && controlBox.y + controlBox.height <= 844);
      }
      artifacts.set("03-mobile-reader.png", await page.screenshot({ fullPage: true }));
    });
    await step("recipient with existing projects keeps shelf unchanged", async () => {
      const existing = await browser.newContext(); await guard(existing, true); await seed(existing);
      const preserved = await existing.newPage();
      try {
        await preserved.goto(sharedUrl); await pending(preserved, fixture.title);
        const before = await shelf(preserved); assert.equal(before, JSON.stringify([fixture]));
        await playCounter(preserved); assert.equal(await shelf(preserved), before);
        await preserved.reload(); await pending(preserved, fixture.title);
        assert.equal(await shelf(preserved), before);
      } finally { await existing.close(); }
    });
    await step("no prohibited APIs, provider requests, or runtime errors", async () => {
      assert.deepEqual(violations, []); assert.deepEqual(pageErrors, []);
      assert.equal(await shelf(sourcePage), JSON.stringify([fixture]));
    });
  } catch (error) {
    failure = error;
    console.log("Failure navigation", page.url(), navigations);
    artifacts.set("failure.html", await page.content().catch(() => "Page unavailable"));
    artifacts.set("failure-source.html", await sourcePage.content().catch(() => "Source unavailable"));
    // Only synthetic recipient fixture data; never dump URLs or browser credentials.
    const frames = await Promise.all(page.frames().filter(frame => frame !== page.mainFrame()).map(async frame => {
      try { return await frame.evaluate(() => ({
        ready: document.readyState,
        text: document.body?.innerText.slice(0, 2000),
        counterText: document.getElementById("count")?.textContent,
        counterHandler: typeof (document.getElementById("count") as HTMLButtonElement | null)?.onclick,
        scrollX, scrollY,
      })); } catch { return { detached: true }; }
    }));
    artifacts.set("failure-frames.json", JSON.stringify(frames, null, 2));
    await page.screenshot({ fullPage: true, timeout: 5000 }).then(data => artifacts.set("failure.png", data)).catch(() => {});
  } finally {
    await browser.close();
    await mkdir(output, { recursive: true });
    for (const [name, data] of artifacts) await writeFile(path.join(output, name), data);
    await writeFile(path.join(output, "report.json"), JSON.stringify({ timestamp: new Date().toISOString(), base: base.href, passed: !failure, activeStep, steps, violations, pageErrors, navigations, evidence: "Local browser acceptance with synthetic source shelf and real share helper/UI. No generation or voice sessions. Unexpected network requests blocked and recorded. Not production acceptance.", failure: failure ? String(failure) : undefined }, null, 2));
  }
  console.log(`Evidence: ${output}`);
  if (failure) throw failure;
  console.log(`PASS ${steps.length} sharing checks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
