import { build } from "esbuild";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
async function bundle(contents: string) {
  return (await build({ stdin: { contents, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false })).outputFiles[0].text;
}
async function main() {
  const parentBundle = await bundle(`import {AppStorageDispatcher} from './src/lib/studio/app-storage-dispatcher';
    window.calls=[];const f=document.querySelector('iframe');const d=new AppStorageDispatcher({applicationOrigin:location.origin,
    executionOrigin:'https://runtime.fixture.test',source:f.contentWindow,session:'synthetic_session_123',projectId:'11111111-1111-4111-8111-111111111111',durationMs:300000,
    call:async input=>{window.calls.push(input);return {value:'7',token:'never-forward'};}});addEventListener('message',e=>{void d.handle(e);if(e.source===f.contentWindow&&e.origin==='https://runtime.fixture.test'&&e.data===JSON.stringify({version:1,operation:'runtime.ready'}))window.runtimeReady=true;});
    window.sendRuntime=data=>f.contentWindow.postMessage(JSON.stringify(data),'https://runtime.fixture.test');`);
  const runtime = await bundle(`import {installAppRuntimeBootstrap} from './src/lib/studio/app-runtime-bootstrap';
    window.bootstrap=installAppRuntimeBootstrap({applicationOrigin:'https://studio.fixture.test',container:document.body});`);
  const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || "chrome", headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", route => {
      const origin = new URL(route.request().url()).origin;
      if (origin === "https://studio.fixture.test") return route.fulfill({ contentType:"text/html",body:`<iframe sandbox="allow-scripts allow-same-origin" src="https://runtime.fixture.test"></iframe><script>${parentBundle}</script>` });
      if (origin === "https://runtime.fixture.test") return route.fulfill({ contentType:"text/html",body:`<body><script>${runtime}</script></body>` });
      return route.abort();
    });
    await page.goto("https://studio.fixture.test");
    const shell = page.frames().find(f=>f.url().startsWith("https://runtime.fixture.test")); assert.ok(shell);
    await page.waitForFunction("window.runtimeReady");
    const init = {version:1,operation:"runtime.init",session:"synthetic_session_123",html:'<p id="result">Ready</p>'};
    // Same-origin messages from the runtime itself cannot impersonate its parent.
    await shell.evaluate(data => window.postMessage(JSON.stringify(data),location.origin),init);
    await page.evaluate("window.sendRuntime({version:1,operation:'runtime.init',session:'bad',html:'bad'})");
    assert.equal(await shell.locator("iframe").count(),0);
    await page.evaluate(data => (window as unknown as {sendRuntime:(x:unknown)=>void}).sendRuntime(data),init);
    await shell.locator("iframe").waitFor();
    const inner = shell.childFrames()[0]; assert.ok(inner); await inner.locator("#result").waitFor();
    assert.equal(await shell.locator("iframe").getAttribute("sandbox"), "allow-scripts");
    assert.equal(await inner.evaluate("window.vibeStorage.read('score')"), "7");
    assert.equal(await inner.evaluate("window.vibeStorage.write('score','8')"), "7");
    assert.equal(await page.evaluate("window.calls.length"), 2);
    assert.equal(await inner.evaluate(() => { try { return !!parent.document; } catch { return false; } }), false);
    assert.equal(await inner.evaluate(() => { try { localStorage.setItem("probe","yes");return true; } catch { return false; } }), false);
    assert.equal(await inner.evaluate(async () => { try { await fetch("https://studio.fixture.test/probe");return true; } catch { return false; } }), false);
    // The untrusted app cannot skip the shell: the dispatcher expects the outer WindowProxy.
    await inner.evaluate(() => top!.postMessage(JSON.stringify({version:1,session:"synthetic_session_123",requestId:"33333333-3333-4333-8333-333333333333",operation:"record.read",key:"score"}),"https://studio.fixture.test"));
    assert.equal(await inner.evaluate("window.vibeStorage.read('score')"), "7");
    assert.equal(await page.evaluate("window.calls.length"), 3);
    await page.evaluate("window.sendRuntime({version:1,operation:'runtime.init',session:'synthetic_session_123',html:'replacement'})");
    await page.evaluate("window.sendRuntime({version:1,operation:'runtime.close',session:'wrong_session_123'})");
    assert.equal(await inner.evaluate("window.vibeStorage.read('score')"), "7");
    assert.equal(await inner.locator("#result").textContent(),"Ready");
    await page.evaluate("window.sendRuntime({version:1,operation:'runtime.close',session:'synthetic_session_123'})");
    await shell.locator("iframe").waitFor({state:"detached"});
    await page.evaluate(data => (window as unknown as {sendRuntime:(x:unknown)=>void}).sendRuntime(data),init);
    await page.evaluate(() => new Promise(resolve=>setTimeout(resolve,50)));
    assert.equal(await shell.locator("iframe").count(),0);
    // An idle shell expires without accepting a later initialization.
    await page.clock.install();
    await page.goto("https://studio.fixture.test"); await page.waitForFunction("window.runtimeReady");
    await page.clock.runFor(10001);
    await page.evaluate(data => (window as unknown as {sendRuntime:(x:unknown)=>void}).sendRuntime(data),init);
    await page.clock.runFor(1);
    const expiredShell=page.frames().find(f=>f.url().startsWith("https://runtime.fixture.test"));assert.ok(expiredShell);
    assert.equal(await expiredShell.locator("iframe").count(),0);
    assert.deepEqual(errors, []);
    console.log("PASS: real shell plus parent dispatcher across two synthetic HTTPS origins: inner SDK read/write, sandbox DOM/storage/network denial, direct-parent bypass rejection, startup source/origin binding and expiry, duplicate initialization rejection and teardown. No live storage or deployment acceptance.");
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
