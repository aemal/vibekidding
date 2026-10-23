// Standalone browser checks. No app server or Next build is required.
import assert from "node:assert/strict";
import { chromium, type Page } from "@playwright/test";
import { templateProject } from "../src/lib/demo-server/template";

async function play(prompt: string, check: (page: Page) => Promise<void>) {
  if (process.env.DEMO_TEMPLATE_FILTER && !prompt.includes(process.env.DEMO_TEMPLATE_FILTER)) return;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
    const errors: string[] = [];
    const network: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { network.push(route.request().url()); return route.abort(); });
    const project = templateProject(prompt);
    await page.setContent(project.html);
    await check(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log(JSON.stringify({ title: project.title, passed: true, runtimeErrors: 0, networkRequests: 0 }));
  } finally { await browser.close(); }
}

async function main() {
  await play("easier space collecting game", async page => {
    await page.evaluate(() => { Math.random = () => 0.99; });
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: "Collect target" }).click();
    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForFunction(() => {
      const field = document.getElementById("field")!.getBoundingClientRect();
      const target = document.getElementById("target")!.getBoundingClientRect();
      return target.left >= field.left && target.right <= field.right && target.top >= field.top && target.bottom <= field.bottom;
    });
    assert.match(await page.getByRole("status").innerText(), /Collected 1 \/ 5/);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Collect target" }).click();
    assert.match(await page.getByRole("status").innerText(), /You did it/);
  });
  await play("easier ocean memory game", async page => {
    const cards = page.locator("#cards button");
    assert.equal(await cards.count(), 8);
    const known = new Map<string, number[]>();
    for (let i = 0; i < 8; i += 2) {
      for (const index of [i, i + 1]) {
        await cards.nth(index).click();
        const icon = await cards.nth(index).innerText();
        known.set(icon, [...(known.get(icon) ?? []), index]);
      }
      if (!(await cards.nth(i).isDisabled()))
        await page.waitForFunction(index => document.querySelectorAll("#cards button")[index].textContent === "?", i);
    }
    for (const pair of known.values()) {
      assert.equal(pair.length, 2);
      if (await cards.nth(pair[0]).isDisabled()) continue;
      for (const index of pair) await cards.nth(index).click();
    }
    assert.match(await page.getByRole("status").innerText(), /All pairs found/);
    await page.getByRole("button", { name: "New game" }).click();
    assert.equal(await page.locator("#cards button:disabled").count(), 0);
  });
  await play("blue garden drawing canvas", async page => {
    const canvas = page.locator("canvas");
    const coloredPixels = () => canvas.evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) count++;
      return count;
    });
    assert.equal(await coloredPixels(), 0);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 120, { steps: 10 });
    await page.mouse.up();
    assert.ok(await coloredPixels() > 100);
    await page.getByRole("button", { name: "Clear drawing" }).click();
    assert.equal(await coloredPixels(), 0);
    await canvas.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    assert.ok(await coloredPixels() > 0);
  });
  await play("easier space arithmetic quiz", async page => {
    for (let round = 0; round < 5; round++) {
      const numbers = (await page.locator("#question").innerText()).match(/\d+/g)!.map(Number);
      await page.locator("#answers").getByRole("button", { name: String(numbers[0] + numbers[1]), exact: true }).click();
      if (round < 4) await page.getByRole("button", { name: "Next question" }).click();
    }
    assert.match(await page.getByRole("status").innerText(), /5 out of 5/);
    await page.getByRole("button", { name: "New quiz" }).click();
    assert.match(await page.locator("#progress").innerText(), /Question 1 \/ 5/);
  });
  await play("ocean choose-your-own adventure story", async page => {
    await page.getByRole("button", { name: "Follow the sparkling trail" }).click();
    await page.getByRole("button", { name: "Cross the bridge carefully" }).click();
    assert.match(await page.getByRole("status").innerText(), /The end/);
    const firstEnding = await page.locator("#narrative").innerText();
    assert.match(firstEnding, /shimmering pearl/);
    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Ask the neighbors" }).click();
    await page.getByRole("button", { name: "Read the map together" }).click();
    assert.match(await page.getByRole("status").innerText(), /The end/);
    assert.notEqual(await page.locator("#narrative").innerText(), firstEnding);
  });
  await play("blue garden tic-tac-toe", async page => {
    const cells = page.locator("#tic-board button");
    const status = page.getByRole("status");
    const restart = page.getByRole("button", { name: "Restart game" });
    assert.equal(await cells.count(), 9);
    assert.match(await status.innerText(), /Player X: your turn/);
    await cells.nth(0).focus();
    await page.keyboard.press("Enter");
    assert.equal(await cells.nth(0).innerText(), "X");
    assert.match(await cells.nth(0).getAttribute("aria-label") ?? "", /Row 1, column 1: X/);
    assert.match(await status.innerText(), /Player O: your turn/);
    // Deliberately dispatch to a disabled cell: the game must reject the move too.
    await cells.nth(0).evaluate(cell => cell.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(await cells.nth(0).innerText(), "X");
    assert.match(await status.innerText(), /Player O: your turn/);
    for (const index of [3, 1, 4, 2]) await cells.nth(index).click();
    assert.equal(await status.innerText(), "Player X wins!");
    assert.equal(await page.locator("#tic-board button:disabled").count(), 9);
    await cells.nth(8).evaluate(cell => cell.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(await cells.nth(8).innerText(), "");
    await restart.click();
    assert.equal(await page.locator("#tic-board button:disabled").count(), 0);
    assert.deepEqual(await cells.allTextContents(), Array(9).fill(""));
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await cells.nth(index).click();
    assert.equal(await status.innerText(), "Draw! Great game.");
    await restart.click();
    for (const index of [0, 1, 2, 4, 3, 7]) await cells.nth(index).click();
    assert.equal(await status.innerText(), "Player O wins!");
    await restart.click();
    for (const index of [0, 1, 4, 2, 8]) await cells.nth(index).click();
    assert.equal(await status.innerText(), "Player X wins!");
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
