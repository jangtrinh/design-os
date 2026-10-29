/**
 * dead-link-href and skip-link-missing. Every case pairs the form that MUST fire with the
 * closest form that must not, so a check that always returns [] and a check that always
 * fires both go red. Assertions read findings, never the check's own source text.
 */
import { describe, expect, it } from "vitest";
import { lintA11y } from "../src/core/a11y-lint.js";
import { checkDeadLinkHref, checkSkipLinkMissing } from "../src/core/a11y-checks-links.js";

const dead = (html: string): number => checkDeadLinkHref(html).length;

describe("dead-link-href", () => {
  it("flags href=\"#\" and returns a warning with the criterion", () => {
    const f = checkDeadLinkHref('<a href="#">Buy</a>');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ checkId: "dead-link-href", severity: "warning", sc: "4.1.2", line: 1 });
  });

  it.each([
    ["javascript:void(0)", '<a href="javascript:void(0)">Go</a>'],
    ["uppercase scheme", '<a href="JavaScript:run()">Go</a>'],
    ["single quotes", "<a href='#'>Go</a>"],
    ["unquoted", "<a href=#>Go</a>"],
    ["padded value", '<a href=" # ">Go</a>'],
    ["aria-disabled=false", '<a href="#" aria-disabled="false">Go</a>'],
    ["attribute order", '<a class="btn" aria-label="Go" href="#" id="x">Go</a>'],
  ])("flags %s", (_n, html) => {
    expect(dead(html)).toBe(1);
  });

  it.each([
    ["an in-page anchor", '<a href="#main">Skip</a>'],
    ["a real URL", '<a href="/pricing">Pricing</a>'],
    ["a link with no href", "<a>Soon</a>"],
    ["aria-disabled=true", '<a href="#" aria-disabled="true">Soon</a>'],
    ["aria-disabled=true on javascript:", '<a href="javascript:void(0)" aria-disabled="true">Soon</a>'],
    ["a data-href lookalike", '<a data-href="#" href="/x">Go</a>'],
    ["a tag that only starts with a", '<abbr href="#">x</abbr>'],
    ["an anchor in a script string", "<script>el.innerHTML = '<a href=\"#\">x</a>';</script>"],
    ["an anchor in a code sample", '<pre><code>&lt;a href="#"&gt;</code><a href="#">x</a></pre>'],
  ])("does not flag %s", (_n, html) => {
    expect(dead(html)).toBe(0);
  });

  it("flags each dead link separately, with its own line and node reference", () => {
    const f = checkDeadLinkHref('<a href="#">One</a>\n<a href="/ok">Two</a>\n<a href="javascript:x()">Three</a>');
    expect(f.map((x) => x.line)).toEqual([1, 3]);
    expect(new Set(f.map((x) => x.nodeRef)).size).toBe(2);
  });

  it("does not fire inside an HTML comment when run through the linter", () => {
    expect(lintA11y('<!-- <a href="#">x</a> -->').findings.filter((x) => x.checkId === "dead-link-href")).toEqual([]);
    expect(lintA11y('<a href="#">x</a>').findings.filter((x) => x.checkId === "dead-link-href")).toHaveLength(1);
  });
});

const NAV = '<nav><a href="/a">A</a></nav>';
const MAIN = '<main id="main"><h1>T</h1></main>';
const skip = (html: string): number => checkSkipLinkMissing(html).length;

describe("skip-link-missing", () => {
  it("flags a nav + main page with no in-page link, at the nav's line", () => {
    const f = checkSkipLinkMissing(`<body>\n${NAV}${MAIN}</body>`);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ checkId: "skip-link-missing", severity: "warning", sc: "2.4.1", line: 2 });
  });

  it("is satisfied by an in-page link before the first nav", () => {
    expect(skip(`<body><a href="#main">Skip</a>${NAV}${MAIN}</body>`)).toBe(0);
  });

  it("is not satisfied by an in-page link that comes after the nav", () => {
    expect(skip(`<body>${NAV}<a href="#main">Skip</a>${MAIN}</body>`)).toBe(1);
  });

  it("is not satisfied by a link to a real page, or by a bare #", () => {
    expect(skip(`<body><a href="/home">Home</a>${NAV}${MAIN}</body>`)).toBe(1);
    expect(skip(`<body><a href="#">Top</a>${NAV}${MAIN}</body>`)).toBe(1);
  });

  it("needs both landmarks to say anything", () => {
    expect(skip(`<body>${NAV}</body>`)).toBe(0);
    expect(skip(`<body>${MAIN}</body>`)).toBe(0);
    expect(skip("<body><p>fragment</p></body>")).toBe(0);
  });

  it("does not take a custom element or a script string for a landmark", () => {
    expect(skip(`<body><navigation-bar></navigation-bar>${MAIN}</body>`)).toBe(0);
    expect(skip(`<body><script>t = '<nav></nav>';</script>${MAIN}</body>`)).toBe(0);
  });

  it("goes through lintA11y as a warning that adds no error", () => {
    const r = lintA11y(`<!doctype html><html lang="en"><head><title>t</title><meta name="viewport" content="width=device-width"></head><body>${NAV}${MAIN}</body></html>`);
    const hit = r.findings.filter((f) => f.checkId === "skip-link-missing");
    expect(hit).toHaveLength(1);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(1);
  });
});
