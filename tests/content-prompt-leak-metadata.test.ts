/**
 * A generation prompt shipped in the page's `<title>`.
 *
 * Two real pages carry an ~8,900-character `<title>` that is the generation brief
 * itself — "[var-3] Hyper-Gloss Y3K Chrome - Web - Landing page - AI design -
 * Reference the background from this codebase…", naming an internal path. That
 * string is the browser tab, the search result and the social card.
 *
 * The threshold carries no judgement, which is the unusual part. Measured across
 * 699 real titles: median 43, longest legitimate 120, and NOTHING between 120 and
 * 1000. Any number in roughly 150–900 classifies that corpus identically, so 200 is
 * chosen for margin rather than for fit — past the longest real title, past what a
 * search result displays, and low enough to catch a shorter leak than the ones in
 * front of us.
 *
 * Deliberately length only. Matching `[var-N]` or "Reference the" would be sharper
 * on these nine titles and would overfit to one generator's phrasing; the audience
 * of a shared linter is every generator that makes this mistake.
 *
 * Red probes: raise `METADATA_MAX_CHARS` above the leak and the firing cases fail;
 * make the check read `role: "body"` instead of `"metadata"` and the "leaves real
 * copy alone" control fails. The boundary pair in `tell-boundary-pairs.ts` guards
 * the number itself end-to-end through the real extractor.
 */
import { describe, expect, it } from "vitest";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { checkPromptLeakMetadata } from "../src/core/content-checks-metadata.js";
import { thr } from "../src/core/tell-thresholds.js";

const LIMIT = thr("METADATA_MAX_CHARS");

const pageWithTitle = (title: string, body = "<p>Real copy the reader reads.</p>"): string =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const findingsFor = (html: string) => checkPromptLeakMetadata(extractHtml(html, "page.html").collector.facts());

describe("a prompt in the title is scaffolding, not a habit", () => {
  it("fires on a leaked generation brief", () => {
    const brief =
      "[var-3] Hyper-Gloss Y3K Chrome - Web - Landing page - AI design - Reference the background " +
      "from this codebase and keep the chrome consistent across every section. ".repeat(6);
    const found = findingsFor(pageWithTitle(brief));
    expect(found).toHaveLength(1);
    expect(found[0]?.checkId).toBe("prompt-leak-metadata");
  });

  it("is an error, alone in a family of advisories", () => {
    // The doctrinal claim, asserted rather than left in a comment: a tell is evidence
    // of inattention and prints without failing a build. A prompt on the SEO surface
    // has no intentional reading, so this one is allowed to fail the build.
    const found = findingsFor(pageWithTitle("x".repeat(LIMIT + 500)));
    expect(found[0]?.severity).toBe("error");
  });

  it("names the length and quotes the start, so the reader can find it", () => {
    const found = findingsFor(pageWithTitle(`LEAKED-BRIEF-MARKER ${"y".repeat(LIMIT + 100)}`));
    expect(found[0]?.actual).toContain("LEAKED-BRIEF-MARKER");
    expect(found[0]?.message).toMatch(/^\d+ characters of document metadata/);
  });

  it("stays silent on an ordinary title", () => {
    // The control that matters most. 699 real pages have one of these.
    expect(findingsFor(pageWithTitle("Plantbox — vegan meal prep, delivered weekly"))).toEqual([]);
  });

  it("leaves real body copy alone however long it runs", () => {
    // Reads metadata and nothing else. A long page of prose is not this rule's business
    // — that is `line-length`, and conflating them would make this one a length police.
    const prose = `<p>${"Sentence after sentence of genuine copy. ".repeat(80)}</p>`;
    expect(findingsFor(pageWithTitle("A normal title", prose))).toEqual([]);
  });

  it("does not judge an svg title, which is an accessible name", () => {
    // `metadata` is scoped by POSITION (parent must be <head>), so a long <svg><title>
    // stays copy. Guarding it here too, because this rule is the role's first reader
    // and a regression in the scoping would surface as a bizarre finding on a graphic.
    const svg = `<svg viewBox="0 0 10 10"><title>${"z".repeat(LIMIT + 100)}</title><rect/></svg>`;
    expect(findingsFor(pageWithTitle("A normal title", svg))).toEqual([]);
  });
});
