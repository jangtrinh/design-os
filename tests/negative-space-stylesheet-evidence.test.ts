/**
 * A zero must have looked where the evidence lives: stylesheets and CSS-in-JS text are read, the newer class
 * forms are counted, and every bullet states what was read, what was not, and what was met and left unread.
 * The shared UI walk keeps its default (no stylesheets) for the ds-usage lint and gate.
 */
import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { harvestNegativeSpace } from "../src/core/negative-space-harvester.js";
import type { HarvestReport, ProbeResult } from "../src/core/negative-space-harvester.js";
import { planProposals } from "../src/core/negative-space-proposals.js";
import { NEGATIVE_SPACE_LIMITS, NEGATIVE_SPACE_PROBES } from "../src/core/negative-space-probes.js";
import { walkUiSources } from "../src/core/polyglot-ui-walk.js";

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ns-style-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, "utf8");
  }
  return dir;
}
const PLAIN = { "index.html": `<h1>Hi</h1>` };
function harvest(files: Record<string, string>): { report: HarvestReport; by: Record<string, ProbeResult> } {
  const report = harvestNegativeSpace({ sourceDir: scratch(files) });
  return { report, by: Object.fromEntries(report.probes.map((p) => [p.id, p])) };
}
const plan = (r: HarvestReport) => planProposals(r, { bindingRuleIds: new Set(), boundNeverIds: new Set() }, "./");
const statusOf = (r: HarvestReport, id: string): string | undefined => plan(r).find((x) => x.id === id)?.status;

describe("a cliche that lives only in a stylesheet is counted, not proposed away", () => {
  const cases: [string, string, string, string][] = [
    ["NS-10", "s.css", ".hero{background:linear-gradient(90deg,#f00,#00f)}", "gradient in a .css file"],
    ["NS-10", "s.scss", ".hero{ background: radial-gradient(circle, #f00, #00f); }", "radial gradient in a .scss file"],
    ["NS-10", "s.less", ".hero{ background: conic-gradient(#f00, #00f); }", "conic gradient in a .less file"],
    ["NS-10", "card.module.css", ".hero{background:linear-gradient(red,blue)}", "gradient in a .module.css file"],
    ["NS-01", "s.css", "body{font-family:ui-monospace,Menlo,monospace}", "monospace family in a .css file"],
    ["NS-02", "s.css", ".badge{border-radius:999px;background:#dcfce7;color:#166534}", "pastel pill rule in a .css file"],
    ["NS-11", "s.css", ".avatar{box-shadow:0 0 12px rgba(59,130,246,.6)}", "glow shadow in a .css file"],
    ["NS-09", "s.css", ".tile{width:40px;height:40px;border-radius:10px;background:#e0f2fe}", "tinted icon tile rule in a .css file"],
    ["NS-04", "s.css", ".card-header{padding:12px}", "card header selector in a .css file"],
    ["NS-03", "s.css", ".tag{text-transform:uppercase}", "uppercase transform in a .css file"],
  ];
  for (const [id, name, css, what] of cases) {
    it(`${id}: ${what}`, () => {
      const { report, by } = harvest({ ...PLAIN, [name]: css });
      expect(by[id]?.count, `${id} count`).toBeGreaterThan(0);
      expect(by[id]?.scannedFiles).toBe(2);
      expect(statusOf(report, id)).toBe("skip-nonzero");
    });
  }

  it("the same stylesheet without the cliche is read and counts zero over both files", () => {
    const { by } = harvest({ ...PLAIN, "s.css": ".a{background:#fff;border-radius:8px;font-family:system-ui}" });
    for (const id of ["NS-01", "NS-02", "NS-09", "NS-10", "NS-11"]) {
      expect(by[id]?.count, id).toBe(0);
      expect(by[id]?.scannedFiles, id).toBe(2);
    }
  });

  it("CSS-in-JS text counts too, with or without braces", () => {
    const { by } = harvest({
      ...PLAIN,
      "a.tsx": "export const Badge = styled.span`border-radius: 9999px; background: #dcfce7;`;",
      "b.tsx": "export const Hero = styled.div`${p => p.x}\n  background: linear-gradient(red, blue);\n  font-family: ui-monospace;`;",
      "c.tsx": "export const Tile = css`.tile { width: 40px; height: 40px; border-radius: 8px; background: #e0f2fe; }`;",
      "d.tsx": "export const Glow = styled.img`box-shadow: 0 0 10px #fff;`;",
    });
    expect(by["NS-02"]?.count).toBeGreaterThan(0);
    expect(by["NS-10"]?.count).toBeGreaterThan(0);
    expect(by["NS-01"]?.count).toBeGreaterThan(0);
    expect(by["NS-09"]?.count).toBeGreaterThan(0);
    expect(by["NS-11"]?.count).toBeGreaterThan(0);
  });

  it("a class-only bullet-probe is untouched by stylesheets (NS-05 and NS-12 read markup and script only)", () => {
    const { by } = harvest({ ...PLAIN, "s.css": ".a{background:#fff}" });
    expect(by["NS-05"]?.scannedFiles).toBe(1);
    expect(by["NS-12"]?.scannedFiles).toBe(1);
  });
});

