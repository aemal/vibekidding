import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPassword, endSession, needsSetup, newSession, requireV2Session, sameOriginMutation, sessionCookie, setupAccount } from "../src/lib/v2-auth/session";

test("account setup, independent sessions and logout survive database reconnects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vk-auth-"));
  const old = process.env.VIBEKIDDING_V2_DATA_DIR;
  process.env.VIBEKIDDING_V2_DATA_DIR = root;
  try {
    assert.equal(needsSetup(), true);
    const user = await setupAccount("Ash", "test password only");
    assert.equal(needsSetup(), false);
    await assert.rejects(() => setupAccount("another", "another password"), /already has/);
    assert.equal(await checkPassword("ash", "wrong"), null);
    assert.deepEqual(await checkPassword("ASH", "test password only"), user);
    const first = newSession(user), second = newSession(user);
    const request = (token: string) => new Request("http://ash.localhost:3000/api/v2/projects", { headers: { cookie: `vk_studio_session=${token}` } });
    assert.deepEqual(await requireV2Session(request(first)), user);
    assert.deepEqual(await requireV2Session(request(second)), user);
    assert.equal(await requireV2Session(request("a".repeat(64))), null);
    endSession(request(first));
    assert.equal(await requireV2Session(request(first)), null);
    assert.deepEqual(await requireV2Session(request(second)), user);
    assert.match(sessionCookie(request(second), second), /HttpOnly; SameSite=Lax/);
  } finally {
    if (old === undefined) delete process.env.VIBEKIDDING_V2_DATA_DIR; else process.env.VIBEKIDDING_V2_DATA_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("mutation origin validation permits same-host requests and rejects foreign origins", () => {
  const req = (origin: string) => new Request("http://ash.localhost:3000/api/v2/auth/login", { headers: { origin, host: "ash.localhost:3000" } });
  assert.equal(sameOriginMutation(req("http://ash.localhost:3000")), true);
  assert.equal(sameOriginMutation(req("https://other.example")), false);
});
