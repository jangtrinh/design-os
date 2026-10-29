/**
 * Polyglot UI extraction, the closed font allowlist (`off-system-font`),
 * `excludeElements` on `token-ban`, the preview chrome, and the `ds-usage` gate family.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { SPECIMEN_CHROME_CSS } from "../src/core/ds-preview-chrome.js";
import { extractUiRecords, uiSourceExtension, UI_SOURCE_EXTENSIONS } from "../src/core/polyglot-ui-extractor.js";
import { lintDsUsage, lintDsUsageOnMarkup } from "../src/core/ds-usage-lint.js";
import type { DsUsageLintOptions } from "../src/core/ds-usage-lint.js";
import { fontTokenModel } from "../src/core/ds-usage-font-check.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { declaredCssVarNames } from "../src/core/token-emit.js";
import { evaluateTokenBansDetailed, evaluateTokenBans, parseAdherenceRules } from "../src/core/adherence-rules.js";
import type { TokenBanRule } from "../src/core/adherence-rules.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/oi-browser/", import.meta.url));
const readFixture = (name: string): string => readFileSync(FIXTURES + name, "utf8");

/** Lint options built exactly the way the commands build them: from a DTCG token document. */
function optsFor(doc: unknown): DsUsageLintOptions {
  const resolved = resolveTokens(parseTokenFile(doc));
  return { declaredVars: declaredCssVarNames(resolved), fonts: fontTokenModel(resolved) };
}
const FIXTURE_DS = optsFor(JSON.parse(readFixture("tokens.json")));
const fontIds = (r: { findings: { checkId: string }[] }): string[] =>
  r.findings.filter((f) => f.checkId === "off-system-font").map((f) => f.checkId);
const quoted = (r: { findings: { checkId: string; message: string }[] }): (string | undefined)[] =>
  r.findings.filter((f) => f.checkId === "off-system-font").map((f) => /'([^']+)'/.exec(f.message)?.[1]);

const stylesOf = (file: string, src: string): string[] =>
  extractUiRecords(file, src).filter((r) => r.styles !== "").map((r) => r.styles);
const classesOf = (file: string, src: string): string[] =>
  extractUiRecords(file, src).flatMap((r) => r.classes);