describe("the class forms the review listed", () => {
  const cases: [string, string, string][] = [
    ["NS-10", `<a class="bg-linear-to-r from-a to-b">x</a>`, "bg-linear-"],
    ["NS-10", `<a class="bg-radial from-a to-b">x</a>`, "bg-radial"],
    ["NS-10", `<a class="bg-conic from-a to-b">x</a>`, "bg-conic"],
    ["NS-10", `<a style="background:radial-gradient(red,blue)">x</a>`, "radial-gradient("],
    ["NS-10", `<a style="background:conic-gradient(red,blue)">x</a>`, "conic-gradient("],
    ["NS-02", `<span class="rounded-full bg-[#dcfce7] px-2">Active</span>`, "bg-[#hex] pill"],
    ["NS-09", `<div class="size-10 rounded-lg bg-[#e0f2fe]"></div>`, "bg-[#hex] tile"],
    ["NS-11", `<img class="rounded shadow-blue-500/50">`, "coloured shadow class"],
    ["NS-11", `<img class="rounded drop-shadow-sky-400">`, "coloured drop shadow class"],
  ];
  for (const [id, html, what] of cases) {
    it(`${id} counts ${what}`, () => {
      expect(harvest({ "a.html": html }).by[id]?.count).toBeGreaterThan(0);
    });
  }
  it("does not count a dark or neutral arbitrary fill, a hover-only coloured shadow, or a neutral shadow", () => {
    const { by } = harvest({ "a.html": `<span class="rounded-full bg-[#1a1a1a]">a</span><div class="size-10 rounded-lg bg-[#222]"></div><img class="hover:shadow-blue-500/50 shadow-md">` });
    expect(by["NS-02"]?.count).toBe(0);
    expect(by["NS-09"]?.count).toBe(0);
    expect(by["NS-11"]?.count).toBe(0);
  });
});

