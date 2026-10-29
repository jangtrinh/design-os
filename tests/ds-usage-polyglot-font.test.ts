/**
 * Spec 031 P1 — polyglot UI extraction, the closed font allowlist (`off-system-font`),
 * `excludeElements` on `token-ban`, the preview chrome, and the `ds-usage` gate family.
 */
import { describe, expect, it } from "vitest";
import { extractUiRecords, uiSourceExtension, UI_SOURCE_EXTENSIONS } from "../src/core/polyglot-ui-extractor.js";

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