describe("polyglot extractor", () => {
  it("covers exactly the seven documented extensions and nothing else", () => {
    expect([...UI_SOURCE_EXTENSIONS].sort()).toEqual([".html", ".js", ".jsx", ".svelte", ".ts", ".tsx", ".vue"]);
    expect(uiSourceExtension("a/b/Card.TSX")).toBe(".tsx");
    expect(uiSourceExtension("styles.css")).toBeUndefined();
    expect(extractUiRecords("styles.css", "a { color: red }")).toEqual([]);
  });

  it("emits one markup record per file: the whole source at line 1", () => {
    const src = `<div>\n<b>x</b>\n</div>`;
    const markup = extractUiRecords("a.html", src).filter((r) => r.markup !== "");
    expect(markup).toEqual([{ file: "a.html", line: 1, styles: "", classes: [], markup: src }]);
  });

  it("html: <style> block starts on the line of its first CSS character", () => {
    const src = `<html>\n<head>\n<style>\n.a { color: red; }\n</style>\n</head></html>`;
    const style = extractUiRecords("p.html", src).find((r) => r.styles.includes(".a"));
    expect(style?.line).toBe(3); // the newline after <style> belongs to the block; text starts on line 3
    expect(style?.styles).toContain("color: red");
  });

  it("html: inline style and class attribute are separate records with their own lines", () => {
    const src = `<p>\n<span style="font-family: ui-monospace, Menlo">a</span>\n<i class="x font-mono md:font-serif">b</i>\n</p>`;
    const rs = extractUiRecords("p.html", src);
    const inline = rs.find((r) => r.styles.includes("ui-monospace"));
    expect(inline?.line).toBe(2);
    expect(inline?.styles).toBe("*{font-family: ui-monospace, Menlo}");
    const cls = rs.find((r) => r.classes.length > 0);
    expect(cls?.line).toBe(3);
    expect(cls?.classes).toEqual(["x", "font-mono", "md:font-serif"]);
  });

  it("html: commented-out style and classes are not read", () => {
    const src = `<!-- <style>.a{font-family: ui-monospace}</style> <i class="font-mono"> -->\n<p>ok</p>`;
    expect(stylesOf("c.html", src)).toEqual([]);
    expect(classesOf("c.html", src)).toEqual([]);
  });

  it("svelte: <style>, class attribute and a conditional class expression", () => {
    const src = `<div class="a {open ? 'font-mono' : ''}">x</div>\n<style>\n  .a { font-family: Menlo; }\n</style>`;
    expect(stylesOf("C.svelte", src).join("")).toContain("font-family: Menlo");
    expect(classesOf("C.svelte", src)).toContain("font-mono");
  });

  it("vue: <style scoped> and :class array literals", () => {
    const src = `<template>\n<i :class="['font-mono', n]">x</i>\n</template>\n<style scoped>\n.b { color: #fff; }\n</style>`;
    expect(stylesOf("C.vue", src).join("")).toContain("color: #fff");
    expect(classesOf("C.vue", src)).toContain("font-mono");
  });

  it("tsx: className string, className template literal, cn() argument", () => {
    const src = [
      `export const A = () => (`,
      `  <div className="p-2 font-mono">`,
      "    <span className={`a ${x} font-serif`} />",
      `    <b className={cn("font-sans", flag && "text-xs")} />`,
      `  </div>`,
      `);`,
    ].join("\n");
    const cls = classesOf("A.tsx", src);
    expect(cls).toEqual(expect.arrayContaining(["font-mono", "font-serif", "font-sans"]));
    expect(cls.some((c) => /^_+$/.test(c))).toBe(false); // the ${x} interpolation is not a class
  });

  it("jsx: style={{ fontFamily }} is rewritten to CSS and read once, with its line", () => {
    const src = `const A = () => (\n  <p style={{ fontFamily: "ui-monospace, Menlo", color: '#fff', zIndex: 3 }}>x</p>\n);`;
    const styles = extractUiRecords("A.jsx", src).filter((r) => r.styles !== "");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.line).toBe(2);
    expect(styles[0]?.styles).toBe("*{font-family: ui-monospace, Menlo; color: #fff;}");
  });

  it("js: a CSS template literal is a style record at the literal's line; prose templates are not", () => {
    const src = "const x = 1;\nexport const STYLE = `\n.a { font-family: ui-monospace, SFMono-Regular; }\n`;\nconst msg = `hello ${x}`;";
    const styles = extractUiRecords("dock.js", src).filter((r) => r.styles !== "");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.line).toBe(2);
    expect(styles[0]?.styles).toContain("ui-monospace");
  });

  it("ts: a bare CSS-in-JS fontFamily property is read; a // comment mentioning it is not", () => {
    const src = `// fontFamily: "ui-monospace"\nexport const t = { fontFamily: 'Menlo, monospace' };`;
    const styles = extractUiRecords("t.ts", src).filter((r) => r.styles !== "");
    expect(styles.map((r) => r.styles)).toEqual(["*{font-family: Menlo, monospace;}"]);
    expect(styles[0]?.line).toBe(2);
  });

  it("an interpolation inside a CSS template literal becomes a run of underscores, not text", () => {
    const src = "export const s = `.a { font-family: ${FONT}; }`;";
    const styles = extractUiRecords("s.ts", src).filter((r) => r.styles !== "");
    expect(styles[0]?.styles).toBe(".a { font-family: _______; }");
  });
});

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const styleTag = (css: string): string => `<style>\n${css}\n</style>`;

