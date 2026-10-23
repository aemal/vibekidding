import { test } from "node:test";
import assert from "node:assert/strict";
import { starters } from "../src/components/demo/starters";
import { templateProject } from "../src/lib/demo-server/template";

const settings = (html: string) => JSON.parse(html.match(/<!--vibekidding-demo-template:(.*?)-->/)![1]);

test("all ready-to-play starters carry supported editable template metadata", () => {
  assert.equal(starters.length, 3);
  assert.deepEqual(starters.map(starter => settings(starter.html).kind), ["drawing", "memory", "collector"]);
  for (const starter of starters) {
    assert.match(starter.html, /^<!DOCTYPE html>/);
    assert.match(starter.html, /<\/html>$/);
    assert.equal(templateProject("", starter.html).html, starter.html);
  }
});

for (const starter of starters) {
  test(`${starter.title} supports real color and theme revisions`, () => {
    const original = settings(starter.html);
    const recolored = templateProject("make it blue", starter.html);
    assert.notEqual(recolored.html, starter.html);
    assert.equal(recolored.mode, "template");
    assert.equal(settings(recolored.html).kind, original.kind);
    assert.equal(settings(recolored.html).color, "#2563eb");
    assert.match(recolored.html, /#2563eb/);
    assert.doesNotMatch(recolored.message, /unchanged/);
    const nextTheme = original.theme === "garden" ? "ocean" : "garden";
    const themed = templateProject(`change the theme to ${nextTheme}`, recolored.html);
    assert.notEqual(themed.html, recolored.html);
    assert.equal(settings(themed.html).theme, nextTheme);
    assert.equal(settings(themed.html).kind, original.kind);
    assert.equal(settings(themed.html).color, "#2563eb");
  });
}

test("unsupported edits to a recognized starter remain identical for no-op detection", () => {
  for (const starter of starters) {
    const result = templateProject("add multiplayer networking", starter.html);
    assert.equal(result.html, starter.html);
    assert.match(result.message, /Other instructions are not applied/);
  }
});
