/**
 * Tests for `src/core/line-index.ts`.
 *
 * Verifies 100% equivalence against the legacy `source.slice(0, idx).split("\n").length`
 * oracle across all edge cases (CRLF, Unicode, negative, float, NaN, out-of-bounds),
 * cache call-order invariance and real fixture offsets. Timing is measured outside CI.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearLineIndexCache,
  createLineIndex,
  lineOf,
  normalizeEnd,
} from "../src/core/line-index.js";

/** Legacy oracle: O(N) slice-and-split per lookup. */
function oldLineOf(source: string, idx: number): number {
  return source.slice(0, idx).split("\n").length;
}

describe("normalizeEnd vs String.prototype.slice", () => {
  it("matches String.prototype.slice(0, idx).length for all test values", () => {
    const testStrings = ["", "a", "hello world", "foo\nbar\nbaz\n"];
    const testIndices = [
      0, -0, 1, 2, 5, 10, 50, -1, -2, -5, -10, -50,
      NaN, 0.1, 0.9, 1.2, 2.8, -0.1, -0.9, -1.2, -2.8,
      Infinity, -Infinity,
    ];

    for (const str of testStrings) {
      for (const idx of testIndices) {
        const expected = str.slice(0, idx).length;
        const actual = normalizeEnd(idx, str.length);
        expect(actual).toBe(expected);
      }
    }
  });
});

describe("createLineIndex & lineOf vs oldLineOf oracle", () => {
  const testCorpus = [
    "",
    "a",
    "abc",
    "\n",
    "\n\n",
    "\n\n\n",
    "hello\nworld",
    "hello\nworld\n",
    "\nhello\nworld\n",
    "line 1\r\nline 2\r\nline 3\r\n",
    "mixed\r\nline1\nline2\r\nline3\n",
    "consecutive\n\n\nblank lines\n\n",
    "✨\n🎉 Unicode party\n🚀 Rocket\n日本語のテキスト\n🔥",
    "No newlines at all in this relatively long piece of text that spans quite a few words.",
    "<!DOCTYPE html>\n<html>\n<head>\n  <title>Test</title>\n</head>\n<body>\n  <div>Hello</div>\n</body>\n</html>\n",
  ];

  for (const [corpusIdx, str] of testCorpus.entries()) {
    it(`matches oracle on corpus #${corpusIdx} (${JSON.stringify(str.slice(0, 20))}...)`, () => {
      const index = createLineIndex(str);
      expect(index.length).toBe(str.length);
      expect(index.lineCount).toBe(oldLineOf(str, str.length));

      // Test all integer offsets from 0 to str.length + 3
      const offsetsToTest: number[] = [];
      for (let i = 0; i <= str.length + 3; i++) {
        offsetsToTest.push(i);
      }
      // Edge offsets: negative, float, NaN, infinities
      offsetsToTest.push(
        -1, -2, -5, -str.length, -str.length - 10,
        0.1, 0.5, 1.2, 2.7, -0.5, -1.8,
        NaN, Infinity, -Infinity,
      );

      for (const off of offsetsToTest) {
        const expected = oldLineOf(str, off);
        const indexedVal = index.lineOf(off);
        const cachedVal = lineOf(str, off);

        expect(indexedVal).toBe(expected);
        expect(cachedVal).toBe(expected);
      }
    });
  }
});

describe("lineOf bounded last-source cache semantics", () => {
  it("keeps results correct while alternating more than two sources", () => {
    clearLineIndexCache();

    const strA = "docA\nline2\nline3";
    const strB = "docB\nline2\nline3";
    const strC = "docC\nline2\nline3";

    // Lookup on strA and strB
    expect(lineOf(strA, 0)).toBe(1);
    expect(lineOf(strB, 0)).toBe(1);

    // Lookups on strA and strB hit cache
    expect(lineOf(strA, 6)).toBe(2);
    expect(lineOf(strB, 6)).toBe(2);

    // Add a third source, then revisit earlier inputs.
    expect(lineOf(strC, 0)).toBe(1);

    expect(lineOf(strC, 6)).toBe(2);
    expect(lineOf(strB, 6)).toBe(2);
  });

  it("clearLineIndexCache resets cache cleanly", () => {
    const str = "test\nlines\n";
    expect(lineOf(str, 5)).toBe(2);
    clearLineIndexCache();
    expect(lineOf(str, 5)).toBe(2);
  });
});

describe("Real fixture offset equivalence", () => {
  const fixtures = [
    "tests/fixtures/layout-broken.html",
    "tests/fixtures/layout-smells.html",
    "tests/fixtures/layout-good.html",
    "site/slides.html",
  ];

  for (const fixtureRel of fixtures) {
    it(`matches the legacy line lookup on ${fixtureRel}`, () => {
      const html = readFileSync(resolve(process.cwd(), fixtureRel), "utf8");
      const index = createLineIndex(html);

      // Verify 500 distributed offsets across the document match oldLineOf exactly
      const step = Math.max(1, Math.floor(html.length / 500));
      for (let off = 0; off <= html.length; off += step) {
        expect(index.lineOf(off)).toBe(oldLineOf(html, off));
        expect(lineOf(html, off)).toBe(oldLineOf(html, off));
      }


    });
  }
});