describe("off-system-font", () => {
  it("html: an undeclared ui-monospace stack is an error carrying the code, the stack and its line", () => {
    const r = lintDsUsageOnMarkup(`<html>\n${styleTag(`.a { font-family: ${MONO}; }`)}\n</html>`, { ...FIXTURE_DS, file: "p.html" });
    expect(fontIds(r)).toEqual(["off-system-font"]);
    const f = r.findings.find((x) => x.checkId === "off-system-font");
    expect(f?.severity).toBe("error");
    expect(f?.line).toBe(3);
    expect(f?.message).toContain("OFF_SYSTEM_FONT");
    expect(f?.message).toContain("ui-monospace, SFMono-Regular");
    expect(r.errorCount).toBe(1);
  });

  it.each([
    ["p.html", `<p style="font-family: ${MONO}">x</p>`],
    ["C.svelte", `<p>x</p>\n<style>\n.a { font-family: ${MONO}; }\n</style>`],
    ["C.vue", `<template><p>x</p></template>\n<style scoped>\n.a { font-family: ${MONO}; }\n</style>`],
    ["C.tsx", `export const A = () => <p style={{ fontFamily: "${MONO}" }}>x</p>;`],
    ["C.jsx", `export const A = () => <p className="font-mono">x</p>;`],
    ["d.js", "export const S = `\n.a { font-family: " + MONO + "; }\n`;"],
    ["t.ts", `export const t = { fontFamily: "${MONO}" };`],
  ])("%s: monospace the design system does not declare is an off-system-font error", (file, src) => {
    const r = lintDsUsageOnMarkup(src, { ...FIXTURE_DS, file });
    expect(fontIds(r), file).toEqual(["off-system-font"]);
    expect(r.errorCount).toBe(1);
  });

  it("a declared first family passes whatever follows it: Inter and Playfair Display, any case or quoting", () => {
    for (const stack of ['"Inter", sans-serif', "inter", "'INTER', ui-monospace", "Inter, -apple-system, BlinkMacSystemFont, sans-serif", '"Playfair Display", Georgia, serif']) {
      const r = lintDsUsageOnMarkup(styleTag(`.a { font-family: ${stack}; }`), { ...FIXTURE_DS, file: "p.html" });
      expect(fontIds(r), stack).toEqual([]);
    }
  });

  it("an undeclared primary family fails even with a generic fallback after it", () => {
    for (const stack of ["Georgia, serif", "system-ui, sans-serif", "Menlo, monospace", "Monaco, monospace", "Consolas, monospace", "SFMono-Regular, monospace", "ui-sans-serif, sans-serif", "ui-monospace, Inter, sans-serif", "SFMono-Regular, 'Playfair Display'"]) {
      const r = lintDsUsageOnMarkup(styleTag(`.a { font-family: ${stack}; }`), { ...FIXTURE_DS, file: "p.html" });
      expect(fontIds(r), stack).toEqual(["off-system-font"]);
    }
  });

  it("CSS-wide keywords pass, including with !important", () => {
    for (const v of ["inherit", "initial", "unset", "revert", "revert-layer", "inherit !important"]) {
      const r = lintDsUsageOnMarkup(styleTag(`.a { font-family: ${v}; }`), { ...FIXTURE_DS, file: "p.html" });
      expect(fontIds(r), v).toEqual([]);
    }
  });

  it("var(): a DS token passes, a page-declared var is the existing warning, an undeclared one the existing error", () => {
    const css = ":root { --font-page: monospace; }\n.a { font-family: var(--typography-font-family-sans); }\n.b { font-family: var(--font-page); }\n.c { font-family: var(--nowhere); }";
    const r = lintDsUsageOnMarkup(styleTag(css), { ...FIXTURE_DS, file: "p.html" });
    expect(fontIds(r)).toEqual([]);
    expect(r.findings.map((f) => `${f.checkId}:${f.severity}`).sort()).toEqual(["off-system-token:warning", "undeclared-token:error"]);
  });

  it("declaration blocks and @font-face bodies are not applications and are not checked", () => {
    const css = `:root { font-family: ${MONO}; }\n@font-face { font-family: "Brand Sans"; src: url(a.woff2); }\n.ok { font-family: inherit; }`;
    expect(fontIds(lintDsUsageOnMarkup(styleTag(css), { ...FIXTURE_DS, file: "p.html" }))).toEqual([]);
  });

  it("a --font-family custom property inside a component rule is not a font-family declaration", () => {
    const r = lintDsUsageOnMarkup(styleTag(`.a { --font-family: ${MONO}; --font-family-x: ${MONO}; }`), { ...FIXTURE_DS, file: "p.html" });
    expect(fontIds(r)).toEqual([]);
  });

  it("a build-time interpolated family is counted as unevaluated, never silently passed", () => {
    const r = lintDsUsageOnMarkup("export const s = `.a { font-family: ${FONT}; }`;", { ...FIXTURE_DS, file: "s.ts" });
    expect(fontIds(r)).toEqual([]);
    expect(r.unevaluatedFontCount).toBe(1);
  });

  it("Tailwind utilities: font-sans is backed by the fixture's *-sans token; font-mono and font-serif are not", () => {
    const r = lintDsUsageOnMarkup(`<p class="font-sans md:font-mono hover:!font-serif">x</p>`, { ...FIXTURE_DS, file: "p.html" });
    expect(quoted(r)).toEqual(["md:font-mono", "hover:!font-serif"]);
  });

  it("a DS that declares a mono token backs both its first family and the font-mono utility", () => {
    const ds = optsFor({ typography: { "font-family-mono": { $type: "fontFamily", $value: "JetBrains Mono, monospace" }, "font-family-sans": { $type: "fontFamily", $value: "Inter, sans-serif" } } });
    expect(fontIds(lintDsUsageOnMarkup(`<p class="font-mono" style="font-family: 'JetBrains Mono', monospace">x</p>`, { ...ds, file: "p.html" }))).toEqual([]);
    expect(fontIds(lintDsUsageOnMarkup(`<p style="font-family: ui-monospace">x</p>`, { ...ds, file: "p.html" }))).toEqual(["off-system-font"]);
  });

  it("a DS whose own mono token starts with ui-monospace backs ui-monospace (the face is declared, not invented)", () => {
    const ds = optsFor({ typography: { "font-family-code": { $type: "fontFamily", $value: "ui-monospace, Menlo, monospace" } } });
    expect(fontIds(lintDsUsageOnMarkup(`<p style="font-family: ui-monospace, SFMono-Regular">x</p>`, { ...ds, file: "p.html" }))).toEqual([]);
  });

  it("a sans-serif token backs font-sans and NOT font-serif; a stack array value is read by its first element", () => {
    const ds = optsFor({ typography: { "font-family-sans-serif": { $type: "fontFamily", $value: ["Inter", "sans-serif"] } } });
    const r = lintDsUsageOnMarkup(`<p class="font-sans font-serif" style="font-family: Inter">x</p>`, { ...ds, file: "p.html" });
    expect(quoted(r)).toEqual(["font-serif"]);
  });

  describe("a design system with no fontFamily token (owner ruling: the font rule does not run, and says so)", () => {
    const COLOUR_ONLY = optsFor({ colors: { brand: { $type: "color", $value: "#3b82f6" } } });
    const NOTE = "off-system-font: the design system declares no fontFamily token";
    const page = `<style>.a { font-family: ui-monospace, Menlo; color: #ff0000; }</style><p class="font-mono">x</p>`;

    it("a monospace stack and a font-mono utility are not findings; the skip is reported on the result", () => {
      const r = lintDsUsageOnMarkup(page, { ...COLOUR_ONLY, file: "p.html" });
      expect(fontIds(r)).toEqual([]);
      expect(r.offSystemFontCount).toBe(0);
      expect(r.skippedChecks).toEqual([NOTE]);
    });

    it("the colour checks still run", () => {
      const r = lintDsUsageOnMarkup(page, { ...COLOUR_ONLY, file: "p.html" });
      expect(r.findings.map((f) => f.checkId)).toEqual(["hardcoded-color"]);
    });

    it("every polyglot type is skipped the same way", () => {
      for (const [file, src] of [["C.svelte", `<style>.a { font-family: ui-monospace; }</style>`], ["C.tsx", `export const A = () => <p className="font-mono" style={{ fontFamily: "ui-monospace" }}>x</p>;`], ["t.ts", `export const t = { fontFamily: "Menlo" };`]] as const) {
        const r = lintDsUsageOnMarkup(src, { ...COLOUR_ONLY, file });
        expect({ file, ids: fontIds(r), skipped: r.skippedChecks }).toEqual({ file, ids: [], skipped: [NOTE] });
      }
    });

    it("a design system WITH a fontFamily token keeps the closed allowlist and reports no skip", () => {
      const r = lintDsUsageOnMarkup(page, { ...FIXTURE_DS, file: "p.html" });
      expect(fontIds(r)).toEqual(["off-system-font", "off-system-font"]);
      expect(r.skippedChecks).toEqual([]);
    });

    it("without a font model at all (the colour-only call shape) nothing is skipped or reported", () => {
      const r = lintDsUsage(page, { declaredVars: COLOUR_ONLY.declaredVars });
      expect(r.skippedChecks).toEqual([]);
    });

    it("a typography-composite-only DS has fonts to compare against: the rule runs and its hint does not claim there is none", () => {
      const ds = optsFor({ type: { body: { $type: "typography", $value: { fontFamily: "Inter, sans-serif", fontSize: "16px" } } } });
      const r = lintDsUsageOnMarkup(`<p style="font-family: Arial">x</p>`, { ...ds, file: "p.html" });
      expect(fontIds(r)).toEqual(["off-system-font"]);
      expect(r.skippedChecks).toEqual([]);
      expect(r.findings[0]?.message).not.toContain("declares no fontFamily token");
    });
  });

  it("without a font model the font check does not run (the colour-only call shape is unchanged)", () => {
    const html = styleTag(`.a { font-family: ${MONO}; color: #ff0000; }`);
    const r = lintDsUsage(html, { declaredVars: FIXTURE_DS.declaredVars });
    expect(r.findings.map((f) => f.checkId)).toEqual(["hardcoded-color"]);
  });

  it("lintDsUsage(html, opts) and lintDsUsageOnMarkup(html, opts) agree for HTML", () => {
    const html = styleTag(`.a { font-family: ${MONO}; color: #ff0000; }`);
    expect(lintDsUsageOnMarkup(html, { ...FIXTURE_DS, file: "p.html" })).toEqual(lintDsUsage(html, FIXTURE_DS));
  });

  it("non-HTML sources keep the colour and token checks, with lines mapped back to the file", () => {
    const src = "const x = 1;\nexport const S = `\n.a { color: #ff0000; background: var(--nope); }\n`;";
    const r = lintDsUsageOnMarkup(src, { ...FIXTURE_DS, file: "d.js" });
    expect(r.findings.map((f) => `${f.checkId}@${f.line}`).sort()).toEqual(["hardcoded-color@3", "undeclared-token@3"]);
  });

  it("oi-browser fixtures: the bad screen carries off-system-font on the monospace stack, the good screen and the anchor carry none", () => {
    const bad = lintDsUsage(readFixture("settings-cli-core-bad.html"), FIXTURE_DS);
    const badFont = bad.findings.filter((f) => f.checkId === "off-system-font");
    expect(badFont.length).toBeGreaterThan(0);
    expect(badFont.every((f) => f.message.includes("ui-monospace, SFMono-Regular"))).toBe(true);
    expect(fontIds(lintDsUsage(readFixture("settings-cli-core-good.html"), FIXTURE_DS))).toEqual([]);
    expect(fontIds(lintDsUsage(readFixture("settings-account.html"), FIXTURE_DS))).toEqual([]);
  });
});

