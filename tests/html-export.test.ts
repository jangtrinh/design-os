import { describe, expect, it } from "vitest";
import {
  cleanHtmlForExport,
  minifyHtml,
  toSafeFilename,
  toProjectPrefix,
  enhanceAccessibility,
} from "../src/core/html-export.js";

// ─── cleanHtmlForExport ───────────────────────────────────────────────────────

describe("cleanHtmlForExport", () => {
  it("wraps a bare fragment in a full HTML scaffold", () => {
    const result = cleanHtmlForExport("<div>hello</div>");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result.toLowerCase()).toContain("<html");
    expect(result).toContain("<div>hello</div>");
  });

  it("adds lang=en, title, charset, and viewport to a wrapped fragment", () => {
    const result = cleanHtmlForExport("<p>hi</p>", "Test Title");
    expect(result).toContain('lang="en"');
    expect(result).toContain("<title>Test Title</title>");
    expect(result).toContain("UTF-8");
    expect(result).toContain("viewport");
  });

  it("strips preamble text before <!doctype", () => {
    const input = "Here is your component:\n<!doctype html><html><body></body></html>";
    const result = cleanHtmlForExport(input);
    expect(result.toLowerCase().trimStart()).toMatch(/^<!doctype/);
  });

  it("strips preamble text before <html when no doctype", () => {
    const input = "Description:\n<html><head></head><body></body></html>";
    const result = cleanHtmlForExport(input);
    expect(result.toLowerCase().trimStart()).toMatch(/^<!doctype|^<html/);
  });

  it("adds viewport meta to a full doc missing it", () => {
    const input = "<!doctype html><html lang='en'><head><meta charset='UTF-8'></head><body></body></html>";
    const result = cleanHtmlForExport(input);
    expect(result).toContain("viewport");
  });

  it("adds charset meta to a full doc missing it", () => {
    const input = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const result = cleanHtmlForExport(input);
    expect(result).toContain("charset");
  });

  it("replaces an existing <title> with the provided title", () => {
    const input = "<!doctype html><html><head><title>Old</title></head><body></body></html>";
    const result = cleanHtmlForExport(input, "New Title");
    expect(result).toContain("<title>New Title</title>");
    expect(result).not.toContain("<title>Old</title>");
  });

  it("adds a <title> when none exists in the full doc", () => {
    const input = "<!doctype html><html><head></head><body></body></html>";
    const result = cleanHtmlForExport(input, "Added Title");
    expect(result).toContain("<title>Added Title</title>");
  });
});

// ─── minifyHtml ───────────────────────────────────────────────────────────────

describe("minifyHtml", () => {
  it("removes HTML comments", () => {
    const result = minifyHtml("<!-- comment --><p>text</p>");
    expect(result).not.toContain("<!--");
    expect(result).toContain("<p>text</p>");
  });

  it("collapses multiple blank lines into one", () => {
    const result = minifyHtml("<p>a</p>\n\n\n<p>b</p>");
    expect(result).not.toMatch(/\n\s*\n/);
  });

  it("collapses runs of whitespace", () => {
    const result = minifyHtml("  <p>   text   </p>  ");
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("produces output shorter than input for a realistic document", () => {
    const input = `<!doctype html>\n\n<!-- header comment -->\n<html>\n  <body>\n    <p>  Hello  </p>\n  </body>\n</html>`;
    const result = minifyHtml(input);
    expect(result.length).toBeLessThan(input.length);
  });
});

// ─── toSafeFilename ───────────────────────────────────────────────────────────

describe("toSafeFilename", () => {
  it("lowercases and kebab-cases the name", () => {
    expect(toSafeFilename("My App Component")).toBe("my-app-component");
  });

  it("strips non-alphanumeric characters", () => {
    expect(toSafeFilename("My App!")).toBe("my-app");
  });

  it("falls back to 'component' for empty input", () => {
    expect(toSafeFilename("")).toBe("component");
  });

  it("falls back to 'component' for input that becomes empty after stripping", () => {
    expect(toSafeFilename("!!!")).toBe("component");
  });

  it("truncates at 64 characters", () => {
    const long = "a".repeat(80);
    expect(toSafeFilename(long).length).toBe(64);
  });
});

// ─── toProjectPrefix ─────────────────────────────────────────────────────────

describe("toProjectPrefix", () => {
  it("takes the first 4 words lowercased and joined with hyphens", () => {
    expect(toProjectPrefix("a b c d e")).toBe("a-b-c-d");
  });

  it("works for fewer than 4 words", () => {
    expect(toProjectPrefix("hello world")).toBe("hello-world");
  });

  it("strips non-alphanumeric chars from the result", () => {
    expect(toProjectPrefix("My Great! App Here")).toBe("my-great-app-here");
  });
});

// ─── enhanceAccessibility ─────────────────────────────────────────────────────

describe("enhanceAccessibility", () => {
  it("adds lang=en to <html> missing a lang attribute", () => {
    const result = enhanceAccessibility("<html><body></body></html>");
    expect(result).toContain('<html lang="en">');
  });

  it("does not add lang=en when lang is already present", () => {
    const input = '<html lang="fr"><body></body></html>';
    const result = enhanceAccessibility(input);
    // Should not add a second lang attribute
    expect(result.match(/lang=/g)?.length).toBe(1);
  });

  it("adds alt='' to <img> tags missing an alt attribute", () => {
    const result = enhanceAccessibility('<img src="photo.jpg">');
    expect(result).toContain('alt=""');
  });

  it("does not modify <img> that already has alt", () => {
    const input = '<img src="x.jpg" alt="desc">';
    const result = enhanceAccessibility(input);
    expect(result.match(/alt=/g)?.length).toBe(1);
  });

  it("adds rel=noopener noreferrer to target=_blank links missing rel", () => {
    const result = enhanceAccessibility('<a href="https://x.com" target="_blank">link</a>');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("does not modify links that already have rel", () => {
    const input = '<a href="x" target="_blank" rel="noopener">link</a>';
    const result = enhanceAccessibility(input);
    expect(result.match(/rel=/g)?.length).toBe(1);
  });
});
