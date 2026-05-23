import { describe, expect, it } from "vitest";
import {
  selectEditStrategy,
  addLineNumbers,
  parseLnDiff,
  applyLnDiff,
} from "../src/core/edit-strategy.js";

// ─── selectEditStrategy ───────────────────────────────────────────────────────

describe("selectEditStrategy", () => {
  it("returns deterministic for a color-change request", () => {
    expect(selectEditStrategy("change the color to blue")).toBe("deterministic");
  });

  it("returns deterministic for a background-change request", () => {
    expect(selectEditStrategy("make the bg to #fff")).toBe("deterministic");
  });

  it("returns deterministic for a text-replacement request with quoted value", () => {
    expect(selectEditStrategy('change the text to "Welcome"')).toBe("deterministic");
  });

  it("returns full_regen for a complete redesign request", () => {
    expect(selectEditStrategy("completely redesign the layout")).toBe("full_regen");
  });

  it("returns full_regen for a rebuild request", () => {
    expect(selectEditStrategy("rebuild the page from scratch")).toBe("full_regen");
  });

  it("returns full_regen for a overhaul request", () => {
    expect(selectEditStrategy("overhaul the entire component")).toBe("full_regen");
  });

  it("returns ln_diff as the default for moderate edits", () => {
    expect(selectEditStrategy("make the button bigger")).toBe("ln_diff");
  });

  it("returns ln_diff for adding a new section", () => {
    expect(selectEditStrategy("add a testimonials section below the hero")).toBe("ln_diff");
  });
});

// ─── addLineNumbers ───────────────────────────────────────────────────────────

describe("addLineNumbers", () => {
  it("prefixes every line with a right-aligned number and pipe", () => {
    const result = addLineNumbers("line one\nline two\nline three");
    const lines = result.split("\n");
    expect(lines[0]).toBe("1| line one");
    expect(lines[1]).toBe("2| line two");
    expect(lines[2]).toBe("3| line three");
  });

  it("pads line numbers to the width of the last line number", () => {
    const input = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = addLineNumbers(input);
    const first = result.split("\n")[0] ?? "";
    // 12 lines → 2 digits → first line has leading space
    expect(first).toMatch(/^\s+1\| /);
  });

  it("handles empty string as a single empty line", () => {
    const result = addLineNumbers("");
    // One line, numbered 1
    expect(result).toBe("1| ");
  });

  it("handles a single line without newline", () => {
    const result = addLineNumbers("hello");
    expect(result).toBe("1| hello");
  });
});

// ─── parseLnDiff ─────────────────────────────────────────────────────────────

describe("parseLnDiff", () => {
  it("parses a single chunk correctly", () => {
    const diff = `@@ line 5-5 @@\n- old line\n+ new line\n`;
    const chunks = parseLnDiff(diff);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startLine).toBe(5);
    expect(chunks[0]?.endLine).toBe(5);
    expect(chunks[0]?.oldLines).toEqual(["old line"]);
    expect(chunks[0]?.newLines).toEqual(["new line"]);
  });

  it("parses multiple chunks in order", () => {
    const diff = [
      "@@ line 3-3 @@",
      "- old a",
      "+ new a",
      "@@ line 10-11 @@",
      "- old b1",
      "- old b2",
      "+ new b",
    ].join("\n") + "\n";
    const chunks = parseLnDiff(diff);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.startLine).toBe(3);
    expect(chunks[1]?.startLine).toBe(10);
    expect(chunks[1]?.endLine).toBe(11);
  });

  it("treats two-space prefix as a context line in both old and new", () => {
    const diff = "@@ line 5-6 @@\n  context line\n- remove me\n+ add me\n";
    const chunks = parseLnDiff(diff);
    expect(chunks[0]?.oldLines).toContain("context line");
    expect(chunks[0]?.newLines).toContain("context line");
  });

  it("returns an empty array on garbage input without throwing", () => {
    expect(parseLnDiff("no markers here\njust text")).toEqual([]);
    expect(parseLnDiff("")).toEqual([]);
  });
});

// ─── applyLnDiff ─────────────────────────────────────────────────────────────

describe("applyLnDiff", () => {
  const HTML = [
    "<!doctype html>",   // 1
    "<html>",            // 2
    "<head></head>",     // 3
    "<body>",            // 4
    "  <h1>Hello</h1>",  // 5
    "  <p>World</p>",    // 6
    "</body>",           // 7
    "</html>",           // 8
  ].join("\n");

  it("applies an exact-match chunk and returns patched HTML", () => {
    const chunk = {
      startLine: 5, endLine: 5,
      oldLines: ["  <h1>Hello</h1>"],
      newLines: ["  <h1>Goodbye</h1>"],
    };
    const result = applyLnDiff(HTML, [chunk]);
    expect(result).not.toBeNull();
    expect(result).toContain("<h1>Goodbye</h1>");
    expect(result).not.toContain("<h1>Hello</h1>");
  });

  it("applies a fuzzy match when the chunk is shifted ±5 lines", () => {
    // Chunk says line 2 but the target is actually on line 5 (within ±5)
    const chunk = {
      startLine: 2, endLine: 2,
      oldLines: ["  <h1>Hello</h1>"],
      newLines: ["  <h1>Fuzzy</h1>"],
    };
    const result = applyLnDiff(HTML, [chunk]);
    expect(result).not.toBeNull();
    expect(result).toContain("<h1>Fuzzy</h1>");
  });

  it("returns null when no chunk matches within ±5 lines", () => {
    const chunk = {
      startLine: 1, endLine: 1,
      oldLines: ["<this line does not exist in the html>"],
      newLines: ["<replacement>"],
    };
    expect(applyLnDiff(HTML, [chunk])).toBeNull();
  });

  it("applies multiple chunks bottom-up preserving line numbers", () => {
    const chunks = [
      { startLine: 5, endLine: 5, oldLines: ["  <h1>Hello</h1>"], newLines: ["  <h1>A</h1>"] },
      { startLine: 6, endLine: 6, oldLines: ["  <p>World</p>"],   newLines: ["  <p>B</p>"] },
    ];
    const result = applyLnDiff(HTML, chunks);
    expect(result).not.toBeNull();
    expect(result).toContain("<h1>A</h1>");
    expect(result).toContain("<p>B</p>");
  });

  it("returns null immediately for an empty chunk list", () => {
    expect(applyLnDiff(HTML, [])).toBeNull();
  });

  it("is idempotent second pass returns null (old lines no longer present)", () => {
    const chunk = {
      startLine: 5, endLine: 5,
      oldLines: ["  <h1>Hello</h1>"],
      newLines: ["  <h1>Changed</h1>"],
    };
    const pass1 = applyLnDiff(HTML, [chunk]);
    expect(pass1).not.toBeNull();
    // Second pass: the old line is gone — should fail to match
    const pass2 = applyLnDiff(pass1!, [chunk]);
    expect(pass2).toBeNull();
  });
});
