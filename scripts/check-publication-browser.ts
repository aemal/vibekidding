import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
async function main() {
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {PublishedPreview} from './src/components/PublishedPreview';createRoot(document.getElementById('root')).render(<PublishedPreview username="fixture" slug="project" digest="expected" html="<p>Published fixture</p>" title="Fixture"/>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/bundle.js"></script>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const channel = process.env.STUDIO_TEST_BROWSER || "chrome";
    assert.ok(["chrome", "chromium"].includes(channel));
    browser = await chromium.launch({ channel, headless: true });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    let mode = "ok", checks = 0;
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (!url.pathname.startsWith("/api/published/")) return route.continue();
      checks++;
      if (mode === "hang") return; // Deliberately ignore cancellation until page closes.
      if (mode === "revoked") return route.fulfill({ status: 404, json: { error: "unavailable" } });
      return route.fulfill({ json: { digest: mode === "changed" ? "new-version" : "expected" } });
    });
    await page.clock.install();
    for (const failure of ["revoked", "changed", "hang"]) {
      mode = "ok";
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.locator("iframe").waitFor();
      assert.equal(await page.locator("iframe").getAttribute("sandbox"), "allow-scripts");
      mode = failure; const before = checks;
      await page.clock.runFor(30000);
      if (failure === "hang") await page.clock.runFor(12000);
      await page.getByRole("status").filter({ hasText: "unavailable" }).waitFor();
      assert.equal(await page.locator("iframe").count(), 0);
      mode = "ok";
      await page.clock.runFor(60000);
      assert.equal(checks, before + 1, "stopped previews must not poll or reopen automatically");
    }
    mode = "ok";
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.locator("iframe").waitFor();
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.getByRole("status").filter({ hasText: "Checking" }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    mode = "revoked";
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.getByRole("status").filter({ hasText: "unavailable" }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    assert.deepEqual(errors, []);
    console.log("PASS: actual shared preview removes iframe on revocation, content change, timeout and hidden state; foreground requires revalidation. Synthetic endpoint only.");
  } finally { await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
