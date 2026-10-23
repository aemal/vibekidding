import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { sourceZip } from "../src/lib/v2-export/zip";

test("source ZIP opens with an independent reader and excludes dependencies, secrets, and data", () => {
  const zip = sourceZip([
    { path: "package.json", content: '{"name":"sample"}' },
    { path: "src/App.tsx", content: 'export const greeting = "Hello 🌱";' },
    ...["node_modules/a/index.js", ".env", ".env.local", ".next/cache/x", "dist/app.js", "data/a.sqlite", "uploads/photo.png", "../escape", "/absolute", "private.pem"].map(path => ({ path, content: "excluded" })),
  ]);
  const read = spawnSync("python3", ["-c", "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))"], { input: zip });
  assert.equal(read.status, 0, read.stderr.toString());
  assert.deepEqual(JSON.parse(read.stdout.toString()), { "package.json": '{"name":"sample"}', "src/App.tsx": 'export const greeting = "Hello 🌱";' });
});
