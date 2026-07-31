// Capture each panel-state cell of a preview gallery as its own PNG (README/#147 asset
// pipeline). Headless — never touches the user's foreground session.
// Usage: OUT=<dir> node scripts/dev/capture-panel-states.mjs <preview.html>
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const preview = process.argv[2];
const out = process.env.OUT;
if (!preview || !out) {
  console.error("usage: OUT=<dir> node scripts/dev/capture-panel-states.mjs <preview.html>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(preview).href);
// The gallery embeds each state as a standalone document; give inline scripts a beat.
await page.waitForTimeout(1200);

const cells = await page.$$("iframe, .cell, [data-state]");
let captured = 0;
for (const cell of cells) {
  const box = await cell.boundingBox();
  if (!box || box.width < 100) continue;
  const raw =
    (await cell.getAttribute("data-state")) ??
    (await cell.getAttribute("title")) ??
    `cell-${String(captured).padStart(2, "0")}`;
  const name = raw.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  await cell.screenshot({ path: `${out}/${name}.png` });
  captured++;
}
console.log(`captured ${captured} cells`);
await browser.close();
