/**
 * Head metadata is document chrome, not copy — and the rules that judge PROSE
 * must be able to tell the difference.
 *
 * Paid for by two real pages. `easeui-kinetic-hyper-gloss` carries a `<title>`
 * that opens on line 6 and closes on line 358: 353 lines, 11,028 raw / 9,334
 * whitespace-normalized characters of a leaked generation prompt. Read as body
 * copy it produced a `line-length` finding pointing at line 6, and an em dash no
 * reader could ever have seen counted against a visible word budget.
 *
 * The original triage of that finding blamed fact AGGREGATION — "the document's
 * text collapsed into one fact". It is not: `emitText` emits own-text per
 * element, and the run really is that long. The defect was the ROLE.
 *
 * The fact is kept, not dropped: a page's facts are its evidence and the census
 * must still count them. Only the role changes, and `line-length`'s existing
 * `role === "body"` filter then excludes it for free.
 *
 * Red probe: with `HEAD_METADATA` emptied so `<title>` falls through to "body"
 * again, the first two assertions fail — the title comes back as a body run and
 * `line-length` fires on it. The census assertion is the guard against "fixing"
 * this by simply not emitting the fact.
 */
import { describe, expect, it } from "vitest";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import type { DesignFact } from "../src/core/design-facts/index.js";

const HTML = extractorById("html-cascade");
if (HTML === undefined) throw new Error("html-cascade must be registered");

/** A `<title>` well past LINE_LENGTH_MAX_CHARS (400), plus ordinary body copy. */
const LONG_TITLE = "Reference the background from this codebase and keep the chrome ".repeat(12);
const PAGE = `<!doctype html>
<html><head>
<title>${LONG_TITLE}</title>
</head><body>
<h1>Plantbox</h1>
<p>Vegan meal prep, delivered weekly.</p>
</body></html>`;

const textFacts = (facts: readonly DesignFact[]) =>
  facts.filter((f): f is Extract<DesignFact, { kind: "text" }> => f.kind === "text");

describe("a <title> is metadata, never body copy", () => {
  const result = extractHtml(PAGE, "page.html");
  const facts = result.collector.facts();

  it("emits no body-role run carrying the title", () => {
    expect(LONG_TITLE.length).toBeGreaterThan(400); // the fixture must actually be long
    const bodyRuns = textFacts(facts).filter((f) => f.role === "body");
    expect(bodyRuns.some((f) => f.content.includes("Reference the background"))).toBe(false);
  });

  it("keeps line-length silent about it", () => {
    const { findings } = lintTell(facts, HTML);
    expect(findings.filter((f) => f.checkId === "line-length")).toEqual([]);
  });

  it("still emits the fact, under the metadata role", () => {
    // Nothing vanishes silently: the census counts this page's evidence, and a
    // "fix" that dropped the fact would leave the reader blind instead of correct.
    const meta = textFacts(facts).filter((f) => f.role === "metadata");
    expect(meta).toHaveLength(1);
    expect(meta[0]?.content).toContain("Reference the background");
  });

  it("leaves real body copy alone", () => {
    const bodyRuns = textFacts(facts).filter((f) => f.role === "body");
    expect(bodyRuns.some((f) => f.content.includes("Vegan meal prep"))).toBe(true);
  });
});

describe("an SVG <title> is not head metadata", () => {
  /**
   * `elements()` walks the whole tree, so a tag-name test alone also catches
   * `<svg><title>` — which is the opposite of chrome. It is the graphic's
   * accessible name: real text a screen-reader user hears. Two files in this
   * repo's own `examples/diagrams/` carry one, and they are what proved a
   * tag-only test wrong. Scoping is by POSITION: parent must be `<head>`.
   */
  const SVG_PAGE = `<!doctype html>
<html><head><title>Org chart</title></head><body>
<svg viewBox="0 0 10 10"><title>Reporting lines across the org</title><rect/></svg>
</body></html>`;

  const facts = extractHtml(SVG_PAGE, "page.html").collector.facts();

  it("keeps the svg title as readable copy", () => {
    const bodyRuns = textFacts(facts).filter((f) => f.role === "body");
    expect(bodyRuns.some((f) => f.content.includes("Reporting lines"))).toBe(true);
  });

  it("still treats the head title as metadata", () => {
    const meta = textFacts(facts).filter((f) => f.role === "metadata");
    expect(meta.map((f) => f.content)).toEqual(["Org chart"]);
  });
});
