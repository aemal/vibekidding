import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { GeneratedPreview } from '../src/components/GeneratedPreview';
import nextConfig from '../next.config';

async function main() {
// Synthetic isolated fixture, not the live application or a signed-in browser profile.
let probes = 0;
let document = '';
const headers = (await nextConfig.headers!())[0].headers;
const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url !== '/') { probes++; res.writeHead(200); res.end('unexpected probe'); return; }
  for (const header of headers) res.setHeader(header.key, header.value);
  res.setHeader('Content-Type', 'text/html');
  res.end(document);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const payload = `<p id="fixture">Synthetic preview</p><script>
(async () => {
 const result = {};
 try { parent.document.body.dataset.compromised='yes'; result.parentBlocked=false; } catch { result.parentBlocked=true; }
 try { localStorage.setItem('probe','synthetic'); result.storageBlocked=false; } catch { result.storageBlocked=true; }
 try { await fetch('${origin}/probe'); result.fetchBlocked=false; } catch { result.fetchBlocked=true; }
 result.popupBlocked = window.open('${origin}/probe','_blank') === null;
 result.deniedFeatures = ['camera','microphone','geolocation','clipboard-read','clipboard-write','display-capture','payment','usb','fullscreen'].every(feature => !document.featurePolicy.allowsFeature(feature));
 const img = new Image(); img.src='${origin}/probe';
 const form = document.createElement('form');form.action='${origin}/probe';document.body.append(form);form.submit();
 try { top.location.href='${origin}/probe'; result.topBlocked=false; } catch { result.topBlocked=true; }
 parent.postMessage({fixtureResult:result}, '*');
})();
</script>`;
document = '<!doctype html><html><body><script>window.fixtureResult=null;addEventListener("message",event=>{if(event.source===document.querySelector("iframe").contentWindow)window.fixtureResult=event.data.fixtureResult;});</script>' + renderToStaticMarkup(createElement(GeneratedPreview, {html:payload,title:'Synthetic preview'})) + '</body></html>';
let browser;
try {
 const channel=process.env.STUDIO_TEST_BROWSER || 'chrome';
 assert.ok(['chrome','chromium'].includes(channel),'Use chrome or chromium for the preview fixture');
 browser = await chromium.launch({channel,headless:true});
 const page = await browser.newPage();
 await page.goto(origin);
 await page.waitForFunction(() => (window as unknown as {fixtureResult:unknown}).fixtureResult !== null);
 const result = await page.evaluate(() => (window as unknown as {fixtureResult:Record<string,boolean>}).fixtureResult);
 for (const [check, passed] of Object.entries(result)) assert.equal(passed,true,check);
 assert.equal(Object.keys(result).length,6);
 await page.waitForTimeout(300);
 assert.equal(probes,0,'unexpected network request escaped fixture');
 assert.equal(page.url(),origin+'/');
 console.log(`PASS: ${Object.keys(result).join(', ')}; zero local probe requests. ${channel} ${browser.version()}.`);
 console.log('Synthetic local browser check only. No live account, provider, deployment, cross-browser or CPU-isolation acceptance.');
} finally {
 await browser?.close();
 await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
