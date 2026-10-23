import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfigFromFile } from "@prisma/config";

// Exercise the real consumer of the scoped deepmerge-ts override.
// No environment files, application database or network access are needed.
test("Prisma loads plain nested configuration with the patched merge helper", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "studio-prisma-config-")));
  try {
    await writeFile(join(root, "prisma.config.cjs"),
      "module.exports={schema:'schema.prisma',migrations:{path:'migrations'}}");
    const result = await loadConfigFromFile({ configRoot: root });
    assert.equal(result.error, undefined);
    assert.equal(result.config?.schema, join(root, "schema.prisma"));
    assert.equal(result.config?.migrations?.path, join(root, "migrations"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
