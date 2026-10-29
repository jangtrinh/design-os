/**
 * The script mask the landing checks stand on. Each case feeds an input the mask MUST change
 * (or must leave alone) and asserts on the masked output, so a mask that returns its input
 * unchanged, or blanks everything, goes red.
 */
import { describe, expect, it } from "vitest";
import { inlineScripts, maskJs } from "../src/core/js-source-mask.js";

describe("maskJs", () => {
  it("keeps length and newlines identical, so an index into the mask is an index into the source", () => {
    const src = 'a(); // note\n/* one\ntwo */ b("x\\"y", `t\nu`); c()';
    for (const strings of [false, true]) {
      const out = maskJs(src, strings);
      expect(out).toHaveLength(src.length);
      expect([...out].map((c) => c === "\n")).toEqual([...src].map((c) => c === "\n"));
    }
  });

  it("blanks line and block comments", () => {
    const out = maskJs("go(); // alert(1)\n/* alert(2) */ stop();", false);
    expect(out).not.toContain("alert");
    expect(out).toContain("go();");
    expect(out).toContain("stop();");
  });

  it("blanks string contents only when asked, and keeps the delimiters", () => {
    const src = 'log("alert(1)");';
    expect(maskJs(src, false)).toBe(src);
    expect(maskJs(src, true)).toBe('log("        ");');
  });

  it("does not read // inside a string as a comment", () => {
    const out = maskJs('fetch("http://x.test"); alert(1);', true);
    expect(out).toContain("alert(1);");
  });

  it("does not let an apostrophe inside a comment open a string", () => {
    const out = maskJs("// don't\nalert(1);", true);
    expect(out).toContain("alert(1);");
  });

  it("bounds an unterminated quote to its own line", () => {
    const out = maskJs("x = /\"/;\nalert(1);", true);
    expect(out).toContain("alert(1);");
  });

  it("masks a multi-line template literal whole", () => {
    const out = maskJs("t = `a\nalert(1)\nb`; go();", true);
    expect(out).not.toContain("alert");
    expect(out).toContain("go();");
  });
});

describe("inlineScripts", () => {
  const doc = [
    "<script>one()</script>",
    '<script type="module">two()</script>',
    '<script type="text/javascript">three()</script>',
    '<script type="application/ld+json">{"a":1}</script>',
    '<script type="importmap">{"imports":{}}</script>',
    '<script src="/bundle.js"></script>',
    "<script>\nfour()</script>",
  ].join("\n");

  it("returns only inline scripts a browser runs as JavaScript", () => {
    expect(inlineScripts(doc, false).map((s) => s.code.trim())).toEqual(["one()", "two()", "three()", "four()"]);
  });

  it("reports the document offset of each body", () => {
    for (const s of inlineScripts(doc, false)) {
      expect(doc.slice(s.start, s.start + s.code.length).trim()).toBe(s.code.trim());
    }
  });
});