describe("token-ban excludeElements", () => {
  const ban = (over: Record<string, unknown> = {}): TokenBanRule => {
    const text = JSON.stringify({ rules: [{ id: "no-mono", kind: "token-ban", severity: "error", message: "no mono", source: "monospace ban", tokens: ["font-mono"], ...over }] });
    return parseAdherenceRules(text, "r.json", "binding")[0]!.rule as TokenBanRule;
  };
  const parseErr = (over: Record<string, unknown>): string => {
    try { ban(over); } catch (e) { return (e as Error).message; }
    return "";
  };

  it("an occurrence inside <code>/<pre> (open tag included) is not a finding but is counted and located", () => {
    const text = `<p class="font-mono">a</p>\n<code class="rounded font-mono">b</code>\n<pre>\n<span class="font-mono">c</span>\n</pre>`;
    const r = evaluateTokenBansDetailed([ban({ excludeElements: ["code", "pre"] })], text);
    expect(r.findings.map((f) => f.line)).toEqual([1]);
    expect(r.excluded.map((e) => [e.ruleId, e.token, e.line, e.element])).toEqual([["no-mono", "font-mono", 2, "code"], ["no-mono", "font-mono", 4, "pre"]]);
  });

  it("without excludeElements nothing is excluded (existing behaviour)", () => {
    const text = `<code class="font-mono">b</code>`;
    expect(evaluateTokenBansDetailed([ban()], text).excluded).toEqual([]);
    expect(evaluateTokenBans([ban()], text)).toHaveLength(1);
  });

  it("matching is by tag name, nested same-name elements close correctly, an unclosed element excludes nothing", () => {
    const nested = `<code>a <code>b</code> font-mono </code> font-mono`;
    const n = evaluateTokenBansDetailed([ban({ excludeElements: ["CODE"] })], nested);
    expect(n.excluded).toHaveLength(1);
    expect(n.findings).toHaveLength(1);
    const unclosed = evaluateTokenBansDetailed([ban({ excludeElements: ["code"] })], `<code> font-mono`);
    expect(unclosed.excluded).toEqual([]);
    expect(unclosed.findings).toHaveLength(1);
    // A self-closing <code/> opens nothing, so a later stray </code> does not make a range out of it.
    expect(evaluateTokenBansDetailed([ban({ excludeElements: ["code"] })], `<code/>a font-mono</code>`).findings).toHaveLength(1);
    // The element's range is [open tag start, close tag end): the opening tag is inside, the first character after the close is not.
    const edge = evaluateTokenBansDetailed([ban({ tokens: ["<code", "font-mono"], excludeElements: ["code"] })], `a\n<code>x</code>font-mono`);
    expect(edge.excluded.map((e) => e.token)).toEqual(["<code"]);
    expect(edge.findings.map((f) => [f.token, f.line])).toEqual([["font-mono", 2]]);
    // <codex> and <preview> are different elements and must not open a <code>/<pre> range
    expect(evaluateTokenBansDetailed([ban({ excludeElements: ["code", "pre"] })], `<codex>font-mono</codex><preview>font-mono</preview>`).findings).toHaveLength(2);
  });

  it("only the rule that lists the element excludes: two rules, one scoped", () => {
    const scoped = ban({ excludeElements: ["code"] });
    const plain = { ...ban({ tokens: ["font-mono"] }), id: "ns-02" };
    const r = evaluateTokenBansDetailed([scoped, plain], `<code>font-mono</code>`);
    expect(r.findings.map((f) => f.ruleId)).toEqual(["ns-02"]);
    expect(r.excluded.map((e) => e.ruleId)).toEqual(["no-mono"]);
  });

  it("validates the field: array of tag-name strings, no blanks, no repeats, unknown keys still rejected", () => {
    expect(parseErr({ excludeElements: "code" })).toContain("excludeElements");
    expect(parseErr({ excludeElements: [""] })).toContain("excludeElements[0]");
    expect(parseErr({ excludeElements: ["<code>"] })).toContain("excludeElements[0]");
    expect(parseErr({ excludeElements: ["code", "CODE"] })).toContain("excludeElements[1]");
    expect(parseErr({ excludeElements: [3] })).toContain("excludeElements[0]");
    expect(parseErr({ excludeElement: ["code"] })).toContain("is not a field of a 'token-ban' rule");
    expect(parseErr({ excludeElements: ["code", "my-widget"] })).toBe("");
  });

  it("real data: a monospace ban over the frozen native route excludes the account receipt <code>", () => {
    const js = readFixture("source/native/account-route-node-71.C77w0PPh.js");
    expect(evaluateTokenBans([ban()], js)).toHaveLength(1);
    const r = evaluateTokenBansDetailed([ban({ excludeElements: ["code", "pre"] })], js);
    expect(r.findings).toEqual([]);
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]?.element).toBe("code");
  });
});

