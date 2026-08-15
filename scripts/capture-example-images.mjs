#!/usr/bin/env node
/**
 * Render every committed example artifact to a PNG for the README.
 *
 * The artifacts are the source of truth; these images are a derived view of them, so the
 * script reads whatever is in `examples/` rather than a hand-kept list. Both themes are
 * captured because the artifacts carry a real `[data-theme="dark"]` layer — showing only
 * the light one would undersell what the scaffold actually does.
 *
 *   node scripts/capture-example-images.mjs            # write docs/images/examples/**
 *   node scripts/capture-example-images.mjs --check    # exit 1 if an image is missing
 */
import { chromium } from "playwright";
import { readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = join(ROOT, "docs", "images", "examples");
const THEMES = ["light", "dark"];

const GROUPS = [
  { kind: "diagrams", dir: join(ROOT, "examples", "diagrams") },
  { kind: "charts", dir: join(ROOT, "examples", "charts") },
];

function artifacts() {
  return GROUPS.flatMap(({ kind, dir }) =>
    (existsSync(dir) ? readdirSync(dir) : [])
      .filter((f) => f.endsWith(".html"))
      .sort()
      .map((file) => ({ kind, dir, file, name: file.replace(/\.html$/, "") })),
  );
}

const items = artifacts();

if (process.argv.includes("--check")) {
  const missing = items.flatMap((item) =>
    THEMES
      .map((theme) => join(OUT_ROOT, item.kind, `${item.name}-${theme}.png`))
      .filter((p) => !existsSync(p)),
  );
  if (missing.length > 0) {
    console.error(`missing ${missing.length} example image(s) — run 'node scripts/capture-example-images.mjs'`);
    for (const p of missing.slice(0, 5)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`example images: ${items.length * THEMES.length} present`);
  process.exit(0);
}

const browser = await chromium.launch();
let written = 0;
let bytes = 0;

for (const { kind, dir, file, name } of items) {
  mkdirSync(join(OUT_ROOT, kind), { recursive: true });
  for (const theme of THEMES) {
    const page = await browser.newPage({
      viewport: { width: 1120, height: 720 },
      deviceScaleFactor: 1.5,
      // Drives the artifact's own prefers-color-scheme branch as well as the attribute,
      // so the capture exercises the same path a real viewer would.
      colorScheme: theme,
    });
    await page.goto(pathToFileURL(join(dir, file)).href, { waitUntil: "load" });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);

    // Grow the viewport to the whole document first. `clip` alone is viewport-limited, so
    // a tall artifact would be silently cut off at the fold — which is exactly what
    // happened to the taller charts before this. Resizing first makes the clip safe.
    const docHeight = await page.evaluate(() =>
      Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)),
    );
    await page.setViewportSize({ width: 1120, height: docHeight });

    // Then crop to the content block plus a margin: shooting fullPage pads out to the
    // viewport and leaves dead space. Clipping still paints the body background, so the
    // crop keeps its ground rather than going transparent.
    const box = await page.locator(".frame").boundingBox();
    const margin = 40;
    const clip = box
      ? {
          x: Math.max(0, box.x - margin),
          y: Math.max(0, box.y - margin),
          width: box.width + margin * 2,
          height: box.height + margin * 2,
        }
      : undefined;

    const out = join(OUT_ROOT, kind, `${name}-${theme}.png`);
    await page.screenshot({ path: out, ...(clip ? { clip } : { fullPage: true }) });
    await page.close();
    written += 1;
    bytes += statSync(out).size;
  }
}

await browser.close();
console.log(`example images: wrote ${written} PNGs (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${OUT_ROOT}`);
