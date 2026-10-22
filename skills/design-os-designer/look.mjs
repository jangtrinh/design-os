#!/usr/bin/env node
// look.mjs — render one evidence folder at fixed widths into ONE sheet PNG and measure the machine
// items of look.md (L1-L5). Exit 0 all items pass / 1 an item failed / 2 cannot run (no Playwright or
// browser) with the SKIPPED line. Offline: every non-file request is blocked. It never installs
// anything and writes only the sheet path it is given (default: <evidence>/look-sheet.png).
// Playwright is resolved from the user's environment: DESIGN_OS_PLAYWRIGHT_DIR, the current project,
// this package, then ~/.cache/design-os/playwright. See look.md "Without a browser".
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SITE_DIR, SKILL_DIR, WIDTHS, parseArgs, readManifest } from "./shared.mjs";
import { DEFAULT_DEADLINE_MS, itemLines, shoot } from "./look-shots.mjs";

const HELP = `Usage: node look.mjs --evidence <folder> [--sheet <png>] [--widths 375,768,1440] [--deadline <ms>]
Renders <folder>/site/<entry> at each width, writes one sheet PNG, prints items L1-L5.
--deadline  most time one width may take before it is reported UNVERIFIED (default ${DEFAULT_DEADLINE_MS})
Exit 0 all pass, 1 an item failed or is UNVERIFIED, 2 cannot run (prints the SKIPPED line).`;
const MAX_CELL_HEIGHT = 2000;

function loadPlaywright() {
  const bases = [process.env.DESIGN_OS_PLAYWRIGHT_DIR, process.cwd(), SKILL_DIR, join(homedir(), ".cache", "design-os", "playwright")];
  for (const base of bases.filter(Boolean)) {
    if (!existsSync(resolve(base))) continue;
    const req = createRequire(join(resolve(base), "resolver.cjs"));
    for (const name of ["playwright", "playwright-core"]) {
      try {
        return req(name).chromium;
      } catch { /* try the next base */ }
    }
  }
  return null;
}

async function launch(chromium) {
  let reason = "";
  for (const options of [{ channel: "chrome" }, {}]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      reason = String(error.message).split("\n")[0];
    }
  }
  throw new Error(reason || "no launchable Chromium");
}

async function composeSheet(browser, shots, entry, sheetPath) {
  const gap = 32;
  const cells = shots.map((s) => {
    const height = Math.min(s.probe.height, MAX_CELL_HEIGHT);
    const note = s.probe.height > MAX_CELL_HEIGHT ? `, top ${MAX_CELL_HEIGHT}px of ${s.probe.height}px` : "";
    return `<figure style="margin:0;width:${s.width}px"><figcaption style="font:600 20px/1.4 system-ui;margin-bottom:8px">${s.width} px${note}</figcaption>` +
      `<div style="width:${s.width}px;height:${height}px;overflow:hidden;border:1px solid #888;background:#fff"><img alt="" style="display:block;width:${s.width}px" src="data:image/png;base64,${s.png.toString("base64")}"></div></figure>`;
  });
  const total = shots.reduce((sum, s) => sum + s.width, 0) + gap * (shots.length + 1);
  const page = await browser.newPage({ viewport: { width: total, height: 400 } });
  await page.setContent(`<body style="margin:${gap}px;background:#e8e8e8;font-family:system-ui"><h1 style="font:700 24px system-ui;margin:0 0 16px">${entry.replace(/[&<>]/g, "")}</h1>` +
    `<div style="display:flex;gap:${gap}px;align-items:flex-start">${cells.join("")}</div></body>`);
  await page.screenshot({ path: sheetPath, fullPage: true });
  await page.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["evidence", "sheet", "widths", "deadline"], ["help"]);
  if (args.help) return void console.log(HELP);
  if (args._errors.length > 0 || !args.evidence) {
    console.error(args._errors.concat(args.evidence ? [] : ["input: --evidence is required (see --help)"]).join("\n"));
    return 2;
  }
  const widths = args.widths ? args.widths.split(",").map(Number) : WIDTHS;
  if (widths.length === 0 || widths.some((w) => !Number.isInteger(w) || w < 200 || w > 4000)) {
    console.error("input: --widths must be integers between 200 and 4000, comma separated");
    return 2;
  }
  const deadlineMs = args.deadline === undefined ? DEFAULT_DEADLINE_MS : Number(args.deadline);
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1000 || deadlineMs > 600000) {
    console.error("input: --deadline must be milliseconds between 1000 and 600000");
    return 2;
  }
  const skipped = (why) => `look: SKIPPED (${why}) — capture ${widths.join(", ")} with your host's own browser or screenshot tool`;
  const evidence = resolve(args.evidence);
  const { manifest, error } = readManifest(evidence);
  if (error) {
    console.error(error);
    return 2;
  }
  const entryPath = join(evidence, SITE_DIR, ...String(manifest.entry).split("/"));
  if (!existsSync(entryPath)) {
    console.error(`input: entry ${manifest.entry} is missing from ${evidence} — rebuild the evidence folder`);
    return 2;
  }
  const chromium = loadPlaywright();
  if (chromium === null) {
    console.log(skipped("no Playwright"));
    return 2;
  }
  let browser;
  try {
    browser = await launch(chromium);
  } catch (launchError) {
    console.log(skipped(`no browser: ${launchError.message}`));
    return 2;
  }
  try {
    const url = pathToFileURL(entryPath).href;
    const shots = [];
    for (const width of widths) shots.push(await shoot(browser, url, width, deadlineMs));
    const sheetPath = resolve(args.sheet ?? join(evidence, "look-sheet.png"));
    const drawn = shots.filter((shot) => !shot.hung);
    if (drawn.length > 0) await composeSheet(browser, drawn, manifest.entry, sheetPath);
    let failed = 0;
    console.log(`look: ${manifest.entry} at ${widths.join(", ")}`);
    for (const shot of shots) {
      for (const [bad, line, fix] of itemLines(shot)) {
        if (bad) failed++;
        console.log(bad ? `${line} FAIL — ${fix}` : `${line} ok`);
      }
    }
    console.log(drawn.length > 0 ? `sheet: ${sheetPath}` : "sheet: none (no width finished)");
    console.log(failed > 0 ? `look: ${failed} machine item(s) failed — eye items L6-L10 still need a human` : "look: machine items ok — eye items L6-L10 still need a human");
    return failed > 0 ? 1 : 0;
  } finally {
    // Always close the browser, even after a hung page; if close itself stalls, end the process rather than leave Chrome behind.
    const closed = await Promise.race([browser.close().then(() => true, () => true), new Promise((done) => setTimeout(() => done(false), 10000))]);
    if (!closed) setTimeout(() => process.exit(process.exitCode ?? 1), 300);
  }
}

main().then((code) => { process.exitCode = code ?? 0; }, (error) => {
  console.error(`look: could not run — ${error.message}`);
  process.exitCode = 2;
});
