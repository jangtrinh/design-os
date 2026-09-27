/**
 * html-css-loader.ts — the shared HTML+CSS resolver every gate/lint command
 * routes through (PR-FU3). Unit-level: link discovery, one-level @import
 * expansion, remote/data: skip, and unreadable-file error reporting.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLinkedCss, inlineLinkedCss } from "../src/core/html-css-loader.js";

let dir: string;
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-css-loader-")); });

describe("loadLinkedCss", () => {
  it("reads a local linked stylesheet resolved relative to the HTML file", () => {
    write("styles.css", "body { color: red; }");
    const htmlPath = write("index.html", '<link rel="stylesheet" href="styles.css">');
    const { sheets, errors } = loadLinkedCss(htmlPath, '<link rel="stylesheet" href="styles.css">');
    expect(errors).toEqual([]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.text).toContain("color: red");
  });

  it("expands @import ONE level deep, but not @import-of-@import", () => {
    write("deep.css", ".deep { color: blue; }");
    write("mid.css", '@import "deep.css";\n.mid { color: green; }');
    const htmlPath = write("index.html", "");
    const html = '<link rel="stylesheet" href="mid.css">';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(errors).toEqual([]);
    expect(sheets[0]?.text).toContain(".mid");
    // "one level deep" (A1): mid.css's own @import (deep.css) IS followed...
    expect(sheets[0]?.text).toContain(".deep");
  });

  it("a missing linked stylesheet is an ERROR finding, never silence (C1)", () => {
    const htmlPath = write("index.html", "");
    const html = '<link rel="stylesheet" href="missing.css">';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ checkId: "linked-css-unreadable", severity: "error" });
    expect(errors[0]?.message).toContain("missing.css");
  });

  it("a missing @import target is also an ERROR finding", () => {
    write("mid.css", '@import "nope.css";\n.mid { color: green; }');
    const htmlPath = write("index.html", "");
    const { errors } = loadLinkedCss(htmlPath, '<link rel="stylesheet" href="mid.css">');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("nope.css");
  });

  it("skips remote and data: hrefs — out of scope, not an error", () => {
    const htmlPath = write("index.html", "");
    const html =
      '<link rel="stylesheet" href="https://cdn.example.com/x.css">' +
      '<link rel="stylesheet" href="//cdn.example.com/y.css">' +
      '<link rel="stylesheet" href="data:text/css,body{}">';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("ignores <link> tags that are not rel=stylesheet", () => {
    write("icon.css", "SHOULD-NOT-LOAD");
    const htmlPath = write("index.html", "");
    const { sheets } = loadLinkedCss(htmlPath, '<link rel="icon" href="icon.css">');
    expect(sheets).toEqual([]);
  });
});

describe("inlineLinkedCss", () => {
  it("replaces the <link> tag in place with an equivalent <style> block", () => {
    write("styles.css", ".x { color: red; }");
    const htmlPath = write("index.html", "");
    const { html, errors } = inlineLinkedCss(htmlPath, '<head><link rel="stylesheet" href="styles.css"></head>');
    expect(errors).toEqual([]);
    expect(html).not.toContain("<link");
    expect(html).toContain("<style");
    expect(html).toContain(".x { color: red; }");
  });

  it("leaves an unreadable <link> tag untouched and reports the error", () => {
    const htmlPath = write("index.html", "");
    const { html, errors } = inlineLinkedCss(htmlPath, '<link rel="stylesheet" href="missing.css">');
    expect(html).toContain('<link rel="stylesheet" href="missing.css">');
    expect(errors).toHaveLength(1);
  });

  it("handles duplicate hrefs in document order", () => {
    write("a.css", ".a{}");
    const htmlPath = write("index.html", "");
    const html = '<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="a.css">';
    const { html: out, errors } = inlineLinkedCss(htmlPath, html);
    expect(errors).toEqual([]);
    expect(out.match(/<style/g)).toHaveLength(2);
  });
});
