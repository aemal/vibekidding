import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { templateProject } from "../src/lib/demo-server/template";

function settings(html: string) {
  return JSON.parse(html.match(/<!--vibekidding-demo-template:(.*?)-->/)![1]);
}

for (const [prompt, kind, title, behavior] of [
  ["space memory matching pairs", "memory", "Space Memory Match", "Memory cards"],
  ["ocean drawing canvas", "drawing", "Ocean Art Studio", "Drawing canvas"],
  ["garden arithmetic quiz", "math", "Garden Number Quest", "Answer choices"],
  ["ocean choose-your-own adventure story", "story", "Ocean Story Adventure", "Story choices"],
  ["garden tic-tac-toe", "tictactoe", "Garden Tic-Tac-Toe", "Tic-tac-toe board"],
] as const) {
  test(`${kind} creates a distinct self-contained interactive template`, () => {
    const project = templateProject(prompt);
    assert.equal(project.mode, "template");
    assert.equal(project.title, title);
    assert.equal(settings(project.html).kind, kind);
    assert.match(project.html, new RegExp(behavior));
    assert.ok(!project.html.includes('id="target"'));
    assert.match(project.message, /not AI generation/);
    assert.match(project.message, /Other instructions are not applied/);
    assert.ok(Buffer.byteLength(project.html) < 80000);
    assert.doesNotMatch(project.html, /https?:\/\/|fetch\(|localStorage|sessionStorage|<script[^>]+src=/);
    const script = project.html.match(/<script>([\s\S]*?)<\/script>/)![1];
    assert.doesNotThrow(() => new Script(script));
  });
}

test("theme, color and difficulty revisions retain the selected template", () => {
  for (const kind of ["memory", "drawing", "math", "story", "tictactoe"]) {
    const first = templateProject(`${kind} in space`);
    const revised = templateProject("make it ocean blue and harder", first.html);
    assert.deepEqual(settings(revised.html), { theme: "ocean", color: "#2563eb", seconds: 15, goal: 20, kind });
    assert.match(revised.title, /Ocean/);
    if (kind === "memory") assert.match(revised.html, /Find 8 matching pairs/);
    if (kind === "math") assert.match(revised.html, /Numbers go up to 20/);
    if (kind === "drawing" || kind === "story" || kind === "tictactoe") assert.match(revised.message, /Difficulty changes do not affect/);
  }
});

test("explicit kind revisions switch mechanics while retaining the prior theme", () => {
  const drawing = templateProject("draw an ocean world");
  const memory = templateProject("make it a memory game", drawing.html);
  assert.equal(memory.title, "Ocean Memory Match");
  const collector = templateProject("change to a collector", memory.html);
  assert.equal(collector.title, "Ocean Explorer");
  assert.match(collector.html, /id="target"/);
});

test("legacy collector markers still revise and malformed kinds preserve custom HTML", () => {
  const original = templateProject("space collecting").html.replace(',"kind":"collector"', "");
  assert.equal(templateProject("ocean blue easier", original).title, "Ocean Explorer");
  const malformed = original.replace('"goal":10', '"goal":10,"kind":"<script>bad()</script>"');
  const result = templateProject("memory game", malformed);
  assert.equal(result.html, malformed);
  assert.match(result.message, /unchanged/);
});

test("new templates never interpolate arbitrary prompt text into the document", () => {
  for (const kind of ["memory", "drawing", "math", "story", "tictactoe"]) {
    const project = templateProject(`${kind} </script><script>alert('injected')</script>`);
    assert.ok(!project.html.includes("injected"));
  }
});

test("tic-tac-toe aliases select same-device play and preserve editable metadata", () => {
  for (const prompt of ["tictactoe", "tic-tac-toe", "tic tac toe", "noughts and crosses"]) {
    const game = templateProject(prompt);
    assert.equal(settings(game.html).kind, "tictactoe");
    assert.match(game.html, /Two players, one device/);
    assert.match(game.message, /not online or realtime multiplayer/);
    assert.match(game.html, /Restart game/);
    assert.equal(templateProject("add online multiplayer", game.html).html, game.html);
  }
});