describe("hardcoded-color value boundary (found by linting the generated specimen)", () => {
  const colours = (html: string): string[] =>
    lintDsUsage(html, { declaredVars: new Set(["--color-a"]) }).findings
      .filter((f) => f.checkId === "hardcoded-color").map((f) => /'([^']+)'/.exec(f.message)?.[1] ?? "?");

  it("an inline style that ends without ';' does not run on into the page text and read a swatch label as a colour", () => {
    const html = `<div style="background:var(--color-a);color:var(--color-a)">Aa</div><code>#D5E5FF / #000114 &middot; 16:1</code>`;
    expect(colours(html)).toEqual([]);
  });

  it("the LAST declaration of an inline style is still read when it has no ';', in a tag followed by more markup", () => {
    expect(colours(`<i style="width:87%;background:#e67f43"></i><b>x</b>`)).toEqual(["#e67f43"]);
    expect(colours(`<i style='color:rgb(1,2,3)'></i>`)).toEqual(["rgb(1,2,3)"]);
  });

  it("the quote that closes an inline style ends the value: a hex in the NEXT attribute is not a colour", () => {
    expect(colours(`<p style="color:var(--color-a)" title="#ff0000 is red">x</p>`)).toEqual([]);
  });

  it("a quoted segment inside a value is part of it: a colour after url(\"...\") is still found", () => {
    expect(colours(`<style>.a { background: url("a.png") #ff0000; }</style>`)).toEqual(["#ff0000"]);
  });

  it("a stray ')' in a value does not stop the closing quote from ending it", () => {
    expect(colours(`<p style="color:var(--color-a))" title="#ff0000 is red">x</p>`)).toEqual([]);
  });

  it("a quoted string value (a JS object literal in a <script>) is read as that string", () => {
    expect(colours(`<script>new Chart(c, { ticks: { color: '#8A93A3' }, grid: { color: "#363B45" } });</script>`)).toEqual(["#8A93A3", "#363B45"]);
  });

  it("parentheses nest to any depth: a hex three groups deep inside a gradient is still found", () => {
    const css = `<style>.a { background:\n radial-gradient(60% 80% at 15% 10%, color-mix(in srgb, var(--color-a) 55%, #ff0000), transparent); }</style>`;
    expect(colours(css)).toEqual(["#ff0000"]);
  });

  it("a declaration closed by '}' with no ';' is still read, across a newline", () => {
    expect(colours(`<style>.a { color:\n #fff\n}</style>`)).toEqual(["#fff"]);
  });
});

