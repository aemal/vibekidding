/** Local root entry against an isolated template server. No provider calls. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium, expect } from '@playwright/test';
const base = new URL(process.env.DEMO_BASE_URL || 'http://127.0.0.1:3218');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
const output = path.resolve(`tests/demo-browser-artifacts/local-studio-${Date.now()}`);
const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const requests = [], errors = [], steps = [];
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== base.origin || request.method() !== 'GET') {
    requests.push(request.method() + ' ' + url.pathname);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
let failure;
try {
  await page.goto(base.href);
  await expect(page.getByRole('complementary', { name: 'Local studio mode' })).toContainText('Local studio - no sign-in needed.');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
  await expect(page.locator('.demo-readiness')).toContainText('Offline templates ready');
  steps.push('Root opens labeled template workshop without sign-in');
  await page.locator('.demo-starter').filter({ has: page.getByRole('heading', { name: 'Remembering notes', exact: true }) }).click();
  const frame = page.frameLocator('iframe.demo-frame');
  await frame.locator('#note').fill('Local root saved note');
  await page.locator('iframe.demo-frame').scrollIntoViewIfNeeded();
  await expect(page.locator('iframe.demo-frame')).toBeInViewport({ ratio: 0.5 });
  await frame.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(frame.locator('#status')).toContainText('Saved in this browser');
  const shelf = await page.evaluate(() => localStorage.getItem('vibekidding-demo-projects-v1'));
  assert.ok(shelf);
  await page.reload();
  await expect(frame.locator('#note')).toHaveValue('Local root saved note');
  steps.push('Starter plays, saves app data and restores on root reload');
  await page.goto(new URL('/demo', base).href);
  await expect(frame.locator('#note')).toHaveValue('Local root saved note');
  assert.equal(await page.evaluate(() => localStorage.getItem('vibekidding-demo-projects-v1')), shelf);
  steps.push('Root and /demo share the same project shelf and app data');
  await page.goto(base.href);
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'local-root-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: 'Local studio mode' })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'local-root-mobile.png') });
  steps.push('Local banner and workshop fit mobile width');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Open account studio', exact: true }).click();
  await expect(page).toHaveURL(new URL('/account-studio', base).href);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Local studio mode' })).toHaveCount(0);
  steps.push('Explicit account entry retains original sign-in UI');
  // Actual root rendering must retain account UI on remote host requests.
  const { status, html } = await new Promise((resolve, reject) => {
    http.get(base, { headers: { host: 'example.com' } }, response => {
      let html = ''; response.setEncoding('utf8');
      response.on('data', chunk => { html += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, html }));
      response.on('error', reject);
    }).on('error', reject);
  });
  assert.equal(status, 200);
  assert.ok(html.includes('Parent sign-in'));
  assert.ok(!html.includes('Local studio - no sign-in needed.'));
  steps.push('Nonloopback Host gets original account root');
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
} catch (error) { failure = error; }
await mkdir(output, { recursive: true });
await page.screenshot({ path: path.join(output, failure ? 'failure.png' : 'account-entry.png'), fullPage: true });
await browser.close();
await writeFile(path.join(output, 'report.json'), JSON.stringify({ steps, requests, errors, failure: failure && String(failure) }, null, 2));
console.log(JSON.stringify({ output, steps, failure: failure && String(failure) }, null, 2));
if (failure) throw failure;
