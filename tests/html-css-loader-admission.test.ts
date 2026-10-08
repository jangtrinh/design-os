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
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-css-loader-admission-"));
});

describe("html-css-loader admission tests", () => {
  it("produces an error finding for valid unquoted rel=stylesheet href=missing.css", () => {
    const htmlPath = write("index.html", "");
    const html = "<link rel=stylesheet href=missing.css>";
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      checkId: "linked-css-unreadable",
      severity: "error",
    });
    expect(errors[0]?.message).toContain("missing.css");

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toHaveLength(1);
    expect(inlined.html).toContain("<link rel=stylesheet href=missing.css>");
  });

  it("does NOT load or replace commented <link> tags", () => {
    write("commented.css", "body { color: blue; }");
    const htmlPath = write("index.html", "");
    const html = '<!-- <link rel="stylesheet" href="commented.css"> -->';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toEqual([]);

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toEqual([]);
    expect(inlined.html).toBe(html);
  });

  it("does NOT produce error or load for missing link inside comment", () => {
    const htmlPath = write("index.html", "");
    const html = '<!-- <link rel="stylesheet" href="missing.css"> -->';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toEqual([]);

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toEqual([]);
    expect(inlined.html).toBe(html);
  });

  it("does NOT load or replace fake <link> tags inside <script> blocks", () => {
    write("script.css", "body { color: green; }");
    const htmlPath = write("index.html", "");
    const html = '<script>const s = \'<link rel="stylesheet" href="script.css">\';</script>';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toEqual([]);

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toEqual([]);
    expect(inlined.html).toBe(html);
  });

  it("does NOT load or replace fake <link> tags inside <textarea> or <style> blocks", () => {
    const htmlPath = write("index.html", "");
    const html = '<textarea><link rel="stylesheet" href="missing.css"></textarea><style><link rel="stylesheet" href="missing.css"></style>';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toEqual([]);

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toEqual([]);
    expect(inlined.html).toBe(html);
  });

  it("loads an existing local file when href has query parameters or fragment", () => {
    write("styles.css", "body { color: purple; }");
    const htmlPath = write("index.html", "");
    const html = '<link rel="stylesheet" href="styles.css?v=1#section">';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(errors).toEqual([]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.text).toContain("color: purple");
    expect(sheets[0]?.resolvedPath).toMatch(/styles\.css$/);
    expect(sheets[0]?.href).toBe("styles.css?v=1#section");

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toEqual([]);
    expect(inlined.html).toContain("<style");
    expect(inlined.html).toContain("color: purple");
  });

  it("reports unreadable error for missing local file with query parameters or fragment", () => {
    const htmlPath = write("index.html", "");
    const html = '<link rel="stylesheet" href="missing.css?v=1#x">';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      checkId: "linked-css-unreadable",
      severity: "error",
    });
    expect(errors[0]?.message).toContain("missing.css");
  });

  it("escapes special HTML characters in href when synthesizing data-ui-linked-href", () => {
    write("styles.css", ".escaped { color: orange; }");
    const htmlPath = write("index.html", "");
    const html = '<link rel="stylesheet" href="styles.css?a=1&amp;b=&quot;test&quot;&lt;foo&gt;">';
    const { html: inlined, errors } = inlineLinkedCss(htmlPath, html);
    expect(errors).toEqual([]);
    expect(inlined).toContain('data-ui-linked-href="styles.css?a=1&amp;b=&quot;test&quot;&lt;foo&gt;"');
    expect(inlined).not.toContain('b="test"');
    expect(inlined).not.toContain("<foo>");
  });

  it("handles case-insensitive and unquoted tag and rel correctly", () => {
    write("styles.css", "h1 { font-size: 2rem; }");
    const htmlPath = write("index.html", "");
    const html = '<LINK REL=STYLESHEET HREF="styles.css">';
    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(errors).toEqual([]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.text).toContain("font-size: 2rem");
  });

  it("preserves exact document order in mixed fixture with fake commented same href, remote/missing links, and duplicate sheets with inline styles", () => {
    write("shared.css", ".shared { color: red; }");
    const htmlPath = write("index.html", "");
    const html = [
      "<head>",
      '  <!-- <link rel="stylesheet" href="shared.css"> -->',
      '  <link rel="stylesheet" href="https://example.com/remote.css">',
      '  <link rel="stylesheet" href="missing.css">',
      "  <style>.inline-a { margin: 0; }</style>",
      '  <link rel="stylesheet" href="shared.css">',
      '  <textarea><link rel="stylesheet" href="shared.css"></textarea>',
      "  <style>.inline-b { padding: 0; }</style>",
      '  <link rel="stylesheet" href="shared.css">',
      "</head>",
    ].join("\n");

    const { sheets, errors } = loadLinkedCss(htmlPath, html);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.href).toBe("shared.css");
    expect(sheets[1]?.href).toBe("shared.css");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("missing.css");

    const inlined = inlineLinkedCss(htmlPath, html);
    expect(inlined.errors).toHaveLength(1);

    expect(inlined.html).toContain('<!-- <link rel="stylesheet" href="shared.css"> -->');
    expect(inlined.html).toContain('<link rel="stylesheet" href="https://example.com/remote.css">');
    expect(inlined.html).toContain('<link rel="stylesheet" href="missing.css">');
    expect(inlined.html).toContain('<textarea><link rel="stylesheet" href="shared.css"></textarea>');
    expect(inlined.html).toContain("<style>.inline-a { margin: 0; }</style>");
    expect(inlined.html).toContain("<style>.inline-b { padding: 0; }</style>");

    const synthesizedStyles = inlined.html.match(/<style data-ui-linked-href="shared\.css">/g);
    expect(synthesizedStyles).toHaveLength(2);

    const commentIdx = inlined.html.indexOf("<!-- <link");
    const remoteIdx = inlined.html.indexOf("https://example.com/remote.css");
    const missingIdx = inlined.html.indexOf("missing.css");
    const inlineAIdx = inlined.html.indexOf(".inline-a");
    const firstSynthesizedIdx = inlined.html.indexOf('<style data-ui-linked-href="shared.css">');
    const textareaIdx = inlined.html.indexOf("<textarea");
    const inlineBIdx = inlined.html.indexOf(".inline-b");
    const secondSynthesizedIdx = inlined.html.lastIndexOf('<style data-ui-linked-href="shared.css">');

    expect(commentIdx).toBeLessThan(remoteIdx);
    expect(remoteIdx).toBeLessThan(missingIdx);
    expect(missingIdx).toBeLessThan(inlineAIdx);
    expect(inlineAIdx).toBeLessThan(firstSynthesizedIdx);
    expect(firstSynthesizedIdx).toBeLessThan(textareaIdx);
    expect(textareaIdx).toBeLessThan(inlineBIdx);
    expect(inlineBIdx).toBeLessThan(secondSynthesizedIdx);
  });
});
