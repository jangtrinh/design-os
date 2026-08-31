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
 * Red probes, stated exactly, because the first version of this docblock overstated
 * them and a reviewer measured it:
 *
 *  - make the check read `role: "body"` instead of `"metadata"` -> three cases fail.
 *  - raise `METADATA_MAX_CHARS` past a fixture's length -> that fixture's case fails.
 *    At 900 only the ~600-character brief reddens, because the other firing fixtures
 *    are 1200 and still exceed it. These cases guard BEHAVIOUR, not the constant.
 *
 * The constant is pinned somewhere else on purpose: the boundary pair in
 * `tell-boundary-pairs.ts` hardcodes 200 and 201 and runs both through the real
 * extractor and the real linter, so it reddens for ANY move of the number. Asking
 * these cases to do that as well would duplicate it and tempt someone to derive the
 * fixtures from `thr()` — which is exactly what made the first version blind.
 */
import { describe, expect, it } from "vitest";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { checkPromptLeakMetadata } from "../src/core/content-checks-metadata.js";

/**
 * Lengths are ABSOLUTE, not `thr("METADATA_MAX_CHARS") + n`.
 *
 * Deriving them from the threshold makes every fixture scale with it, so the cases
 * stay green no matter where the number moves — a test that cannot see the constant
 * it is testing. Measured at 900 (a value this rule's own provenance calls
 * interchangeable) the derived form reddened 1 of 6; the absolute form reddens the
 * firing cases as it should. The number itself is additionally pinned end-to-end by
 * the boundary pair in `tell-boundary-pairs.ts`.
 */
const OVER = 1200; // past any plausible threshold in the 150-900 band the data allows
const UNDER = 60; // a real title; the median across 699 measured pages is 43

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
    const found = findingsFor(pageWithTitle("x".repeat(OVER)));
    expect(found[0]?.severity).toBe("error");
  });

  it("names the length and quotes the start, so the reader can find it", () => {
    const found = findingsFor(pageWithTitle(`LEAKED-BRIEF-MARKER ${"y".repeat(OVER)}`));
    expect(found[0]?.actual).toContain("LEAKED-BRIEF-MARKER");
    expect(found[0]?.message).toMatch(/^\d+ characters of document metadata/);
  });

  it("stays silent on an ordinary title", () => {
    // The control that matters most. 699 real pages have one of these.
    expect(findingsFor(pageWithTitle("Plantbox — vegan meal prep, delivered weekly"))).toEqual([]);
    expect(findingsFor(pageWithTitle("t".repeat(UNDER)))).toEqual([]);
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
    const svg = `<svg viewBox="0 0 10 10"><title>${"z".repeat(OVER)}</title><rect/></svg>`;
    expect(findingsFor(pageWithTitle("A normal title", svg))).toEqual([]);
  });
});
