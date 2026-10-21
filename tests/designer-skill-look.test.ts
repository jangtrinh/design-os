/**
 * look.mjs: the SKIPPED path (always runs — Playwright hidden from the copied skill) and the real
 * render path (runs where Playwright and a Chromium-family browser exist, reports a skip otherwise).
 * The render path also proves each machine item can go red, using deliberately broken pages.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BROKEN_DIR, EXAMPLES, SKILL_DIR, build, cleanTemps, copySkill, lines, makeTemp, node,
} from "./helpers/designer-skill-harness.js";

afterAll(cleanTemps);
const SKIPPED = "look: SKIPPED (no Playwright) — capture 375, 768, 1440 with your host's own browser or screenshot tool";
const look = (evidence: string, sheet: string, extra: string[] = []) =>
  node(join(SKILL_DIR, "look.mjs"), ["--evidence", evidence, "--sheet", sheet, ...extra]);

describe("look — without Playwright", () => {
  it("exits 2 and prints exactly the SKIPPED line, writing no sheet", () => {
    const evidence = build(join(SKILL_DIR, "examples", "pricing-page.html"));
    const copy = copySkill();
    const sheet = join(makeTemp(), "sheet.png");
    const home = makeTemp();
    const run = node(join(copy, "look.mjs"), ["--evidence", evidence, "--sheet", sheet], {
      NODE_PATH: "", HOME: home, USERPROFILE: home, DESIGN_OS_PLAYWRIGHT_DIR: "",
    }, makeTemp());
    expect({ status: run.status, out: lines(run.stdout) }).toEqual({ status: 2, out: [SKIPPED] });
    expect(existsSync(sheet)).toBe(false);
  });

  it("rejects a bad --widths value and a folder without a manifest with exit 2", () => {
    const bad = node(join(SKILL_DIR, "look.mjs"), ["--evidence", makeTemp(), "--widths", "10,abc"]);
    expect(bad.status).toBe(2);
    const noManifest = node(join(SKILL_DIR, "look.mjs"), ["--evidence", makeTemp()]);
    expect(noManifest.status).toBe(2);
    expect(noManifest.stderr).toMatch(/^input: .* has no manifest\.json/);
  });
});

describe("look — rendering", () => {
  let available = false;

  beforeAll(() => {
    const probe = look(build(join(SKILL_DIR, "examples", "pricing-page.html")), join(makeTemp(), "probe.png"));
    available = probe.status === 0 || probe.status === 1;
  }, 120000);

  for (const name of EXAMPLES) {
    it(`${name}: exits 0 with all 15 machine items ok and one sheet PNG wide enough for 375+768+1440`, (ctx) => {
      if (!available) ctx.skip();
      const sheet = join(makeTemp(), "sheet.png");
      const run = look(build(join(SKILL_DIR, "examples", name)), sheet);
      expect(run.status, run.stdout + run.stderr).toBe(0);
      const items = lines(run.stdout).filter((l) => /^L[1-5] /.test(l));
      expect(items).toHaveLength(15);
      expect(items.every((l) => l.endsWith(" ok"))).toBe(true);
      const png = readFileSync(sheet);
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(375 + 768 + 1440);
    });
  }

  it("L1 goes red for a page wider than the viewport, and only for the widths it overflows", (ctx) => {
    if (!available) ctx.skip();
    const run = look(build(join(BROKEN_DIR, "look-overflow.html")), join(makeTemp(), "s.png"));
    expect(run.status).toBe(1);
    const out = lines(run.stdout);
    expect(out.find((l) => l.startsWith("L1 page-overflow @375"))).toMatch(/ FAIL — /);
    expect(out.find((l) => l.startsWith("L1 page-overflow @768"))).toMatch(/ FAIL — /);
    expect(out.find((l) => l.startsWith("L1 page-overflow @1440"))).toMatch(/ ok$/);
  });

  it("L4 goes red for a broken image", (ctx) => {
    if (!available) ctx.skip();
    const run = look(build(join(BROKEN_DIR, "look-broken-image.html")), join(makeTemp(), "s.png"), ["--widths", "375"]);
    expect(run.status).toBe(1);
    expect(lines(run.stdout).find((l) => l.startsWith("L4 broken-images @375"))).toMatch(/1 broken — missing-photo\.png FAIL — /);
  });

  it("blocks remote requests and reports them under L3", (ctx) => {
    if (!available) ctx.skip();
    const run = look(build(join(BROKEN_DIR, "external-request.html")), join(makeTemp(), "s.png"), ["--widths", "375"]);
    expect(run.status).toBe(1);
    expect(lines(run.stdout).find((l) => l.startsWith("L3 console-and-network @375"))).toMatch(/blocked request https:\/\/fonts\.example\.test\/serif\.css/);
  });
});