describe("generated preview chrome passes the font allowlist with no exemption", () => {
  const PERSONA_DATA = fileURLToPath(new URL("../knowledge/personas/personas.json", import.meta.url));
  const quiet = (args: string[]): number => {
    const o = process.stdout.write.bind(process.stdout);
    const e = process.stderr.write.bind(process.stderr);
    process.stdout.write = () => true;
    process.stderr.write = () => true;
    try { return run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  };
  /** Strip CSS comments so an assertion reads the rules, never the prose that explains them. */
  const noComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the chrome stylesheet declares its own mono token and applies it by var(), never as a literal stack", () => {
    const css = noComments(SPECIMEN_CHROME_CSS);
    expect(css).toMatch(/:root\s*\{[^}]*--ds-chrome-font-mono\s*:\s*ui-monospace,\s*Menlo,\s*monospace/);
    const applied = [...css.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => (m[1] as string).trim());
    expect(applied.filter((v) => /mono|menlo/i.test(v))).toEqual(["var(--ds-chrome-font-mono)", "var(--ds-chrome-font-mono)", "var(--ds-chrome-font-mono)"]);
  });

  it("a real ds init + ds preview specimen and a per-component page have 0 ds-usage errors, font rule included", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-chrome-font-"));
    try {
      expect(quiet(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument", "--dir", dir, "--persona-data", PERSONA_DATA])).toBe(0);
      expect(quiet(["ds", "preview", "--dir", dir])).toBe(0);
      expect(quiet(["ds", "preview", "--dir", dir, "--split", join(dir, "pages")])).toBe(0);
      const ds = optsFor(JSON.parse(readFileSync(join(dir, "design", "design.tokens.json"), "utf8")));
      expect(ds.fonts?.firstFamilies.size, "the kit DS declares font tokens").toBeGreaterThan(0);
      for (const file of [join(dir, "design", "preview", "specimen.html"), join(dir, "pages", "control-button.html")]) {
        const html = readFileSync(file, "utf8");
        expect(html, file).toContain("--ds-chrome-font-mono");
        const r = lintDsUsage(html, ds);
        expect(r.findings.filter((f) => f.severity === "error"), file).toEqual([]);
        expect(r.offSystemFontCount, file).toBe(0);
        // The chrome var is page-declared, not a DS token: a warning by the colour model, never an error.
        expect(r.findings.some((f) => f.checkId === "off-system-token" && f.message.includes("--ds-chrome-font-mono")), file).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
