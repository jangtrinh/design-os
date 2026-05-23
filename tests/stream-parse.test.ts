import { describe, expect, it } from "vitest";
import { stripFences, parseJsonStream } from "../src/core/stream-parse.js";

// ─── stripFences ──────────────────────────────────────────────────────────────

describe("stripFences", () => {
  it("strips a ```html prefix", () => {
    const input = "```html\n<!doctype html>\n<html></html>\n```";
    const result = stripFences(input);
    expect(result).not.toContain("```");
    expect(result).toContain("<!doctype html>");
  });

  it("strips a bare ``` prefix", () => {
    const input = "```\n<div>hello</div>\n```";
    const result = stripFences(input);
    expect(result).not.toContain("```");
    expect(result).toContain("<div>hello</div>");
  });

  it("strips a ``` suffix only", () => {
    const input = "<p>no prefix fence</p>\n```";
    const result = stripFences(input);
    expect(result).not.toContain("```");
    expect(result).toContain("<p>no prefix fence</p>");
  });

  it("returns input unchanged when no fences are present", () => {
    const input = "<!doctype html><html><body></body></html>";
    expect(stripFences(input)).toBe(input);
  });

  it("does NOT rewrite copyright years (pure deterministic transform)", () => {
    const input = "```html\n<p>© 2020 My Corp</p>\n```";
    const result = stripFences(input);
    // Year must remain exactly as written — no date-dependent mutation
    expect(result).toContain("© 2020");
  });

  it("trims surrounding whitespace after stripping fences", () => {
    const input = "```html\n\n  <p>content</p>\n\n```";
    const result = stripFences(input);
    expect(result.startsWith("<p>") || result.startsWith("\n<p>")).toBeTruthy();
    expect(result).not.toMatch(/^```/);
  });

  it("input with only fences (no content) returns empty string", () => {
    // Pathological case: the only content is the fence markers themselves.
    // ```html prefix is stripped, then the bare ``` suffix is stripped.
    // The else-if in prefix handling ensures ```html is not double-stripped as ```.
    expect(stripFences("```\n```")).toBe("");
    expect(stripFences("```html\n```")).toBe("");
  });

  it("else-if semantics: ```html is not re-processed as bare ``` prefix", () => {
    // If both checks ran independently, "```html" would first strip "```html",
    // then try to strip "``` " again — leaving no content from the "html" part.
    // The else-if ensures only one prefix rule fires.
    const input = "```html\n<p>hi</p>\n```";
    const result = stripFences(input);
    expect(result).toContain("<p>hi</p>");
    // "html" must not survive as leading text
    expect(result.trimStart()).not.toMatch(/^html/);
  });
});

// ─── parseJsonStream ─────────────────────────────────────────────────────────

describe("parseJsonStream", () => {
  it("parses a single JSON object with empty remainder", () => {
    const { objects, remainder } = parseJsonStream('{"id":"a","x":1}');
    expect(objects).toHaveLength(1);
    expect(objects[0]).toEqual({ id: "a", x: 1 });
    expect(remainder.trim()).toBe("");
  });

  it("parses two concatenated objects in order", () => {
    const { objects } = parseJsonStream('{"id":"a"}\n{"id":"b"}');
    expect(objects).toHaveLength(2);
    expect(objects[0]?.id).toBe("a");
    expect(objects[1]?.id).toBe("b");
  });

  it("handles interleaved whitespace between objects", () => {
    const { objects } = parseJsonStream('{"a":1}   \n\n   {"b":2}');
    expect(objects).toHaveLength(2);
  });

  it("silently discards malformed mid-stream brace spans; only trailing incomplete spans go to remainder", () => {
    // {bad json} is brace-balanced but not valid JSON — it is discarded by the
    // scanner (skips past its opening brace and continues). Both well-formed
    // objects before and after it are still extracted successfully.
    const buf = '{"ok":1}{bad json}{"also":2}';
    const { objects, remainder } = parseJsonStream(buf);
    expect(objects).toHaveLength(2);
    expect(objects.some((o) => (o as { ok?: number }).ok === 1)).toBe(true);
    expect(objects.some((o) => (o as { also?: number }).also === 2)).toBe(true);
    // The malformed span is discarded — it does NOT appear in remainder
    expect(remainder.trim()).toBe("");
  });

  it("puts a partial trailing object in remainder", () => {
    const { objects, remainder } = parseJsonStream('{"id":"a"}\n{"id":"b","incomple');
    expect(objects).toHaveLength(1);
    expect(objects[0]?.id).toBe("a");
    expect(remainder).toContain("incomple");
  });

  it("returns empty objects and the original string for a fully malformed buffer", () => {
    const { objects, remainder } = parseJsonStream("not json at all");
    expect(objects).toHaveLength(0);
    expect(remainder).toBe("not json at all");
  });

  it("handles an empty buffer", () => {
    const { objects, remainder } = parseJsonStream("");
    expect(objects).toHaveLength(0);
    expect(remainder).toBe("");
  });
});
