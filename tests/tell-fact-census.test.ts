/**
 * The fact census, and the undercount it exposed.
 *
 * `0 findings` from a clean page and `0 findings` from a page the reader was blind to
 * printed identically until now, and two defects on this branch lived in that gap.
 *
 * The census found a third on its first real run. A Vercel export reported 0 findings
 * with `undercount: false` — a fully confident clean read — while the census showed 982
 * elements yielding 4 colour facts and zero spacing, typography, border or radius. Its
 * four stylesheets are linked by absolute server paths that do not exist on disk.
 * `extractHtml` had always returned `unresolvedSheets`; no caller had ever read it.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintFileByExtractor } from "../src/core/lint-file-by-extractor.js";
import { extractorById } from "../src/core/design-facts/index.js";
import { describeCensus } from "../src/commands/tell-lint.js";

const HTML = extractorById("html-cascade");
if (HTML === undefined) throw new Error("html-cascade must be registered");

function inTemp(files: Record<string, string>, run: (dir: string, page: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "census-"));
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    run(dir, join(dir, "page.html"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PAGE_WITH_LINK = (href: string): string =>
  `<!doctype html><html><head><link rel="stylesheet" href="${href}"></head>` +
  `<body><p class="x">hello</p></body></html>`;

const SHEET = `.x { color: #333333; padding: 12px; font-size: 15px; border-radius: 6px; }`;

describe("fact census", () => {
  it("counts facts per kind and the elements they came from", () => {
    inTemp({ "page.html": PAGE_WITH_LINK("./s.css"), "s.css": SHEET }, (_d, page) => {
      const r = lintFileByExtractor(page, "html-cascade", HTML);
      expect(r.census.total).toBeGreaterThan(0);
      expect(r.census.nodes).toBeGreaterThan(0);
      // The stylesheet resolved, so real style facts must be present. If this ever
      // reads zero, the reader went blind and the census is the thing that says so.
      expect(Object.keys(r.census.byKind)).toContain("color");
      expect(Object.keys(r.census.byKind)).toContain("spacing");
    });
  });

  it("a stylesheet that cannot be opened makes the run an UNDERCOUNT", () => {
    // The specimen, reduced: the link points somewhere that does not exist.
    inTemp({ "page.html": PAGE_WITH_LINK("/absolute/not/here.css") }, (_d, page) => {
      const r = lintFileByExtractor(page, "html-cascade", HTML);
      expect(r.unresolvedSheets).toEqual(["/absolute/not/here.css"]);
      expect(r.undercount, "an unreadable stylesheet must not read as a clean run").toBe(true);
    });
  });

  it("the same page WITH its stylesheet is not an undercount", () => {
    // The other half of the pair. A guard that is always on guards nothing.
    inTemp({ "page.html": PAGE_WITH_LINK("./s.css"), "s.css": SHEET }, (_d, page) => {
      const r = lintFileByExtractor(page, "html-cascade", HTML);
      expect(r.unresolvedSheets).toEqual([]);
      expect(r.undercount).toBe(false);
    });
  });

  it("says NOTHING was seen when nothing was seen", () => {
    expect(describeCensus({ byKind: {}, total: 0, nodes: 0 })).toContain("saw NOTHING");
    expect(describeCensus({ byKind: {}, total: 0, nodes: 0 })).toContain("unread, not clean");
  });

  it("names the kinds it saw, commonest first", () => {
    const line = describeCensus({ byKind: { color: 4, structure: 982, text: 275 }, total: 1261, nodes: 982 });
    expect(line).toContain("1261 facts across 982 elements");
    // Ordered by count so the dominant kind — and the suspicious absence — read first.
    expect(line.indexOf("structure 982")).toBeLessThan(line.indexOf("text 275"));
    expect(line.indexOf("text 275")).toBeLessThan(line.indexOf("color 4"));
  });
});
