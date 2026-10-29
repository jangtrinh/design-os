/**
 * Regressions found by reviewing the polyglot ds-usage work: findings counted twice, colours lost after
 * a quoted segment, interpolated var names reported as ghost tokens, an empty first font family, and
 * inputs that made a scan super-linear.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractUiRecords } from "../src/core/polyglot-ui-extractor.js";
import { lintDsUsageOnMarkup } from "../src/core/ds-usage-lint.js";
import type { DsUsageLintOptions } from "../src/core/ds-usage-lint.js";
import { fontTokenModel } from "../src/core/ds-usage-font-check.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { declaredCssVarNames } from "../src/core/token-emit.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/oi-browser/", import.meta.url));
const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(FIXTURES + "tokens.json", "utf8"))));
const DS: DsUsageLintOptions = { declaredVars: declaredCssVarNames(resolved), fonts: fontTokenModel(resolved) };

const count = (r: { findings: { checkId: string }[] }, id: string): number => r.findings.filter((f) => f.checkId === id).length;
const colours = (file: string, src: string): string[] =>
  lintDsUsageOnMarkup(src, { ...DS, file }).findings.filter((f) => f.checkId === "hardcoded-color").map((f) => /'([^']+)'/.exec(f.message)?.[1] ?? "?");

describe("a style written inside a template literal is read once", () => {
  it("a <style> block in a .ts template: one record, one colour finding, one font finding", () => {
    const src = "export const page = `<html><head><style>\n.a { color: #ffffff; font-family: Menlo; }\n</style></head></html>`;\n";
    expect(extractUiRecords("page.ts", src).filter((r) => r.styles !== "")).toHaveLength(1);
    const r = lintDsUsageOnMarkup(src, { ...DS, file: "page.ts" });
    expect(count(r, "hardcoded-color")).toBe(1);
    expect(count(r, "off-system-font")).toBe(1);
    expect(r.errorCount).toBe(2);
  });

  it("an inline style= in a .tsx template literal: one record, one colour finding, one font finding", () => {
    const src = "export const row = `<p style=\"color:#ffffff;font-family:Menlo\">x</p><i>{k: v}</i>`;\n";
    expect(extractUiRecords("row.tsx", src).filter((r) => r.styles.includes("#ffffff"))).toHaveLength(1);
    const r = lintDsUsageOnMarkup(src, { ...DS, file: "row.tsx" });
    expect(count(r, "hardcoded-color")).toBe(1);
    expect(count(r, "off-system-font")).toBe(1);
  });

  it("two <style> blocks and one inline style in one template give exactly three findings", () => {
    const src = "export const p = `<style>.a{color:#111111}</style><b style=\"color:#222222\"></b><style>.b{color:#333333}</style>`;";
    expect(colours("p.js", src).sort()).toEqual(["#111111", "#222222", "#333333"]);
  });

  it("CSS-in-JS that is only a template literal is still read, once", () => {
    expect(colours("s.ts", "export const S = `\n.a { color: #abcdef; }\n`;")).toEqual(["#abcdef"]);
  });
});

describe("hardcoded-color keeps colours after a quoted segment", () => {
  it("a script object with quoted colours finds a colour (as before the closing-quote handling)", () => {
    const html = `<script>const o = { color: dark ? '#ffffff' : '#000000', background: "#123456" };</script>`;
    expect(colours("p.html", html).length).toBeGreaterThan(0);
    expect(colours("p.html", html)).toContain("#ffffff");
  });

  it("an SVG data URI with a quoted stroke colour is found", () => {
    const css = `<style>.a { background: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><path stroke='#ff0000'/></svg>"); }</style>`;
    expect(colours("p.html", css)).toEqual(["#ff0000"]);
  });

  it("each declaration after a quoted one is its own finding", () => {
    expect(colours("p.html", `<style>.a { color: "#111111"; border-color: #222222; }</style>`)).toEqual(["#111111", "#222222"]);
  });

  it("an inline style still ends at its closing quote: a hex in the next attribute is not a colour, a last declaration without ';' is", () => {
    expect(colours("p.html", `<p style="color:var(--typography-font-family-sans)" title="#ff0000 is red">x</p>`)).toEqual([]);
    expect(colours("p.html", `<i style='fill:#ff0000'></i><b>#00ff00;</b>`)).toEqual(["#ff0000"]);
  });
});

describe("an interpolated var name is a dynamic reference", () => {
  it("var(--${name}) is counted as not evaluated and is not an undeclared-token error", () => {
    const src = "export const s = `.a { color: var(--${name}); background: var(--color-${tone}-fill); }`;";
    const r = lintDsUsageOnMarkup(src, { ...DS, file: "s.ts" });
    expect(count(r, "undeclared-token")).toBe(0);
    expect(r.errorCount).toBe(0);
    expect(r.unevaluatedVarCount).toBe(2);
  });

  it("a plain undeclared var next to it is still an error, and is not counted as dynamic", () => {
    const src = "export const s = `.a { color: var(--${name}); background: var(--nowhere); }`;";
    const r = lintDsUsageOnMarkup(src, { ...DS, file: "s.ts" });
    expect(count(r, "undeclared-token")).toBe(1);
    expect(r.unevaluatedVarCount).toBe(1);
  });

  it("in HTML a literal ${ } is not interpolation: nothing is counted", () => {
    const r = lintDsUsageOnMarkup(`<style>.a { color: var(--nowhere); }</style>`, { ...DS, file: "p.html" });
    expect(r.unevaluatedVarCount).toBe(0);
    expect(count(r, "undeclared-token")).toBe(1);
  });
});

describe("an empty first font family is not a family", () => {
  const fonts = (css: string): number => count(lintDsUsageOnMarkup(`<style>${css}</style>`, { ...DS, file: "p.html" }), "off-system-font");

  it("'font-family: \"\", Menlo' judges Menlo, which is not declared", () => {
    expect(fonts(`.a { font-family: "", Menlo; }`)).toBe(1);
    expect(fonts(`.a { font-family: '', monospace; }`)).toBe(1);
  });

  it("'font-family: \"\", Inter' passes because Inter is declared", () => {
    expect(fonts(`.a { font-family: "", Inter; }`)).toBe(0);
  });

  it("a stack that is only empty names is not a declaration to judge", () => {
    expect(fonts(`.a { font-family: ""; }`)).toBe(0);
  });
});

describe("hostile input does not make a scan super-linear (small input, generous budget)", () => {
  const N = 50_000;
  /** [file, body, whether the whole lint is bounded too]. HTML openers still reach older selector-block scans, so those cases bound the extractor only. */
  const cases: [string, string, boolean][] = [
    ["brace-colon.ts", "{a:".repeat(N / 3), true],
    ["font-family.ts", ".a{" + "font-family:a ".repeat(N / 14), true],
    ["color-color.html", "<style>" + "color:color:".repeat(N / 11), true],
    ["interpolation.ts", "${".repeat(N / 2), true],
    ["style-object.tsx", "style={{a ".repeat(N / 10), true],
    ["open-comment.ts", "/*" + "a".repeat(N), true],
    ["escaped-backticks.ts", "`\\".repeat(N / 2), true],
    ["open-html-comment.html", "<!--" + "a".repeat(N), false],
    ["open-style.html", "<style>a".repeat(N / 8), false],
    ["open-tags.html", "<style".repeat(N / 6), false],
  ];
  const budget = (label: string, run: () => void): void => {
    run(); // warm the engine on the same shape
    const t0 = performance.now();
    run();
    const ms = performance.now() - t0;
    expect(ms, `${label}: ${Math.round(ms)} ms`).toBeLessThan(250);
  };
  it.each(cases)("extraction of %s", (file, body) => {
    budget(file, () => extractUiRecords(file, body));
  });
  it.each(cases.filter((c) => c[2]))("lint of %s", (file, body) => {
    budget(file, () => lintDsUsageOnMarkup(body, { ...DS, file }));
  });
});
