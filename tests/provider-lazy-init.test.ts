import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function withoutProviderCredentials(source: string) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", source], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("archived generation and transcription routes import without provider credentials or requests", () => {
  const output = withoutProviderCredentials(`
    const assert = require('node:assert/strict');
    assert.equal(process.env.OPENAI_API_KEY, undefined);
    assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
    globalThis.fetch = () => { throw new Error('Unexpected provider request during import'); };
    const translate = require('./src/lib/translate.ts');
    const anthropic = require('./src/lib/anthropic.ts');
    const generate = require('./src/app/api/generate/route.ts');
    const transcribe = require('./src/app/api/transcribe/route.ts');
    for (const fn of [translate.detectLanguage, translate.translateToEnglish, anthropic.generateCode,
      anthropic.generateTitle, generate.POST, transcribe.POST]) assert.equal(typeof fn, 'function');
    console.log('imported without credentials');
  `);
  assert.equal(output, "imported without credentials");
});

test("lazy initialization retains translation fallbacks and validates missing audio before provider use", () => {
  const output = withoutProviderCredentials(`
    const assert = require('node:assert/strict');
    let requests = 0;
    globalThis.fetch = () => { requests++; throw new Error('Unexpected network request'); };
    console.error = () => {};
    const translate = require('./src/lib/translate.ts');
    const transcribe = require('./src/app/api/transcribe/route.ts');
    (async () => {
      assert.equal(await translate.detectLanguage('hello'), 'english');
      assert.equal(await translate.translateToEnglish('hola', 'spanish'), 'hola');
      const response = await transcribe.POST(new Request('http://localhost/api/transcribe', {
        method: 'POST', body: new FormData(),
      }));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'No audio file provided' });
      assert.equal(requests, 0);
      console.log('fallbacks preserved without requests');
    })().catch(() => { process.exitCode = 1; });
  `);
  assert.equal(output, "fallbacks preserved without requests");
});
