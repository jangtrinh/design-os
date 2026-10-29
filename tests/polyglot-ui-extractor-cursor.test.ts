/**
 * An extractor scan that skips a span must still carry the skipped source text forward: text that goes
 * missing moves every later offset, so findings after it vanish or land on the wrong line. Each case puts an
 * unusual construct before a class list and asserts the class list is still found, on its own line.
 */
import { describe, expect, it } from "vitest";
import { extractUiRecords } from "../src/core/polyglot-ui-extractor.js";
import { lintDsUsageOnMarkup } from "../src/core/ds-usage-lint.js";
import { fontTokenModel } from "../src/core/ds-usage-font-check.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { declaredCssVarNames } from "../src/core/token-emit.js";

const tail = `\nconst Z = () => <p\n  className="font-serif">y</p>;\n`;
const serifLines = (file: string, src: string): number[] =>
  extractUiRecords(file, src).filter((r) => r.classes.includes("font-serif")).map((r) => r.line);

describe("a skipped span keeps the later lines in place", () => {
  it("style={{ ... }} whose body holds a nested brace (the closer is not }})", () => {
    const src = `const A = () => <p className="font-serif" style={{ a: f({x: 1}) }}>x</p>;\nconst B = 1;\nconst C = () => <p\n  className="font-serif">y</p>;\n`;
    expect(serifLines("A.tsx", src)).toEqual([1, 4]);
  });

  it("style={{ ... } as React.CSSProperties}", () => {
    const src = `const A = () => <p className="font-serif" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>x</p>;\nconst B = 1;\nconst C = () => <p\n  className="font-serif">y</p>;\n`;
    expect(serifLines("A.tsx", src)).toEqual([1, 4]);
  });

  it("two such style props in one file, each followed by a class list", () => {
    const one = `<p style={{ a: g({}) }} className="font-serif">x</p>`;
    const src = `${one}\n${one}\n${one}\n`;
    expect(serifLines("M.tsx", src)).toEqual([1, 2, 3]);
  });

  it("style={{ with no closing brace anywhere", () => {
    expect(serifLines("U.tsx", `const A = () => <p style={{ a: 1` + tail)).toEqual([3]);
  });

  it("a <style opener whose > never comes", () => {
    expect(serifLines("U.svelte", `<style` + tail)).toEqual([3]);
  });

  it("a <style> block that is never closed", () => {
    expect(serifLines("U.vue", `<style>.a { color: red; }` + tail)).toEqual([3]);
  });

  it("a comment that is never closed (CSS and HTML)", () => {
    expect(serifLines("U.tsx", `/* open` + tail)).toEqual([3]);
    expect(serifLines("U.vue", `<!-- open` + tail)).toEqual([3]);
  });

  it("an interpolation that is never closed", () => {
    expect(serifLines("U.ts", "const s = `a ${ b" + tail)).toEqual([3]);
  });

  it("a read style block, inline style and style object each leave later lines where they were", () => {
    const src = `<style>\n.a { color: red; }\n</style>\n<i style="color: blue"></i>\n<p style={{ a: 1 }} className="font-serif">x</p>\n`;
    expect(serifLines("W.svelte", src)).toEqual([5]);
  });
});

describe("findings after a skipped span keep their lines through the linter", () => {
  const ds = resolveTokens(parseTokenFile({ fontFamily: { sans: { $type: "fontFamily", $value: ["Inter", "sans-serif"] } } }));
  const opts = { declaredVars: declaredCssVarNames(ds), fonts: fontTokenModel(ds) };

  it("font-serif after style={{ ... } as React.CSSProperties} is reported on its own line", () => {
    const src = `const A = () => <div style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />;\nconst B = 1;\nconst C = () => <p\n  className="font-serif">y</p>;\n`;
    const r = lintDsUsageOnMarkup(src, { ...opts, file: "App.tsx" });
    expect(r.findings.filter((f) => f.checkId === "off-system-font").map((f) => f.line)).toEqual([4]);
  });

  it("the A.tsx repro reports both findings, lines 1 and 4", () => {
    const src = `const A = () => <p className="font-serif" style={{ a: f({x: 1}) }}>x</p>;\nconst B = 1;\nconst C = () => <p\n  className="font-serif">y</p>;\n`;
    const r = lintDsUsageOnMarkup(src, { ...opts, file: "A.tsx" });
    expect(r.findings.filter((f) => f.checkId === "off-system-font").map((f) => f.line)).toEqual([1, 4]);
  });
});
