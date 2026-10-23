/**
 * Real /demo acceptance against an already-running loopback Next.js server.
 * Run: DEMO_BASE_URL=http://127.0.0.1:3217 npx tsx scripts/check-demo-browser.ts
 * Start the server separately with VIBEKIDDING_DEMO_ENABLED=1 and template mode.
 * No requests are mocked. A fresh browser context never touches a user's shelf.
 * AI capability requires DEMO_TEST_ALLOW_AI=1; template runs make no provider calls.
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
      assert.ok(capabilities?.mode === "template" || process.env.DEMO_TEST_ALLOW_AI === "1", "Backend advertises AI. Use a template-only server for repeatable local acceptance, or explicitly opt in with DEMO_TEST_ALLOW_AI=1.");
      const response = await page.goto(new URL("/demo", base).href, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("workshop");
      await expect(page.getByLabel("My idea", { exact: true })).toBeEnabled();
      assert.deepEqual(await saved(page), []);
      artifacts.set("01-empty.png", await page.screenshot({ fullPage: true, caret: "initial" }));
    });
    await step("starter creation and playable isolated preview", async () => {
      await page.getByRole("button", { name: /Space explorer.*Make this mine/ }).click();
      await expect(page.locator("#preview-heading")).toHaveText("Space explorer");
      const preview = page.frameLocator("iframe.demo-frame");
      await preview.getByRole("button", { name: "Mars", exact: true }).click();
      await expect(preview.locator("#name")).toHaveText("Mars");
      await expect(preview.locator("#result")).toContainText("rusty minerals");
      await expect(page.locator("iframe.demo-frame")).toHaveAttribute("sandbox", "allow-scripts");
      assert.equal((await saved(page)).length, 1);
    });
    await step("public template mode is labeled without AI claims", async () => {
      if (capabilities?.publicTemplateOnly) {
        await expect(page.locator(".demo-header .demo-tag")).toHaveText("TEMPLATE DEMO");
        await expect(page.locator(".demo-readiness")).toContainText("Templates ready · no AI calls");
        await expect(page.locator(".demo-note")).toContainText("this demo makes no AI provider calls");
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
        await preview.getByRole("button", { name: "Start game", exact: true }).click();
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
      await page.getByRole("dialog").getByLabel("Project name").fill(renamed);
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
      await expect(page.getByRole("dialog")).toBeVisible();
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
      evidence: "Real installed-browser interactions against loopback app and real demo endpoint. No API fixtures or request mocking. No production/deployment acceptance.",
      passed: !failure, activeStep, capabilities, buildModes, steps, pageErrors, consoleErrors, failedRequests, navigations, developmentMessages,
      failure: failure instanceof Error ? failure.message : failure ? String(failure) : undefined,
    }, null, 2));
  }
  console.log(`Evidence: ${output}`);
  if (failure) throw failure;
  console.log(`PASS: ${steps.length} browser checks. Generation modes: ${buildModes.join(", ")}. Task completion still requires coordinator review.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
