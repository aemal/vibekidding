import { test } from "node:test";
import assert from "node:assert/strict";
import { demoAccessError } from "../src/lib/demo-server/access";
import { createDemoHandlers } from "../src/lib/demo-server/handler";
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

const navigation = {
  host: "localhost:3218", "sec-fetch-site": "cross-site",
  "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-user": "?1",
};
test("external user-followed document links open local UI without changing request headers or API access", async () => {
  for (const site of ["cross-site", "same-site"]) {
    const headers = new Headers({ ...navigation, "sec-fetch-site": site });
    assert.equal(localStudioEnabled(headers, local), true);
    assert.equal(headers.get("sec-fetch-site"), site);
    const request = new Request("http://localhost:3218/api/demo/generate", {
      method: "POST", headers: new Headers([...headers, ["content-type", "application/json"]]),
      body: JSON.stringify({ prompt: "Should not generate" }),
    });
    assert.ok(demoAccessError(request, local));
    const handler = createDemoHandlers({ environment: () => local, fetcher: async () => { throw Error("Provider must not run"); } });
    assert.equal((await handler.POST(request)).status, 403);
  }
});
test("navigation exception retains production, host, forwarding, fetch, frame and form restrictions", () => {
  for (const env of [{ ...local, NODE_ENV: "production" }, { ...local, VIBEKIDDING_PUBLIC_TEMPLATE_DEMO: "1" }, { ...local, VIBEKIDDING_DEMO_ENABLED: "0" }])
    assert.equal(localStudioEnabled(new Headers(navigation), env), false);
  const cases: Record<string, string>[] = [
    { host: "example.com" }, { "x-forwarded-for": "203.0.113.1" }, { "x-forwarded-host": "example.com" },
    { forwarded: "for=127.0.0.1" }, { "sec-fetch-mode": "cors" }, { "sec-fetch-dest": "iframe" },
    { "sec-fetch-dest": "empty" }, { "sec-fetch-user": "" }, { origin: "https://example.com" }, { origin: "null" },
  ];
  for (const extra of cases)
    assert.equal(localStudioEnabled(new Headers({ ...navigation, ...extra }), local), false);
});
