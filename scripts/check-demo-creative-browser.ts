/**
 * Music/checklist acceptance against an existing loopback server; never starts one.
 * DEMO_BASE_URL=http://127.0.0.1:3217 npx tsx scripts/check-demo-creative-browser.ts
 * DEMO_CREATIVE_PASSIVE=1 skips generation/revision (safe on AI-configured dev3219).
 * Audio evidence observes real Web Audio calls/state in Chromium, not audible output.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect, type Frame, type Page } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15_000 });
const base = new URL(process.env.DEMO_BASE_URL || "http://127.0.0.1:3217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Loopback only");
const passive = process.env.DEMO_CREATIVE_PASSIVE === "1";
const output = path.resolve(process.env.DEMO_TEST_OUTPUT || `tests/demo-browser-artifacts/creative-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const storageKey = "vibekidding-demo-projects-v1";
const artifacts = new Map<string, string | Buffer>();
const steps: { name: string; status: string; error?: string }[] = [];
const errors: string[] = [];
const consoleErrors: string[] = [];
const prohibited: string[] = [];
const generatedModes: string[] = [];
const audioObservations: unknown[] = [];
let generationRequests = 0;
let activeStep = "startup";

// A CI failure delivered the click to the parent IFRAME while auto-scrolling it
// from offscreen; settle parent visibility before dispatching a child gesture.
async function readyParentFrame(page: Page) {
  const iframe = page.locator('iframe.demo-frame');
  await iframe.scrollIntoViewIfNeeded();
  await expect(iframe).toBeInViewport({ ratio: 0.5 });
  const child = await (await iframe.elementHandle())?.contentFrame();
  assert.ok(child);
  await child.waitForLoadState('load');
}

const pointerDiagnostics: unknown[] = [];
async function observePointerFrame(page: Page) {
  const frame = await (await page.locator('iframe.demo-frame').elementHandle())?.contentFrame();
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
    pointerDiagnostics.push({ label, lifecycle: [...lifecycle], frameDetached: frame.isDetached(), parent: await page.evaluate(() => ({ x: scrollX, y: scrollY, active: document.activeElement?.tagName, events: (window as unknown as { __parentPointer: unknown[] }).__parentPointer })), box: await page.locator('iframe.demo-frame').boundingBox(), child: await frame.evaluate(() => ({ evidence: (window as unknown as { __pointerEvidence: unknown }).__pointerEvidence, ready: document.readyState, x: scrollX, y: scrollY, active: document.activeElement?.outerHTML.slice(0, 200), status: document.querySelector('#status')?.textContent, cells: Array.from(document.querySelectorAll('#tic-board button')).map(b => b.textContent) })).catch(error => ({ error: String(error) })) });
  };
}

async function step(name: string, action: () => Promise<void>) {
  activeStep = name;
  try { await action(); steps.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
  catch (error) { steps.push({ name, status: "failed", error: String(error) }); throw error; }
}
async function shelf(page: Page) { return page.evaluate(key => localStorage.getItem(key), storageKey); }
async function preview(page: Page): Promise<Frame> {
  await expect(page.locator("iframe.demo-frame")).toHaveAttribute("sandbox", "allow-scripts");
  const handle = await page.locator("iframe.demo-frame").elementHandle();
  const frame = await handle?.contentFrame(); assert.ok(frame); return frame;
}
async function audioState(frame: Frame) {
  return frame.evaluate(() => {
    const observed = (window as unknown as { __creativeAudio: { contexts: AudioContext[]; starts: number } }).__creativeAudio;
    return { contexts: observed.contexts.length, starts: observed.starts, states: observed.contexts.map(context => context.state) };
  });
}
async function revise(page: Page, prompt: string) {
  assert.equal(passive, false, "Passive runs must never generate");
  await page.getByLabel("My next change", { exact: true }).fill(prompt);
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/api/demo/generate" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Make this change", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const result = await response.json(); assert.equal(result.mode, "template"); generatedModes.push(result.mode);
  await expect(page.locator(".demo-mode")).toHaveText("Template build");
  await expect(page.locator(".demo-feedback")).toContainText("Saved in this browser");
  return result as { html: string; title: string; mode: string };
}
async function main() {
  const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript({ content: `
    window.__creativeAudio = { contexts: [], starts: 0 };
    if (window.AudioContext) {
      window.AudioContext = new Proxy(window.AudioContext, { construct: function (target, args) {
        var context = Reflect.construct(target, args); window.__creativeAudio.contexts.push(context); return context;
      } });
    }
    if (window.OscillatorNode) {
      var originalStart = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function () { window.__creativeAudio.starts++; return originalStart.apply(this, arguments); };
    }
  ` });
  let templateVerified = false;
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    const disallowed = url.origin !== base.origin && !["about:", "data:"].includes(url.protocol)
      || request.method() === "POST" && !(url.pathname === "/api/demo/generate" && !passive && templateVerified);
    if (disallowed) { prohibited.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort(); }
    else await route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/demo/generate") generationRequests++; });
  let failure: unknown;
  try {
    await step("loopback template capability and fresh shelf", async () => {
      const response = await page.request.get(new URL("/api/demo/generate", base).href);
      assert.equal(response.status(), 200);
      const readiness = await response.json();
      templateVerified = readiness.enabled === true && readiness.mode === "template";
      assert.ok(passive || templateVerified, "Revisions require a template-only server; no AI opt-in supported");
      await page.goto(new URL("/demo", base).href);
      await expect(page.getByLabel("My idea", { exact: true })).toBeEnabled();
      assert.equal(await shelf(page), null);
    });
    await step("music and checklist suggestions populate ideas without building", async () => {
      await page.getByRole("group", { name: "Idea suggestions" }).getByRole("button", { name: "Music garden", exact: true }).click();
      await expect(page.getByLabel("My idea", { exact: true })).toHaveValue(/music/i);
      await page.getByRole("group", { name: "Idea suggestions" }).getByRole("button", { name: "Checklist", exact: true }).click();
      await page.getByRole("dialog", { name: "Replace your idea?", exact: true }).getByRole("button", { name: "Use this idea", exact: true }).click();
      await expect(page.getByLabel("My idea", { exact: true })).toHaveValue(/checklist/i);
      assert.equal(await shelf(page), null);
      await expect(page.locator("iframe.demo-frame")).toHaveCount(0);
    });
    await step("music starter is silent before a gesture and uses an isolated preview", async () => {
      await page.locator(".demo-starter").filter({ has: page.getByRole("heading", { name: "Music garden", exact: true }) }).click();
      await expect(page.locator("#preview-heading")).toHaveText("Garden Music Studio");
      const frame = await preview(page);
      await expect(frame.getByRole("button", { name: "Play C4", exact: true })).toBeVisible();
      assert.deepEqual(await audioState(frame), { contexts: 0, starts: 0, states: [] });
      assert.equal(generationRequests, 0);
    });
    await step("music pointer and keyboard gestures activate native audio; mute does not autoplay", async () => {
      const before = await shelf(page); const frame = await preview(page);
      const record = await observePointerFrame(page);
      await record("before C4");
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Play C4", exact: true }).click();
      await record("after C4");
      audioObservations.push({ after: "C4 pointer", ...await audioState(frame), status: await frame.locator("#status").innerText() });
      await expect.poll(async () => (await audioState(frame)).starts).toBe(1);
      assert.ok((await audioState(frame)).states.includes("running"));
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Mute sound", exact: true }).click();
      const muted = await audioState(frame);
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Play D4", exact: true }).click();
      assert.equal((await audioState(frame)).starts, muted.starts);
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Unmute sound", exact: true }).click();
      assert.equal((await audioState(frame)).starts, muted.starts);
      await frame.getByRole("button", { name: "Play E4", exact: true }).press("Enter");
      await expect.poll(async () => (await audioState(frame)).starts).toBe(muted.starts + 1);
      assert.equal(await shelf(page), before, "Playing music must not alter saved HTML/history");
      artifacts.set("01-music.png", await page.screenshot({ fullPage: true }));
    });
    if (!passive) await step("real template revision preserves music and applies ocean blue theme", async () => {
      const result = await revise(page, "Make it blue ocean");
      const settings = JSON.parse(result.html.match(/<!--vibekidding-demo-template:(.*?)-->/)![1]);
      assert.equal(settings.kind, "music"); assert.equal(settings.theme, "ocean"); assert.equal(settings.color, "#2563eb");
      const frame = await preview(page);
      await expect(frame.getByRole("button", { name: "Play C4", exact: true })).toBeVisible();
      assert.deepEqual(await audioState(frame), { contexts: 0, starts: 0, states: [] });
    });
    await step("checklist starter adds, toggles and removes text-only tasks", async () => {
      await page.locator(".demo-starter").filter({ has: page.getByRole("heading", { name: "Little checklist", exact: true }) }).click();
      await expect(page.locator("#preview-heading")).toHaveText("Garden Daily Checklist");
      const before = await shelf(page); const frame = await preview(page);
      await expect(frame.locator("#items input[type=checkbox]")).toHaveCount(3);
      await expect(frame.locator("#progress")).toHaveText("0 / 3 completed");
      const task = "QA <img src=x onerror=alert(1)>";
      await frame.locator("#item").fill(task);
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Add item", exact: true }).click();
      await expect(frame.getByRole("checkbox", { name: task, exact: true })).toBeVisible();
      await expect(frame.locator("#items img")).toHaveCount(0);
      await frame.getByRole("checkbox", { name: task, exact: true }).check();
      await expect(frame.locator("#progress")).toHaveText("1 / 4 completed");
      await readyParentFrame(page);
      await frame.getByRole("button", { name: `Remove ${task}`, exact: true }).click();
      await expect(frame.locator("#items input[type=checkbox]")).toHaveCount(3);
      await expect(frame.locator("#progress")).toHaveText("0 / 3 completed");
      assert.equal(await shelf(page), before);
    });
    await step("checklist reset and preview restart restore visit-only defaults", async () => {
      const before = await shelf(page); const frame = await preview(page);
      await frame.locator("#items input[type=checkbox]").first().check();
      await frame.locator("#item").fill("Temporary task"); await frame.locator("#item").press("Enter");
      await expect(frame.locator("#items input[type=checkbox]")).toHaveCount(4);
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Reset checklist", exact: true }).click();
      await expect(frame.locator("#progress")).toHaveText("0 / 3 completed");
      await frame.locator("#items input[type=checkbox]").first().check();
      await page.getByRole("button", { name: "Restart play", exact: true }).click();
      const restarted = await preview(page);
      await expect(restarted.locator("#progress")).toHaveText("0 / 3 completed");
      assert.equal(await shelf(page), before);
    });
    if (!passive) await step("real template revision preserves checklist and applies space pink theme", async () => {
      const result = await revise(page, "Make it pink space");
      const settings = JSON.parse(result.html.match(/<!--vibekidding-demo-template:(.*?)-->/)![1]);
      assert.equal(settings.kind, "checklist"); assert.equal(settings.theme, "space"); assert.equal(settings.color, "#ec4899");
      const frame = await preview(page);
      await expect(frame.locator("#items input[type=checkbox]")).toHaveCount(3);
    });
    await step("mobile checklist can add and toggle tasks in large play", async () => {
      const before = await shelf(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Play large", exact: true }).click();
      const frame = await preview(page);
      await frame.locator("#item").fill("Mobile task");
      await readyParentFrame(page);
      await frame.getByRole("button", { name: "Add item", exact: true }).click();
      await frame.getByRole("checkbox", { name: "Mobile task", exact: true }).check();
      await expect(frame.locator("#progress")).toHaveText("1 / 4 completed");
      assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      artifacts.set("02-checklist-mobile.png", await page.screenshot());
      await page.getByRole("button", { name: "Back to workshop", exact: true }).click();
      assert.equal(await shelf(page), before);
    });
    await step("no unexpected provider/voice requests or runtime errors", async () => {
      assert.deepEqual(prohibited, []); assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
      assert.equal(generationRequests, passive ? 0 : 2);
    });
  } catch (error) {
    failure = error;
    artifacts.set("failure.html", await page.content().catch(() => "Page unavailable"));
    artifacts.set("failure-frames.json", JSON.stringify(await Promise.all(page.frames().slice(1).map(async frame => {
      try { return { text: (await frame.locator("body").innerText()).slice(0, 2000), audio: await audioState(frame) }; }
      catch { return { unavailable: true }; }
    })), null, 2));
    await page.screenshot({ fullPage: true, timeout: 5000 }).then(data => artifacts.set("failure.png", data)).catch(() => {});
  } finally {
    await browser.close(); await mkdir(output, { recursive: true });
    for (const [name, data] of artifacts) await writeFile(path.join(output, name), data);
    await writeFile(path.join(output, "report.json"), JSON.stringify({ timestamp: new Date().toISOString(), base: base.href, passive, passed: !failure, activeStep, steps, generatedModes, audioObservations, pointerDiagnostics, prohibited, errors, consoleErrors, evidence: "Local Chromium UI and real template endpoint. Web Audio constructor/start observation delegates to native APIs; no audible or physical-device acceptance. No voice sessions or AI provider calls.", failure: failure ? String(failure) : undefined }, null, 2));
  }
  console.log(`Evidence: ${output}`); if (failure) throw failure;
  console.log(`PASS ${steps.length} creative checks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
