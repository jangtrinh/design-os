/**
 * Negative-space harvester: twelve absence probes, each with a positive and a negative input, the three
 * look-alikes the real fixture documents (excluded with a reason, never counted), the Figma inventory
 * judged by name and size only, and determinism. Every probe answers `count` AND the denominator.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { harvestNegativeSpace } from "../src/core/negative-space-harvester.js";
import type { HarvestReport, ProbeResult } from "../src/core/negative-space-harvester.js";
import { NEGATIVE_SPACE_PROBES } from "../src/core/negative-space-probes.js";
import { evaluateTokenBans } from "../src/core/adherence-rules.js";
import type { TokenBanRule } from "../src/core/adherence-rules.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oi-browser", "source", "native");

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ns-harvest-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, "utf8");
  }
  return dir;
}
function harvest(files: Record<string, string>): Record<string, ProbeResult> {
  const report = harvestNegativeSpace({ sourceDir: scratch(files) });
  return Object.fromEntries(report.probes.map((p) => [p.id, p]));
}
const one = (id: string, html: string, name = "a.html"): ProbeResult => harvest({ [name]: html })[id] as ProbeResult;

describe("probes: one positive and one negative each", () => {
  const cases: [string, string, string, string][] = [
    ["NS-01", `<p class="font-mono text-sm">x</p>`, `<p class="font-sans text-sm">x</p>`, "a.html"],
    ["NS-02", `<span class="rounded-full bg-green-100 px-2">Active</span>`, `<span class="size-1.5 rounded-full bg-emerald-500"></span>`, "a.html"],
    ["NS-03", `<span class="uppercase tracking-wide">auto</span>`, `<span class="lowercase">auto</span>`, "a.html"],
    ["NS-04", `<div class="card"><div class="card-header"><h2>T</h2></div></div>`, `<h2>T</h2><div class="card"></div>`, "a.html"],
    ["NS-05", `<header><h1>Settings</h1><p>Manage things</p></header>`, `<header><h1>Settings</h1></header><p>Body copy</p>`, "a.html"],
    ["NS-06", `<span class="row-description">${"x".repeat(41)}</span>`, `<span class="row-description">${"x".repeat(40)}</span>`, "a.html"],
    ["NS-07", `<div class="settings-row"><button class="bg-primary text-primary-foreground">Go</button></div>`, `<div class="settings-row"><button class="bg-secondary text-secondary-foreground">Go</button></div>`, "a.html"],
    ["NS-08", `<div class="grid grid-cols-4"><span>+12%</span></div>`, `<div class="grid grid-cols-4"><span>plain</span></div>`, "a.html"],
    ["NS-09", `<div class="size-10 rounded-lg bg-blue-100"></div>`, `<div class="size-10 rounded-lg"></div>`, "a.html"],
    ["NS-10", `<a class="bg-gradient-to-r from-a to-b">x</a>`, `<a class="bg-primary">x</a>`, "a.html"],
    ["NS-11", `<img class="shadow-[0_0_12px_#fff]">`, `<button class="rounded-full focus-visible:ring-2">x</button>`, "a.html"],
    ["NS-12", `<div>Upgrade to Pro for more</div>`, `<div>Save changes</div>`, "a.html"],
  ];
  for (const [id, positive, negative, name] of cases) {
    it(`${id} counts a present cliche and not its look-alike, with the denominator`, () => {
      const hit = one(id, positive, name);
      expect(hit.count, `${id} positive`).toBeGreaterThan(0);
      expect(hit.hits.length).toBeGreaterThan(0);
      expect(hit.scannedFiles).toBe(1);
      const miss = one(id, negative, name);
      expect(miss.count, `${id} negative`).toBe(0);
      expect(miss.scannedFiles).toBe(1);
    });
  }

  it("NS-02 reads a CSS pill (radius and pastel background in one rule)", () => {
    expect(one("NS-02", `<style>.pill{border-radius:9999px;background:#dcfce7}</style>`).count).toBe(1);
    expect(one("NS-02", `<style>.pill{border-radius:9999px;background:#0f172a}</style>`).count).toBe(0);
  });
  it("NS-11 counts a glow box-shadow and a resting avatar ring", () => {
    expect(one("NS-11", `<style>.a{box-shadow:0 0 12px rgba(0,0,0,.4)}</style>`).count).toBe(1);
    expect(one("NS-11", `<style>.a{box-shadow:0 0 0 3px #fff}</style>`).count).toBe(1);
    expect(one("NS-11", `<style>.a:focus-visible{box-shadow:0 0 0 3px #fff}</style>`).count).toBe(0);
    expect(one("NS-11", `<img class="size-8 rounded-full ring-2 ring-white">`).count).toBe(1);
  });
  it("a project with no source files reports zero scanned files, not a clean pass", () => {
    const empty = harvestNegativeSpace({ sourceDir: scratch({ "notes.md": "# nothing" }) });
    for (const p of empty.probes) { expect(p.scannedFiles).toBe(0); expect(p.count).toBe(0); }
  });
});

describe("look-alikes are excluded with a reason and do not count", () => {
  it("font-mono inside <code> and <pre> (NS-01)", () => {
    const r = one("NS-01", `<p>Receipt: <code class="rounded font-mono text-xs">id</code></p><pre class="font-mono">x</pre>`);
    expect(r.count).toBe(0);
    expect(r.excluded.map((e) => e.reason).sort()).toEqual(["inside <code>", "inside <pre>"]);
  });
  it("a pastel hex in a tokens JSON is a token definition, not a pill (NS-02)", () => {
    const r = harvest({ "ui.html": "<p>x</p>", "design/ontology.tokens.json": `{\n  "leaf-100": { "$type": "color", "$value": "#dcfce7" }\n}` })["NS-02"] as ProbeResult;
    expect(r.count).toBe(0);
    expect(r.scannedFiles).toBe(2);
    expect(r.excluded).toEqual([{ file: "design/ontology.tokens.json", line: 2, reason: expect.stringContaining("tokens JSON") }]);
  });
  it("uppercase in a vendored tailwind-merge value list is not a class (NS-03)", () => {
    const r = one("NS-03", `const c={"text-transform":["uppercase","lowercase","capitalize","normal-case"]};`, "merge.js");
    expect(r.count).toBe(0);
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]?.reason).toContain("tailwind-merge");
  });
  it("a JSON file that is not a token file is not read", () => {
    const r = harvest({ "ui.html": "<p>x</p>", "package.json": `{"color":"#dcfce7"}` })["NS-02"] as ProbeResult;
    expect(r.scannedFiles).toBe(1);
    expect(r.excluded).toEqual([]);
  });
});

describe("the Figma inventory judges names and sizes only", () => {
  function withInventory(inventory: unknown, file = "ds.json"): HarvestReport {
    const root = mkdtempSync(join(tmpdir(), "ns-fig-"));
    mkdirSync(join(root, "design"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.html"), "<p>hello</p>");
    writeFileSync(join(root, "design", file), JSON.stringify(inventory));
    return harvestNegativeSpace({ sourceDir: join(root, "src"), designDir: join(root, "design") });
  }
  const inventory = { components: [{ id: "1:1", name: "Badge/Status", w: 60, h: 20 }, { id: "1:2", name: "Icon Tile", w: 40, h: 40 }, { id: "1:3", name: "Button", w: 80, h: 32 }], componentSets: [{ id: "2:1", name: "Upgrade Banner" }] };

  it("counts name and size hits from the inventory", () => {
    const report = withInventory(inventory);
    const by = Object.fromEntries(report.probes.map((p) => [p.id, p]));
    expect(by["NS-02"]?.count).toBe(1);
    expect(by["NS-02"]?.hits[0]).toEqual({ file: "design/ds.json", line: 0, excerpt: 'component "Badge/Status" 60x20' });
    expect(by["NS-09"]?.count).toBe(1);
    expect(by["NS-12"]?.count).toBe(1);
    expect(report.figma).toMatchObject({ present: true, components: 4 });
    expect(by["NS-02"]?.figmaScanned).toBe(4);
  });
  it("never counts a fill or font probe as zero from Figma: it says what the inventory lacks", () => {
    const by = Object.fromEntries(withInventory(inventory).probes.map((p) => [p.id, p]));
    expect(by["NS-01"]?.notEvaluated).toEqual(["figma inventory has no fonts"]);
    expect(by["NS-10"]?.notEvaluated).toEqual(["figma inventory has no fills"]);
    expect(by["NS-11"]?.notEvaluated).toEqual(["figma inventory has no effects"]);
    expect(by["NS-01"]?.count).toBe(0);
  });
  it("reads canvas-inventory.json the same way", () => {
    const report = withInventory({ components: [{ id: "9:9", name: "Card Header", w: 300, h: 48 }] }, "canvas-inventory.json");
    expect(report.probes.find((p) => p.id === "NS-04")?.count).toBe(1);
    expect(report.figma.files).toEqual(["design/canvas-inventory.json"]);
  });
  it("says so when there is no inventory", () => {
    const report = harvestNegativeSpace({ sourceDir: scratch({ "a.html": "<p>x</p>" }) });
    expect(report.figma).toEqual({ present: false, files: [], components: 0 });
    expect(report.probes.every((p) => p.notEvaluated.length === 0 && p.figmaScanned === 0)).toBe(true);
  });
});

describe("determinism and report shape", () => {
  it("two runs over the same tree give a byte-identical report", () => {
    const dir = scratch({ "b.html": `<p class="font-mono">x</p>`, "a.html": `<h1>t</h1><p>s</p>`, "c/d.jsx": `const x = <div className="uppercase" />;` });
    const a = JSON.stringify(harvestNegativeSpace({ sourceDir: dir }));
    const b = JSON.stringify(harvestNegativeSpace({ sourceDir: dir }));
    expect(a).toBe(b);
  });
  it("lists every probe, in id order, with count and denominator", () => {
    const report = harvestNegativeSpace({ sourceDir: scratch({ "a.html": "<p>x</p>" }) });
    expect(report.probes.map((p) => p.id)).toEqual(NEGATIVE_SPACE_PROBES.map((p) => p.id));
    expect(report.probes).toHaveLength(12);
  });
  it("caps stored hits but keeps the true count", () => {
    const many = Array.from({ length: 30 }, () => `<p class="font-mono">x</p>`).join("\n");
    const r = one("NS-01", many);
    expect(r.count).toBe(30);
    expect(r.hits.length).toBeLessThan(30);
    expect(r.hitsOmitted).toBe(30 - r.hits.length);
  });
  it("reports files the walk met but did not read", () => {
    const report = harvestNegativeSpace({ sourceDir: scratch({ "a.html": "<p>x</p>", "node_modules/x/y.js": "var a" }) });
    expect(report.walk.skipped.some((s) => s.path.startsWith("node_modules"))).toBe(true);
  });
  it("a proposed ban never fires on text its probe already proved clean", () => {
    const text = `<p class="font-sans bg-primary">x</p><code class="font-mono">y</code>`;
    for (const probe of NEGATIVE_SPACE_PROBES.filter((p) => p.rule !== undefined)) {
      const rule: TokenBanRule = { id: probe.id, kind: "token-ban", severity: "error", message: "m", source: "s", tokens: [...(probe.rule?.tokens ?? [])], ...(probe.rule?.excludeElements !== undefined && { excludeElements: [...probe.rule.excludeElements] }) };
      expect(evaluateTokenBans([rule], text), probe.id).toEqual([]);
    }
  });
});

describe("the detectors can go red on the real bad screen and stay green on the good one", () => {
  const screens = join(dirname(FIXTURE), "..");
  const probeOf = (file: string): Record<string, ProbeResult> => {
    const copy = scratch({ [file]: readFileSync(join(screens, file), "utf8") });
    return Object.fromEntries(harvestNegativeSpace({ sourceDir: copy }).probes.map((p) => [p.id, p]));
  };
  it("flags the monospace, pastel pill, uppercase tag, card header bar and long copy of the bad CLI Core screen", () => {
    const bad = probeOf("settings-cli-core-bad.html");
    for (const id of ["NS-01", "NS-02", "NS-03", "NS-04", "NS-06"]) expect(bad[id]?.count, id).toBeGreaterThan(0);
    expect(one("NS-02", `<style>.b{border-radius:999px;background:#dcfce7}</style>`).hits.some((h) => h.excerpt.includes("#dcfce7"))).toBe(true);
    expect(bad["NS-03"]?.hits.some((h) => /uppercase|AUTO in a badge/.test(h.excerpt))).toBe(true);
  });
  it("reports 0 on the good CLI Core screen and on the hand-composed anchor, over a non-zero denominator", () => {
    for (const file of ["settings-cli-core-good.html", "settings-account.html"]) {
      const good = probeOf(file);
      for (const id of ["NS-01", "NS-02", "NS-03", "NS-04", "NS-05"]) {
        expect(good[id]?.count, `${file} ${id}`).toBe(0);
        expect(good[id]?.scannedFiles).toBe(1);
      }
    }
  });
});

describe("AC-1: the real oi-browser native source", () => {
  const report = harvestNegativeSpace({ sourceDir: FIXTURE });
  const by = Object.fromEntries(report.probes.map((p) => [p.id, p]));

  it("counts 0 with a non-zero denominator for monospace, pill badges, card headers and page subtitles", () => {
    for (const id of ["NS-01", "NS-02", "NS-04", "NS-05"]) {
      expect(by[id]?.count, `${id} hits: ${JSON.stringify(by[id]?.hits)}`).toBe(0);
      expect(by[id]?.scannedFiles, id).toBeGreaterThan(0);
    }
  });
  it("lists the three documented look-alikes as excluded, each with its reason", () => {
    expect(by["NS-01"]?.excluded.map((e) => e.reason)).toEqual(["inside <code>"]);
    expect(by["NS-01"]?.excluded[0]?.file).toBe("account-route-node-71.C77w0PPh.js");
    expect(by["NS-02"]?.excluded.map((e) => e.file)).toEqual(["design/ontology.tokens.json"]);
    expect(by["NS-02"]?.excluded[0]?.reason).toContain("tokens JSON");
    expect(by["NS-03"]?.excluded.map((e) => e.file)).toEqual(["chunks/9k9xcff1.js"]);
    expect(by["NS-03"]?.excluded[0]?.reason).toContain("tailwind-merge");
    expect(by["NS-03"]?.count).toBe(0);
  });
  it("finds the real billing chrome the native app has (the spec's zero list does not include it)", () => {
    expect(by["NS-12"]?.count).toBeGreaterThan(0);
  });
});
