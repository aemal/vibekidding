import { test } from "node:test";
import assert from "node:assert/strict";
import { localStudioEnabled } from "../src/lib/demo-server/local-studio";

const local = { NODE_ENV: "development", VIBEKIDDING_DEMO_ENABLED: "1" };
test("local studio opens only for explicit development demo on loopback", () => {
  for (const host of ["127.0.0.1:3219", "localhost:3217", "[::1]:3219"]) {
    const headers = new Headers({ host });
    assert.equal(localStudioEnabled(headers, local), true);
    for (const env of [{}, { ...local, NODE_ENV: "production" }, { ...local, VIBEKIDDING_DEMO_ENABLED: "0" }, { ...local, VIBEKIDDING_PUBLIC_TEMPLATE_DEMO: "1" }])
      assert.equal(localStudioEnabled(headers, env), false);
  }
});
test("remote, cross-site, malformed and forwarded requests retain account UI", () => {
  const cases: Record<string, string>[] = [{ host: "example.com" }, { host: "" }, { host: "invalid host" }, { origin: "https://example.com" }, { "sec-fetch-site": "cross-site" }, { forwarded: "for=127.0.0.1" }, { "x-forwarded-for": "203.0.113.1" }, { "x-forwarded-proto": "ftp" }];
  for (const extra of cases) {
    assert.equal(localStudioEnabled(new Headers({ host: "127.0.0.1:3219", ...extra }), local), false);
  }
  assert.equal(localStudioEnabled(new Headers({ host: "127.0.0.1:3219", "x-forwarded-host": "127.0.0.1:3219", "x-forwarded-proto": "http", "x-forwarded-port": "3219", "x-forwarded-for": "127.0.0.1" }), local), true);
});