describe("the evidence line tells the whole count", () => {
  it("states files read, files not read and other template or style files met and not read", () => {
    const dir = scratch({ ...PLAIN, "s.css": ".a{color:red}", "page.mdx": "# x", "layout.astro": "<h1>x</h1>", "more.astro": "<p>y</p>" });
    writeFileSync(join(dir, "big.html"), "x".repeat(2 * 1024 * 1024 + 10));
    const report = harvestNegativeSpace({ sourceDir: dir });
    expect(report.walk.unread).toEqual({ ".astro": 2, ".mdx": 1 });
    const bullet = plan(report).find((x) => x.id === "NS-10")?.bullet ?? "";
    expect(bullet).toContain("0 hits in 2 file(s) read under ./");
    expect(bullet).toContain("1 file(s) not read (skipped: unreadable, oversized or symlink)");
    expect(bullet).toContain("other template/style files met and not read: .astro 2, .mdx 1");
    const rule = plan(report).find((x) => x.id === "NS-10")?.rule;
    expect(rule?.source).toContain("1 file(s) not read");
    expect(rule?.source).toContain(".astro 2, .mdx 1");
  });

  it("says 'none' when no other template or style file was met", () => {
    const bullet = plan(harvest(PLAIN).report).find((x) => x.id === "NS-10")?.bullet ?? "";
    expect(bullet).toContain("other template/style files met and not read: none");
  });

  it("reports a symlinked token JSON as skipped, like any other symlink, and counts it per kind", () => {
    const dir = scratch({ ...PLAIN, "real/brand.tokens.json": `{"x":"linear-gradient(red,blue)"}` });
    symlinkSync(join(dir, "real", "brand.tokens.json"), join(dir, "link.tokens.json"));
    const report = harvestNegativeSpace({ sourceDir: dir });
    expect(report.walk.skipped).toContainEqual({ path: "link.tokens.json", reason: "symlink not followed" });
    const ns10 = report.probes.find((p) => p.id === "NS-10") as ProbeResult;
    expect(ns10.skippedFiles).toBe(1);
    expect(ns10.count).toBe(1); // the real token file is read
    const ns05 = report.probes.find((p) => p.id === "NS-05") as ProbeResult;
    expect(ns05.skippedFiles).toBe(0); // a probe that does not judge token JSON does not count it as unread
  });

  it.skipIf(process.getuid?.() === 0)("an unreadable file is a skip with its reason and counts against the probes that judge its kind", () => {
    const dir = scratch({ ...PLAIN, "locked.css": ".a{background:linear-gradient(red,blue)}" });
    chmodSync(join(dir, "locked.css"), 0o000);
    const report = harvestNegativeSpace({ sourceDir: dir });
    expect(report.walk.skipped.some((s) => s.path === "locked.css" && s.reason.startsWith("cannot read"))).toBe(true);
    expect((report.probes.find((p) => p.id === "NS-10") as ProbeResult).skippedFiles).toBe(1);
    expect((report.probes.find((p) => p.id === "NS-05") as ProbeResult).skippedFiles).toBe(0);
    chmodSync(join(dir, "locked.css"), 0o644);
  });

  it("proposes nothing for a probe when no file of the kinds it judges was read", () => {
    const { report } = harvest({ "s.css": ".a{color:red}" });
    expect(statusOf(report, "NS-10")).toBe("propose");
    expect(statusOf(report, "NS-05")).toBe("skip-no-files");
    expect(statusOf(report, "NS-12")).toBe("skip-no-files");
  });

  it("proposes nothing at all when only token JSON was read", () => {
    const { report } = harvest({ "brand.tokens.json": `{"a":"#fff"}` });
    expect(plan(report).every((x) => x.status === "skip-no-files")).toBe(true);
  });

  it("has no minimum file count: one file is enough and the count is shown", () => {
    const bullet = plan(harvest(PLAIN).report).find((x) => x.id === "NS-10")?.bullet ?? "";
    expect(bullet).toContain("0 hits in 1 file(s) read");
  });
});

describe("what each probe matches, and what none of them sees", () => {
  it("every probe carries one non-empty sentence, and the report carries the limits", () => {
    for (const p of NEGATIVE_SPACE_PROBES) expect(p.matches.length, p.id).toBeGreaterThan(20);
    const { report, by } = harvest(PLAIN);
    expect(report.limits).toEqual(NEGATIVE_SPACE_LIMITS);
    expect(NEGATIVE_SPACE_LIMITS.length).toBeGreaterThanOrEqual(5);
    for (const p of report.probes) expect(by[p.id]?.matches).toBe(NEGATIVE_SPACE_PROBES.find((d) => d.id === p.id)?.matches);
  });
});

describe("the shared walk keeps its default", () => {
  it("lists no stylesheet and counts no unread type unless asked", () => {
    const dir = scratch({ "a.html": "<p>x</p>", "s.css": ".a{}", "page.mdx": "# x" });
    const walk = walkUiSources(dir);
    expect(walk.relative).toEqual(["a.html"]);
    expect(walk.total).toBe(1);
    expect("unread" in walk).toBe(false);
  });
  it("reads the extra extensions and counts the unread ones per type when asked", () => {
    const dir = scratch({ "a.html": "<p>x</p>", "s.css": ".a{}", "m.module.css": ".b{}", "t.scss": ".c{}", "page.mdx": "# x", "z.astro": "<p/>" });
    const walk = walkUiSources(dir, { extraExtensions: [".css", ".scss"], unreadExtensions: [".mdx", ".astro"] });
    expect(walk.relative).toEqual(["a.html", "m.module.css", "s.css", "t.scss"]);
    expect(walk.unread).toEqual({ ".mdx": 1, ".astro": 1 });
  });
});
