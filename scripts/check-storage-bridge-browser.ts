import { build } from "esbuild";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
async function main() {
  const bundle = await build({ stdin: { contents: `
    import {AppStorageDispatcher} from './src/lib/studio/app-storage-dispatcher';
    const frame=document.querySelector('iframe');
    window.calls=[];window.signals=[];
    const dispatcher=new AppStorageDispatcher({applicationOrigin:location.origin,executionOrigin:'https://runtime.fixture.test',
      source:frame.contentWindow,session:'synthetic_session_123',projectId:'11111111-1111-4111-8111-111111111111',durationMs:300000,
      call:async(input,signal)=>{window.calls.push(input);window.signals.push(signal);
        if(input.key==='hang')return new Promise(resolve=>window.finish=resolve);
        return {value:'saved',secret:'parent-only-secret'};}});
    window.addEventListener('message',event=>void dispatcher.handle(event));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)dispatcher.close();});
    window.ready=true;
  `, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false });
  const browser = await chromium.launch({ channel: process.env.STUDIO_TEST_BROWSER || "chrome", headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === "https://studio.fixture.test") return route.fulfill({ contentType: "text/html", body:
        `<iframe src="https://runtime.fixture.test/" sandbox="allow-scripts allow-same-origin"></iframe><script>${bundle.outputFiles[0].text}</script>` });
      if (url.origin === "https://runtime.fixture.test") return route.fulfill({ contentType: "text/html", body:
        `<script>window.replies=[];addEventListener('message',e=>{if(e.source===parent&&e.origin==='https://studio.fixture.test')replies.push(JSON.parse(e.data));});</script>` });
      return route.abort();
    });
    await page.goto("https://studio.fixture.test"); await page.waitForFunction("window.ready");
    const frame = page.frames().find(f => f.url().startsWith("https://runtime.fixture.test")); assert.ok(frame);
    const send = (n: number, extra: object = {}) => frame.evaluate(({n,extra}) => parent.postMessage(JSON.stringify({ version:1,
      session:"synthetic_session_123",requestId:`22222222-2222-4222-8222-${String(n).padStart(12,"0")}`,
      operation:"record.read",key:"score",...extra }), "https://studio.fixture.test"), {n,extra});
    await send(1); await frame.waitForFunction("window.replies.length===1");
    assert.deepEqual(await frame.evaluate("window.replies[0].value"), "saved");
    assert.equal(await frame.evaluate("JSON.stringify(window.replies).includes('secret')"), false);
    assert.equal(await frame.evaluate(() => { try { return !!parent.document; } catch { return false; } }), false);
    await send(1); await send(2,{userId:"victim"}); await send(3,{projectId:"victim"});
    await send(4,{operation:"ai.generate",prompt:"hi"});
    // A valid later message is an ordering barrier for earlier rejected messages.
    await send(5); await frame.waitForFunction("window.replies.length===2");
    assert.equal(await page.evaluate("window.calls.length"), 2);
    await send(6,{key:"hang"}); await page.waitForFunction("window.calls.length===3");
    await page.evaluate(() => { Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange")); });
    assert.equal(await page.evaluate("window.signals[2].aborted"), true);
    await page.evaluate("window.finish({value:'late-private'})");
    await send(7);
    // Flush browser task queues before checking that the closed dispatcher stayed closed.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
    assert.equal(await page.evaluate("window.calls.length"), 3);
    assert.equal(await frame.evaluate("window.replies.length"), 2);
    assert.deepEqual(errors, []);
    console.log("PASS: Chromium two-origin dispatcher fixture: scoped requests, parent DOM denial, response filtering, replay/authority rejection and close/late-result suppression. Synthetic transport only; runtime shell and deployment not accepted.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
