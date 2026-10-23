/** Real cross-site anchor navigation; isolated template dev server, no provider calls. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const base = new URL(process.env.DEMO_BASE_URL || 'http://localhost:3218');
const production = new URL(process.env.DEMO_PRODUCTION_URL || 'http://localhost:3217');
for (const url of [base, production]) assert.equal(url.hostname, 'localhost');
const output = path.resolve(`tests/demo-browser-artifacts/local-navigation-${Date.now()}`);
const source = http.createServer((_request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end(`<a href="${base.href}">Open local studio</a><a href="${production.href}">Open production root</a>`);
});
await new Promise(resolve => source.listen(0, '127.0.0.1', resolve));
const sourceUrl = new URL(`http://127.0.0.1:${source.address().port}/`);
const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const blocked = [], errors = [], navigations = [], steps = [];
const allowed = new Set([base.origin, production.origin, sourceUrl.origin]);
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (!allowed.has(url.origin) || request.method() !== 'GET') {
    blocked.push(request.method() + ' ' + url.pathname); return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
// Fetch metadata is added after Playwright route interception; capture Chromium's
// actual outgoing headers instead of treating route-time headers as wire evidence.
const cdp = await context.newCDPSession(page), documentRequests = new Map(), extraHeaders = new Map();
await cdp.send('Network.enable');
cdp.on('Network.requestWillBeSent', event => {
  const url = new URL(event.request.url);
  if (event.type === 'Document' && url.pathname === '/' && [base.origin, production.origin].includes(url.origin))
    documentRequests.set(event.requestId, url.href);
});
cdp.on('Network.requestWillBeSentExtraInfo', event => {
  extraHeaders.set(event.requestId, Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value])));
});
function documentNavigation(url) {
  for (const [id, target] of documentRequests) {
    if (target === url && extraHeaders.has(id)) return { url, headers: extraHeaders.get(id) };
  }
}
page.on('pageerror', error => errors.push(error.message));
let failure;
try {
  await page.goto(sourceUrl.href);
  await page.getByRole('link', { name: 'Open local studio', exact: true }).click();
  await expect(page).toHaveURL(base.href);
  await expect(page.getByRole('complementary', { name: 'Local studio mode' })).toBeVisible();
  await expect(page.locator('.demo-readiness')).toContainText('Offline templates ready');
  const entry = documentNavigation(base.href);
  navigations.push(entry);
  assert.ok(entry);
  assert.equal(entry.headers['sec-fetch-site'], 'cross-site');
  assert.equal(entry.headers['sec-fetch-mode'], 'navigate');
  assert.equal(entry.headers['sec-fetch-dest'], 'document');
  assert.equal(entry.headers['sec-fetch-user'], '?1');
  steps.push('Actual external-site anchor opens local workshop with cross-site document metadata');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'external-link-workshop.png') });
  await page.goto(sourceUrl.href);
  await page.getByRole('link', { name: 'Open production root', exact: true }).click();
  await expect(page).toHaveURL(production.href);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Local studio mode' })).toHaveCount(0);
  const productionEntry = documentNavigation(production.href);
  navigations.push(productionEntry);
  assert.equal(productionEntry?.headers['sec-fetch-site'], 'cross-site');
  steps.push('Same external-link navigation to existing production root retains account sign-in');
  // Verify actual Next mutation rejection, including forged document-navigation metadata.
  const rejected = await new Promise((resolve, reject) => {
    const request = http.request(new URL('/api/demo/generate', base), {
      method: 'POST', headers: {
        'content-type': 'application/json', 'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-user': '?1',
      },
    }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body })); response.on('error', reject);
    });
    request.on('error', reject); request.end(JSON.stringify({ prompt: 'Must not generate' }));
  });
  assert.equal(rejected.status, 403);
  assert.match(rejected.body, /Cross-site demo requests are disabled/);
  steps.push('Actual cross-site generation POST remains rejected even with navigation metadata');
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
} catch (error) { failure = error; }
await mkdir(output, { recursive: true });
if (failure) await page.screenshot({ path: path.join(output, 'failure.png') });
await browser.close(); await new Promise(resolve => source.close(resolve));
await writeFile(path.join(output, 'report.json'), JSON.stringify({ steps, navigations, blocked, errors, failure: failure && String(failure) }, null, 2));
console.log(JSON.stringify({ output, steps, failure: failure && String(failure) }, null, 2));
if (failure) throw failure;
