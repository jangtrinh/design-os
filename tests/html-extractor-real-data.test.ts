/**
 * One run on real data before phase 02 is "done".
 *
 * All eight dogfood findings this repo has paid for came from real projects and
 * files; zero came from fixtures. A green suite on a fixture validates the
 * mechanism, not the contract — so the cascade engine is pointed at the repo's
 * own shipped HTML, which nobody authored to make this test pass.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Real, shipped artifacts — not fixtures written for a test. */
const REAL = [
  "site/index.html",
  "showcase/world-class-benchmark/index.html",
  "examples/generated/variant-3-kinetic-swiss-punk.html",
  "examples/generated/variant-1-redesign-liquid-glass.html",
];

describe("cascade engine on the repo's own shipped HTML", () => {
  const present = REAL.filter((rel) => existsSync(join(ROOT, rel)));

  it("finds the real artifacts it claims to test", () => {
    // A test that silently skips every file is a green that means nothing.
    expect(present.length).toBeGreaterThanOrEqual(3);
  });

  for (const rel of present) {
    it(`extracts ${rel} without degrading, and reads real values`, () => {
      const html = readFileSync(join(ROOT, rel), "utf8");
      const r = extractHtml(html, rel);

      expect(r.degraded, r.degradeReason).toBe(false);
      const facts = r.collector.facts();
      expect(facts.length).toBeGreaterThan(20);

      // Every fact points at a real line inside the file.
      const lineCount = html.split("\n").length;
      for (const f of facts) {
        expect(f.at.line).toBeGreaterThan(0);
        expect(f.at.line).toBeLessThanOrEqual(lineCount);
      }

      // A real page lays something out.
      const kinds = r.collector.kindsPresent();
      expect(kinds.has("structure")).toBe(true);

      // It either paints through CSS this tier can read, OR it carries its
      // design in utility classes this tier cannot — and then it must SAY SO.
      // Silence on a page whose styling lives in `class=` is the exact shape of
      // "I could not read this" mistaken for "this is clean".
      const paints = kinds.has("color") || kinds.has("gradient") || kinds.has("typography");
      const declaresTheGap =
        r.collector.unresolvedCount > 0 || r.unresolvedSheets.length > 0;
      expect(paints || declaresTheGap, "must paint or declare why it could not").toBe(true);
    });
  }

  it("is deterministic — two runs over the same file are byte-identical", () => {
    const rel = present[0] as string;
    const html = readFileSync(join(ROOT, rel), "utf8");
    const a = JSON.stringify(extractHtml(html, rel).collector.facts());
    const b = JSON.stringify(extractHtml(html, rel).collector.facts());
    expect(a).toBe(b);
  });

  it("says a Tailwind-CDN page is unreadable rather than reporting it clean", () => {
    const rel = "examples/generated/variant-3-kinetic-swiss-punk.html";
    const r = extractHtml(readFileSync(join(ROOT, rel), "utf8"), rel);
    // Zero stylesheets, all design in class attributes.
    expect(r.collector.kindsPresent().has("color")).toBe(false);
    expect(r.collector.unresolvedCount).toBeGreaterThan(50);
    expect(r.collector.unresolved()[0]?.what).toContain("utility-class extractor");
  });

  it("reports what it could not resolve instead of implying it read everything", () => {
    const rel = present[0] as string;
    const r = extractHtml(readFileSync(join(ROOT, rel), "utf8"), rel);
    // Not an assertion that there ARE unresolved reads — an assertion that the
    // channel exists and is populated honestly when there are.
    expect(Array.isArray(r.unresolvedSheets)).toBe(true);
    expect(typeof r.collector.unresolvedCount).toBe("number");
    for (const u of r.collector.unresolved()) expect(u.count).toBeGreaterThan(0);
  });
});
