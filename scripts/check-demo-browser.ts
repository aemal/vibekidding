/**
 * Real /demo acceptance against an already-running loopback Next.js server.
 * Run: DEMO_BASE_URL=http://127.0.0.1:3217 npx tsx scripts/check-demo-browser.ts
 * Start the server separately with VIBEKIDDING_DEMO_ENABLED=1 and template mode.
 * No requests are mocked. A fresh browser context never touches a user's shelf.
 * AI capability requires DEMO_TEST_ALLOW_AI=1; template runs make no provider calls.
 * DEMO_TEST_PASSIVE_VOICE_ONLY=1 checks disabled voice and a built-in starter only,
 * then exits before generation. Voice must be disabled or unconfigured.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Page } from "@playwright/test";

type SavedProject = { id: string; title: string; versions: { id: string; html: string; mode: string; prompt: string }[] };
type BuildResult = { html: string; title: string; mode: "template" | "ai"; message?: string };
const base = new URL(process.env.DEMO_BASE_URL || process.env.DEMO_TEST_URL || "http://127.0.0.1:3217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Only loopback demo URLs are supported");
const output = path.resolve(process.env.DEMO_TEST_OUTPUT || `tests/demo-browser-artifacts/${new Date().toISOString().replace(/[:.]/g, "-")}`);
const storageKey = "vibekidding-demo-projects-v1";
// Readiness + built-in starter only; safe even when the server advertises AI.
const passiveVoiceOnly = process.env.DEMO_TEST_PASSIVE_VOICE_ONLY === "1";
const steps: { name: string; status: "passed" | "failed"; error?: string }[] = [];
const buildModes: string[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
const navigations: string[] = [];
const developmentMessages: string[] = [];
// Flush artifacts only after closing Chrome: writing into a watched checkout
// during a dev-server test can itself cause a reload.
const artifacts = new Map<string, Buffer | string>();
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


async function saved(page: Page): Promise<SavedProject[]> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), storageKey);
}

async function step(name: string, action: () => Promise<void>) {
  activeStep = name;
  try {
    await action();
    steps.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    steps.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function build(page: Page, prompt: string, revision = false): Promise<BuildResult> {
  await page.getByLabel(revision ? "My next change" : "My idea", { exact: true }).fill(prompt);
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/api/demo/generate" && response.request().method() === "POST", { timeout: 100_000 });
  await page.getByRole("button", { name: revision ? "Make this change" : "Bring my idea to life", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, `Real generation endpoint returned ${response.status()}: ${(await response.text()).slice(0, 500)}`);
  const result = await response.json() as BuildResult;
  assert.ok(["ai", "template"].includes(result.mode));
  assert.ok(result.html?.trim());
  buildModes.push(result.mode);
  await expect(page.locator(".demo-mode")).toHaveText(result.mode === "ai" ? "AI build" : "Template build");
  await expect(page.getByRole("button", { name: "Make this change", exact: true })).toBeVisible();
  await expect(page.locator(".demo-feedback")).toContainText("Saved in this browser.");
  return result;
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const voicePosts: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/demo/voice" && request.method() === "POST") voicePosts.push(request.url());
  });
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (/HMR|refresh|reload/i.test(message.text())) developmentMessages.push(message.text());
  });
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  page.on("requestfailed", request => failedRequests.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  let failure: unknown;
  let capabilities: Record<string, unknown> | undefined;
  let generated: BuildResult | undefined;
  let generatedId = "";
  try {
    await step("actual demo route and enabled backend", async () => {
      // Compile the real API route before browser navigation in development.
      const capability = await page.request.get(new URL("/api/demo/generate", base).href);
      assert.equal(capability.status(), 200, `Demo capability check: ${(await capability.text()).slice(0, 500)}`);
      capabilities = await capability.json();
      assert.equal(capabilities?.enabled, true);
      assert.ok(passiveVoiceOnly || capabilities?.mode === "template" || process.env.DEMO_TEST_ALLOW_AI === "1", "Backend advertises AI. Use a template-only server for repeatable local acceptance, or explicitly opt in with DEMO_TEST_ALLOW_AI=1.");
      const response = await page.goto(new URL("/demo", base).href, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("workshop");
      await expect(page.getByLabel("My idea", { exact: true })).toBeEnabled();
      assert.deepEqual(await saved(page), []);
      artifacts.set("01-empty.png", await page.screenshot({ fullPage: true, caret: "initial" }));
    });
    await step("optional unavailable Samantha voice stays passive", async () => {
      const response = await page.request.get(new URL("/api/demo/voice", base).href);
      assert.equal(response.status(), 200);
      const readiness = await response.json();
      assert.ok(!readiness.enabled || !readiness.configured, "This regression requires unavailable voice; it never starts a session");
      await expect(page.getByRole("button", { name: "Dictate text", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Talk with Samantha", exact: true }).click();
      const voice = page.getByRole("region", { name: "Samantha AI conversation" });
      await expect(voice.getByRole("status")).toHaveText(readiness.message);
      await expect(page.getByRole("button", { name: "Start Samantha conversation", exact: true })).toHaveCount(0);
      await expect(page.getByLabel("My idea", { exact: true })).toBeEnabled();
      assert.deepEqual(voicePosts, []);
    });
    await step("starter creation and playable isolated preview", async () => {
      await page.getByRole("button", { name: /Space explorer.*Make this mine/ }).click();
      await expect(page.locator("#preview-heading")).toHaveText("Star Collector");
      const preview = page.frameLocator("iframe.demo-frame");
      await readyParentFrame(page);
      await preview.getByRole("button", { name: "Start game", exact: true }).click();
      await preview.getByRole("button", { name: "Collect target", exact: true }).press("Enter");
      await expect(preview.locator("#status")).toContainText("Collected 1");
      await expect(page.locator("iframe.demo-frame")).toHaveAttribute("sandbox", "allow-scripts");
      assert.equal((await saved(page)).length, 1);
    });
    await step("unavailable voice does not block template play or start a session", async () => {
      assert.equal((await saved(page))[0].versions[0].mode, "template");
      assert.deepEqual(voicePosts, []);
      assert.deepEqual(pageErrors, []);
      artifacts.set("07-samantha-disabled-starter.png", await page.screenshot({ fullPage: true, caret: "initial" }));
      await page.getByRole("button", { name: "Dictate text", exact: true }).click();
    });
    if (passiveVoiceOnly) return;
    await step("large play preserves collector score, iframe and saved history across Back and Escape", async () => {
      const shelf = await page.evaluate(key => localStorage.getItem(key), storageKey);
      const frameNode = await page.locator("iframe.demo-frame").elementHandle();
      assert.ok(frameNode);
      const preview = page.frameLocator("iframe.demo-frame");
      await expect(preview.locator("#status")).toContainText("Collected 1");
      await page.getByRole("button", { name: "Play large", exact: true }).click();
      await expect(page.locator(".demo-play-dialog")).toHaveClass(/is-expanded/);
      assert.equal(await page.locator(".demo-play-dialog").evaluate(element => element.matches(":modal")), true);
      await expect(preview.locator("#status")).toContainText("Collected 1");
      assert.equal(await frameNode.evaluate(element => element.isConnected), true);
      await preview.getByRole("button", { name: "Collect target", exact: true }).press("Enter");
      await expect(preview.locator("#status")).toContainText("Collected 2");
      await page.getByRole("button", { name: "Back to workshop", exact: true }).click();
      await expect(page.locator(".demo-play-dialog")).not.toHaveClass(/is-expanded/);
      await expect(preview.locator("#status")).toContainText("Collected 2");
      await page.getByRole("button", { name: "Play large", exact: true }).click();
      await preview.getByRole("button", { name: "Collect target", exact: true }).press("Escape");
      await expect(page.getByRole("button", { name: "Play large", exact: true })).toBeVisible();
      await expect(preview.locator("#status")).toContainText("Collected 2");
      assert.equal(await frameNode.evaluate(element => element.isConnected), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), shelf);
    });
    await step("collector target remains inside its field after narrowing the viewport", async () => {
      const shelf = await page.evaluate(key => localStorage.getItem(key), storageKey);
      const preview = page.frameLocator("iframe.demo-frame");
      await page.getByRole("button", { name: "Play large", exact: true }).click();
      // Exercise real game controls until a target occupies the desktop edge.
      // No synthetic target coordinates, random overrides or mocked game state.
      let nearEdge = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        await preview.locator("#start").press("Enter");
        await preview.getByRole("button", { name: "Collect target", exact: true }).press("Enter");
        nearEdge = await preview.locator("#target").evaluate(element => {
          const target = element.getBoundingClientRect();
          const field = document.getElementById("field")!.getBoundingClientRect();
          return target.left - field.left > 370;
        });
        if (nearEdge) break;
      }
      assert.ok(nearEdge, "Could not exercise a desktop-edge target after 40 real restarts");
      const before = await preview.locator("#status").innerText();
      assert.match(before, /Collected 1 \/ 5/);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => preview.locator("#target").evaluate(element => {
        const target = element.getBoundingClientRect();
        const field = document.getElementById("field")!.getBoundingClientRect();
        return !element.hasAttribute("hidden") && target.left >= field.left && target.right <= field.right && target.top >= field.top && target.bottom <= field.bottom;
      }), { message: "Active collector target must remain fully inside the narrower visible field" }).toBe(true);
      const after = await preview.locator("#status").innerText();
      assert.equal(after.match(/Collected \d+ \/ \d+/)?.[0], before.match(/Collected \d+ \/ \d+/)?.[0], "Resizing must preserve score");
      assert.ok(Number(after.match(/(\d+) seconds/)?.[1]) <= Number(before.match(/(\d+) seconds/)?.[1]), "Resizing must not reset the timer");
      // A successful pointer click additionally verifies the target is reachable.
      await readyParentFrame(page);
      await preview.getByRole("button", { name: "Collect target", exact: true }).click();
      await expect(preview.locator("#status")).toContainText("Collected 2");
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), shelf);
      await page.getByRole("button", { name: "Back to workshop", exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await step("large-play mobile controls stay inside the viewport and Escape returns to workshop", async () => {
      const shelf = await page.evaluate(key => localStorage.getItem(key), storageKey);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Play large", exact: true }).click();
      await expect(page.locator(".demo-play-dialog")).toHaveClass(/is-expanded/);
      for (const name of ["Back to workshop", "Restart play"]) {
        const control = page.getByRole("button", { name, exact: true });
        await expect(control).toBeVisible();
        await expect(control).toBeEnabled();
        const box = await control.boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `${name} must be reachable inside the mobile viewport`);
      }
      artifacts.set("05-mobile-large-play.png", await page.screenshot({ caret: "initial" }));
      await page.getByRole("button", { name: "Back to workshop", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Play large", exact: true })).toBeVisible();
      await expect(page.locator(".demo-play-dialog")).not.toHaveClass(/is-expanded/);
      assert.equal(await page.locator(".demo-play-dialog").evaluate(element => element.matches(":modal")), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), shelf);
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await step("public template mode is labeled without AI claims", async () => {
      if (capabilities?.publicTemplateOnly) {
        await expect(page.locator(".demo-header .demo-tag")).toHaveText("TEMPLATE DEMO");
        await expect(page.locator(".demo-readiness")).toContainText("Templates ready · no AI calls");
        await expect(page.locator(".demo-note")).toContainText("project builds make no AI provider calls");
        await expect(page.locator(".demo-note")).not.toContainText("may use AI");
      } else {
        await expect(page.locator(".demo-header .demo-tag")).toHaveText("LOCAL DEMO");
      }
    });
    await step("prompt creation through real local backend", async () => {
      await page.getByRole("button", { name: "New idea", exact: true }).click();
      generated = await build(page, "Make a blue ocean collecting game");
      const projects = await saved(page);
      assert.equal(projects.length, 2);
      generatedId = projects[0].id;
      assert.equal(projects[0].versions[0].html, generated.html);
      if (generated.mode === "template") {
        const preview = page.frameLocator("iframe.demo-frame");
        await readyParentFrame(page);
        await preview.getByRole("button", { name: "Start game", exact: true }).click();
        await readyParentFrame(page);
        await preview.getByRole("button", { name: "Collect target", exact: true }).click();
        await expect(preview.locator("#status")).toContainText("Collected 1");
      } else {
        await expect(page.frameLocator("iframe.demo-frame").locator("body")).not.toBeEmpty();
      }
    });
    await step("revision creates a distinct saved version", async () => {
      const revised = await build(page, "Make it pink and easier", true);
      const project = (await saved(page)).find(item => item.id === generatedId)!;
      assert.equal(project.versions.length, 2);
      assert.equal(project.versions[0].html, generated!.html);
      assert.equal(project.versions[1].html, revised.html);
      assert.notEqual(revised.html, generated!.html, "Revision must change the generated project");
      await expect(page.getByRole("button", { name: "History (2)", exact: true })).toBeVisible();
      artifacts.set("02-revised.png", await page.screenshot({ fullPage: true, caret: "initial" }));
    });
    const renamed = "Browser acceptance ocean";
    await step("rename dialog and durable shelf reload", async () => {
      await page.getByRole("button", { name: "Rename", exact: true }).click();
      await page.getByRole("dialog", { name: "Give it a new name", exact: true }).getByLabel("Project name").fill(renamed);
      await page.getByRole("button", { name: "Save name", exact: true }).click();
      await expect(page.locator("#preview-heading")).toHaveText(renamed);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: new RegExp(`${renamed}.*2 versions`) }).click();
      await expect(page.locator("#preview-heading")).toHaveText(renamed);
      assert.equal((await saved(page)).find(item => item.id === generatedId)?.versions.length, 2);
    });
    await step("history restore preserves original and revision", async () => {
      await page.getByRole("button", { name: "History (2)", exact: true }).click();
      await page.getByRole("region", { name: "Version history" }).getByRole("button", { name: "Restore", exact: true }).click();
      const project = (await saved(page)).find(item => item.id === generatedId)!;
      assert.equal(project.versions.length, 3);
      assert.equal(project.versions[2].html, generated!.html);
      assert.notEqual(project.versions[0].id, project.versions[2].id);
      await expect(page.locator(".demo-feedback")).toContainText("Earlier version restored and saved");
    });
    await step("export downloads a complete sandboxed HTML document", async () => {
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export HTML", exact: true }).click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), "Browser-acceptance-ocean.html");
      const file = await download.path();
      assert.ok(file, "Download must complete to a local temporary file");
      const html = await readFile(file, "utf8");
      artifacts.set(download.suggestedFilename(), html);
      assert.match(html, /<!doctype html>/i);
      assert.match(html, /Content-Security-Policy/i);
      assert.ok(html.includes(generated!.title));
    });
    let duplicate: SavedProject;
    const withoutVersionIds = (project: SavedProject) => project.versions.map(version => ({ ...version, id: undefined }));
    await step("duplicate preserves history with fresh project and version IDs", async () => {
      const before = await saved(page);
      const original = before.find(item => item.id === generatedId)!;
      await page.getByRole("button", { name: "Duplicate", exact: true }).click();
      await expect(page.locator(".demo-feedback")).toContainText("Project copied with its version history and saved");
      const after = await saved(page);
      assert.equal(after.length, before.length + 1);
      duplicate = after.find(item => !before.some(previous => previous.id === item.id))!;
      assert.ok(duplicate);
      assert.equal(duplicate.title, `${renamed} (copy)`);
      assert.deepEqual(withoutVersionIds(duplicate), withoutVersionIds(original));
      assert.equal(new Set(duplicate.versions.map(version => version.id)).size, original.versions.length);
      assert.ok(duplicate.versions.every(version => !original.versions.some(previous => previous.id === version.id)));
      for (const previous of before) assert.deepEqual(after.find(item => item.id === previous.id), previous);
    });
    await step("backup download and import preserve history without overwriting projects", async () => {
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export backup", exact: true }).click();
      const download = await pending;
      assert.match(download.suggestedFilename(), /\.vibekidding\.json$/);
      const file = await download.path();
      assert.ok(file);
      const backup = await readFile(file);
      artifacts.set(download.suggestedFilename(), backup);
      const parsed = JSON.parse(backup.toString("utf8"));
      assert.equal(parsed.format, "vibekidding-project");
      assert.equal(parsed.version, 1);
      assert.deepEqual(parsed.project, duplicate);
      const before = await saved(page);
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Import backup", exact: true }).click();
      await (await chooser).setFiles({ name: download.suggestedFilename(), mimeType: "application/json", buffer: backup });
      await expect(page.locator(".demo-feedback")).toContainText("Backup imported as a new project and saved");
      const after = await saved(page);
      assert.equal(after.length, before.length + 1);
      const imported = after.find(item => !before.some(previous => previous.id === item.id))!;
      assert.ok(imported);
      assert.equal(imported.title, duplicate.title);
      assert.deepEqual(withoutVersionIds(imported), withoutVersionIds(duplicate));
      const existingIds = new Set(before.flatMap(item => [item.id, ...item.versions.map(version => version.id)]));
      assert.ok(!existingIds.has(imported.id));
      assert.ok(imported.versions.every(version => !existingIds.has(version.id)));
      for (const previous of before) assert.deepEqual(after.find(item => item.id === previous.id), previous);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByLabel("My idea", { exact: true })).toBeEnabled();
      assert.deepEqual(await saved(page), after);
    });
    await step("invalid backup produces actionable error without changing saved projects", async () => {
      const before = await saved(page);
      await page.getByLabel("Import project backup", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("not valid JSON") });
      await expect(page.locator(".demo-alert")).toContainText("isn’t valid JSON");
      await expect(page.locator(".demo-alert")).toContainText("Choose a VibeKidding project backup (.json)");
      assert.deepEqual(await saved(page), before);
      await page.getByLabel("Import project backup", { exact: true }).setInputFiles({ name: "wrong-format.json", mimeType: "application/json", buffer: Buffer.from('{"format":"another-app"}') });
      await expect(page.locator(".demo-alert")).toContainText("Use Export backup to create one");
      assert.deepEqual(await saved(page), before);
      await page.locator(".demo-project-card").filter({ has: page.getByRole("heading", { name: renamed, exact: true }) }).click();
      await expect(page.locator("#preview-heading")).toHaveText(renamed);
    });
    await step("delete cancellation retains project; confirmation persists removal", async () => {
      const before = await saved(page);
      await page.getByRole("button", { name: `Delete ${renamed}`, exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Say goodbye to this project?", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Keep exploring", exact: true }).click();
      assert.ok((await saved(page)).some(item => item.id === generatedId));
      await page.getByRole("button", { name: `Delete ${renamed}`, exact: true }).click();
      await page.getByRole("button", { name: "Delete project", exact: true }).click();
      await expect(page.locator(".demo-feedback")).toContainText("Project deleted from this browser");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByLabel("My idea", { exact: true })).toBeEnabled();
      assert.equal((await saved(page)).length, before.length - 1);
      assert.equal((await saved(page)).some(item => item.id === generatedId), false);
      await expect(page.locator(".demo-project-card")).toHaveCount(before.length - 1);
    });
    await step("mobile layout has no page-level horizontal overflow", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      artifacts.set("03-mobile.png", await page.screenshot({ fullPage: true, caret: "initial" }));
    });
    await step("dictation controls preserve typed ideas without activating the microphone", async () => {
      const input = page.getByLabel("My idea", { exact: true });
      await input.fill("Make a garden drawing pad");
      const generationRequests: string[] = [];
      const observe = (request: import("@playwright/test").Request) => {
        if (new URL(request.url()).pathname === "/api/demo/generate" && request.method() === "POST") generationRequests.push(request.url());
      };
      page.on("request", observe);
      await expect(page.getByRole("region", { name: "Optional voice dictation" })).toContainText("Your browser may send speech to its speech service");
      await page.locator("#demo-speech-language").selectOption("de-DE");
      await expect(input).toHaveValue("Make a garden drawing pad");
      await expect(page.locator("#demo-speech-language")).toHaveValue("de-DE");
      await expect(page.locator(".demo-dictation-area")).toContainText("Dictation never starts a build");
      await expect(page.locator(".demo-dictation-area")).toContainText("dictation does not translate");
      // Do not click the microphone control or supply any fake transcripts.
      const dictate = page.getByRole("button", { name: "Dictate an idea", exact: true });
      if (await dictate.count()) {
        await expect(dictate).toBeEnabled();
        const limit = Number(await input.getAttribute("maxlength"));
        await input.fill("a".repeat(limit));
        await expect(dictate).toBeDisabled();
        await expect(page.locator(".demo-dictation")).toContainText("Your idea is full");
      }
      await input.fill("Make a garden drawing pad");
      assert.deepEqual(generationRequests, []);
      page.off("request", observe);
    });
    await step("speech-unavailable fallback remains typeable without microphone activation", async () => {
      const fallback = await browser.newContext();
      // Feature-unavailable simulation only. No fake recognizer, transcript,
      // microphone permission, audio capture or speech-service acceptance.
      await fallback.addInitScript(() => {
        Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
        Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
      });
      const fallbackPage = await fallback.newPage();
      fallbackPage.on("pageerror", error => pageErrors.push(error.message));
      const posts: string[] = [];
      fallbackPage.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
      try {
        await fallbackPage.goto(new URL("/demo", base).href, { waitUntil: "domcontentloaded" });
        const region = fallbackPage.getByRole("region", { name: "Optional voice dictation" });
        await expect(region).toContainText("Browser dictation is not supported here");
        await expect(region).toContainText("Type your idea");
        await expect(region.getByRole("button", { name: "Dictate an idea", exact: true })).toHaveCount(0);
        await fallbackPage.getByLabel("My idea", { exact: true }).fill("Make a space story");
        await expect(fallbackPage.getByRole("button", { name: "Bring my idea to life", exact: true })).toBeEnabled();
        assert.deepEqual(posts, []);
        artifacts.set("04-dictation-unavailable.png", await fallbackPage.screenshot({ fullPage: true, caret: "initial" }));
      } finally { await fallback.close(); }
    });
    await step("every ready-to-play starter accepts a real supported color revision", async () => {
      const starterContext = await browser.newContext();
      const starterPage = await starterContext.newPage();
      starterPage.on("pageerror", error => pageErrors.push(error.message));
      try {
        await starterPage.goto(new URL("/demo", base).href, { waitUntil: "domcontentloaded" });
        for (const name of ["Rainbow studio", "Animal match", "Space explorer"]) {
          await starterPage.getByRole("button", { name: new RegExp(`${name}.*Make this mine`) }).click();
          const original = (await saved(starterPage))[0];
          const revised = await build(starterPage, "Make it blue", true);
          assert.notEqual(revised.html, original.versions[0].html, `${name} must apply its advertised color revision`);
          const project = (await saved(starterPage)).find(item => item.id === original.id)!;
          assert.equal(project.versions.length, 2);
          assert.deepEqual(project.versions[0], original.versions[0]);
          const marker = revised.html.match(/<!--vibekidding-demo-template:([^\n]*?)-->/);
          assert.ok(marker, `${name} must retain editable template metadata`);
          assert.equal(JSON.parse(marker[1]).color, "#2563eb");
          if (name === "Rainbow studio") {
            await expect(starterPage.frameLocator("iframe.demo-frame").locator("#color")).toHaveValue("#2563eb");
          }
        }
        await step("no-op revision preserves history and the typed request", async () => {
          const before = await saved(starterPage);
          await starterPage.getByLabel("My next change", { exact: true }).fill("Make it blue");
          const pending = starterPage.waitForResponse(response => new URL(response.url()).pathname === "/api/demo/generate" && response.request().method() === "POST");
          await starterPage.getByRole("button", { name: "Make this change", exact: true }).click();
          assert.equal((await pending).status(), 200);
          await expect(starterPage.locator(".demo-feedback")).toContainText("No changes were made");
          await expect(starterPage.locator(".demo-feedback")).toContainText("history are unchanged");
          await expect(starterPage.getByLabel("My next change", { exact: true })).toHaveValue("Make it blue");
          assert.deepEqual(await saved(starterPage), before);
        });
      } finally { await starterContext.close(); }
    });
    await step("two-tab conflict preserves saved work and offers backup/reload recovery", async () => {
      const shared = await browser.newContext();
      shared.on("page", opened => opened.on("pageerror", error => pageErrors.push(error.message)));
      const first = await shared.newPage();
      const stale = await shared.newPage();
      try {
        // Both tabs load the same empty baseline before either writes.
        for (const tab of [first, stale]) {
          await tab.goto(new URL("/demo", base).href, { waitUntil: "domcontentloaded" });
          await expect(tab.getByLabel("My idea", { exact: true })).toBeEnabled();
        }
        await first.bringToFront();
        await first.getByRole("button", { name: /Rainbow studio.*Make this mine/ }).click();
        const originalShelf = await saved(first);
        assert.equal(originalShelf.length, 1);
        await stale.bringToFront();
        await stale.getByRole("button", { name: /Animal match.*Make this mine/ }).click();
        await expect(stale.locator(".demo-alert")).toContainText("Another tab changed your saved shelf");
        await expect(stale.locator(".demo-alert")).toContainText("not saved");
        await expect(stale.locator("#preview-heading")).toHaveText("Ocean Memory Match");
        await expect(stale.locator(".demo-feedback")).not.toContainText("saved in this browser");
        assert.deepEqual(await saved(stale), originalShelf);
        // Preserve the unsaved creation through the actual backup download.
        const pending = stale.waitForEvent("download");
        await stale.getByRole("button", { name: "Export backup", exact: true }).click();
        const download = await pending;
        const downloadedPath = await download.path();
        assert.ok(downloadedPath);
        const backup = await readFile(downloadedPath);
        assert.equal(JSON.parse(backup.toString("utf8")).project.title, "Ocean Memory Match");
        artifacts.set("conflict-recovery.vibekidding.json", backup);
        let warned = false;
        stale.once("dialog", dialog => { warned = /unsaved|not saved|backup/i.test(dialog.message()); void dialog.dismiss(); });
        await stale.getByRole("button", { name: "Reload saved shelf", exact: true }).click();
        assert.equal(warned, true);
        await expect(stale.locator("#preview-heading")).toHaveText("Ocean Memory Match");
        assert.deepEqual(await saved(stale), originalShelf);
        stale.once("dialog", dialog => { void dialog.accept(); });
        await stale.getByRole("button", { name: "Reload saved shelf", exact: true }).click();
        await expect(stale.getByLabel("My idea", { exact: true })).toBeEnabled();
        await expect(stale.locator(".demo-project-card")).toHaveCount(1);
        assert.deepEqual(await saved(stale), originalShelf);
        await stale.getByLabel("Import project backup", { exact: true }).setInputFiles({ name: "recovered.json", mimeType: "application/json", buffer: backup });
        await expect(stale.locator(".demo-feedback")).toContainText("Backup imported as a new project and saved");
        const recovered = await saved(stale);
        assert.equal(recovered.length, 2);
        assert.deepEqual(recovered.find(item => item.id === originalShelf[0].id), originalShelf[0]);
        assert.ok(recovered.some(item => item.title === "Ocean Memory Match"));
        await first.reload({ waitUntil: "domcontentloaded" });
        await expect(first.getByLabel("My idea", { exact: true })).toBeEnabled();
        assert.deepEqual(await saved(first), recovered);
      } finally { await shared.close(); }
    });
    await step("tic-tac-toe suggestion creates a playable same-device game through the real endpoint", async () => {
      const ticContext = await browser.newContext();
      const ticPage = await ticContext.newPage();
      ticPage.on("pageerror", error => pageErrors.push(error.message));
      try {
        await ticPage.goto(new URL("/demo", base).href, { waitUntil: "domcontentloaded" });
        await ticPage.getByRole("button", { name: "Tic-tac-toe · 2 players", exact: true }).click();
        const prompt = await ticPage.getByLabel("My idea", { exact: true }).inputValue();
        assert.match(prompt, /tic-tac-toe.*same device/i);
        await build(ticPage, prompt);
        await expect(ticPage.locator(".demo-feedback")).toContainText("two-player on the same device");
        const preview = ticPage.frameLocator("iframe.demo-frame");
        const cells = preview.locator("#tic-board button");
        await expect(cells).toHaveCount(9);
        const record = await observePointerFrame(ticPage);
        await record("before first move");
        // X takes the top row while O takes two cells in the second row.
        await cells.nth(0).press("Enter");
        await record("after Enter cell 0");
        await expect(cells.nth(0)).toHaveText("X");
        for (const [index, player] of [[3, "O"], [1, "X"], [4, "O"], [2, "X"]] as const) {
          await readyParentFrame(ticPage);
          await cells.nth(index).click();
          await record(`after pointer cell ${index}`);
          await expect(cells.nth(index)).toHaveText(player);
        }
        await expect(preview.locator("#status")).toContainText("Player X wins");
        await expect(preview.locator("#tic-board button:disabled")).toHaveCount(9);
        assert.equal((await saved(ticPage))[0].versions.length, 1, "Playing must not append project history");
        artifacts.set("06-tic-tac-toe-win.png", await ticPage.screenshot({ fullPage: true, caret: "initial" }));
      } catch (error) {
        artifacts.set("tic-failure.png", await ticPage.screenshot({ fullPage: true }));
        throw error;
      } finally { await ticContext.close(); }
    });
    await step("no uncaught browser runtime errors", async () => { assert.deepEqual(pageErrors, []); });
  } catch (error) {
    failure = error;
    try {
      artifacts.set("failure-dom.html", await page.content());
    } catch {
      // A navigation storm can prevent a stable DOM snapshot; retain original failure.
    }
    await page.screenshot({ fullPage: true, caret: "initial", timeout: 10_000 }).then(buffer => artifacts.set("failure.png", buffer)).catch(() => {});
  } finally {
    await browser.close();
    await mkdir(output, { recursive: true });
    for (const [name, data] of artifacts) await writeFile(path.join(output, name), data);
    await writeFile(path.join(output, "report.json"), JSON.stringify({
      timestamp: new Date().toISOString(), url: new URL("/demo", base).href,
      evidence: "Real installed-browser interactions against loopback app and real demo endpoint. No API fixtures or request mocking. Dictation fallback simulates missing browser APIs only; no microphone activation, speech capture or recognition acceptance. No deployed-service acceptance.",
      passed: !failure, activeStep, passiveVoiceOnly, voicePosts, capabilities, buildModes, steps, pointerDiagnostics, pageErrors, consoleErrors, failedRequests, navigations, developmentMessages,
      failure: failure instanceof Error ? failure.message : failure ? String(failure) : undefined,
    }, null, 2));
  }
  console.log(`Evidence: ${output}`);
  if (failure) throw failure;
  console.log(`PASS: ${steps.length} browser checks. Generation modes: ${buildModes.join(", ")}. Task completion still requires coordinator review.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
