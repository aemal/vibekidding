import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { localTestAccessEnabled, localTestAccount, requireV2Session } from "../src/lib/v2-auth/session";
import { POST as openLocal } from "../src/app/api/v2/auth/local/route";
import { GET as session } from "../src/app/api/v2/auth/session/route";

test("explicit local entry preserves the sole account, refuses public/foreign origins and never selects between accounts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v2-local-entry-"));
  const names = ["VIBEKIDDING_V2_DATA_DIR", "VIBEKIDDING_PUBLIC_MODE", "VIBEKIDDING_LOCAL_TEST_ACCESS", "PUBLIC_ORIGIN"];
  const original = names.map(name => process.env[name]);
  Object.assign(process.env, { VIBEKIDDING_V2_DATA_DIR: root, VIBEKIDDING_PUBLIC_MODE: "0", VIBEKIDDING_LOCAL_TEST_ACCESS: "1", PUBLIC_ORIGIN: "http://localhost:3230" });
  const request = (headers: Record<string, string> = {}) => new Request("http://localhost:3230/api/v2/auth/local", { method: "POST", headers: { host: "localhost:3230", origin: "http://localhost:3230", ...headers } });
  try {
    const state = await (await session(request())).json();
    assert.equal(state.localTestAccess, true);
    const first = await openLocal(request());
    assert.equal(first.status, 200);
    const firstUser = (await first.json()).user;
    assert.equal(firstUser.username, "local-tester");
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    assert.deepEqual(await requireV2Session(new Request("http://localhost:3230", { headers: { cookie } })), firstUser);
    const second = await openLocal(request());
    assert.deepEqual((await second.json()).user, firstUser);

    const foreignHeaders: Record<string, string>[] = [{ host: "example.com" }, { origin: "https://example.com" }, { host: "one.apps.localhost:3230", origin: "http://one.apps.localhost:3230" }];
    for (const headers of foreignHeaders) {
      assert.equal((await openLocal(request(headers))).status, 403);
    }
    process.env.VIBEKIDDING_PUBLIC_MODE = "1";
    assert.equal((await openLocal(request())).status, 403);
    assert.throws(() => localTestAccount(request()), /not enabled/);
    process.env.VIBEKIDDING_PUBLIC_MODE = "0";
    process.env.PUBLIC_ORIGIN = "http://example.com";
    assert.equal(localTestAccessEnabled(request()), false);
    process.env.PUBLIC_ORIGIN = "http://localhost:3230";
    delete process.env.VIBEKIDDING_LOCAL_TEST_ACCESS;
    assert.equal(localTestAccessEnabled(request()), false);
    process.env.VIBEKIDDING_LOCAL_TEST_ACCESS = "1";
    delete process.env.VIBEKIDDING_PUBLIC_MODE;
    assert.equal(localTestAccessEnabled(request()), false);
    process.env.VIBEKIDDING_PUBLIC_MODE = "0";

    const db = new Database(path.join(root, "accounts.sqlite"));
    db.prepare("INSERT INTO accounts(id,username,salt,password_hash,created_at) VALUES(?,?,?,?,?)").run("other-owner", "other-owner", "unused", "unused", Date.now());
    db.close();
    const multiple = await openLocal(request());
    assert.equal(multiple.status, 409);
    assert.match((await multiple.json()).error, /multiple accounts/);
    assert.equal(multiple.headers.get("set-cookie"), null);
  } finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
    await fs.rm(root, { recursive: true, force: true });
  }
});
