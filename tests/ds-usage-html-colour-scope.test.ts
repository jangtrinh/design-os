/**
 * In an HTML page a colour is only a hardcoded colour where CSS lives: a <style> block, a style="..."
 * attribute, or a <script> (object literals styling elements). Page text, attribute text and code samples
 * that merely contain "color: #xxx" are content, not styling.
 */
import { describe, expect, it } from "vitest";
import { lintDsUsageOnMarkup } from "../src/core/ds-usage-lint.js";

const colours = (html: string, file = "p.html"): string[] =>
  lintDsUsageOnMarkup(html, { declaredVars: new Set<string>(), file }).findings
    .filter((f) => f.checkId === "hardcoded-color")
    .map((f) => `${/'([^']+)'/.exec(f.message)?.[1] ?? "?"}@${f.line}`);

describe("colours in page text are not styling", () => {
  it("prose, a title attribute and a code sample are not findings", () => {
    const html = `<p>Brand color: #ff385c</p>\n<p title="Text color: #333333">x</p>\n<code>background: #000</code>\n`;
    expect(colours(html)).toEqual([]);
  });

  it("text after a style block is not read as that block's value", () => {
    expect(colours(`<style>.a{color:#111111}</style><p>color: #222222</p>`)).toEqual(["#111111@1"]);
  });

  it("a value inside a style block ends at the block: it never runs into the page after it", () => {
    expect(colours(`<style>.a{color:</style>\n<p>#ff0000</p>`)).toEqual([]);
  });
});

describe("colours where CSS lives are still findings", () => {
  it("a style block, an inline style and a script object", () => {
    const html = [
      `<style>`,
      `.a { color: #111111; }`,
      `</style>`,
      `<i style="background:#222222">x</i>`,
      `<b style='fill:rgb(1,2,3)'></b>`,
      `<script>const o = { color: dark ? '#333333' : '#444444' };</script>`,
    ].join("\n");
    expect(colours(html)).toEqual(["#111111@2", "#222222@4", "rgb(1,2,3)@5", "#333333@6"]);
  });

  it("a non-HTML source is all CSS-bearing text: template-literal CSS still reads", () => {
    expect(colours("export const S = `\n.a { color: #abcdef; }\n`;", "s.ts")).toEqual(["#abcdef@2"]);
  });
});
