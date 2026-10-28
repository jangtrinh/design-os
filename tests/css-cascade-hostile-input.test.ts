/**
 * The shared CSS cascade on documents built to be slow: long descendant chains over
 * deep trees, and trees deeper than the call stack. `ui gate` and `ui taste-lint`
 * both read this layer, so a stall or a RangeError here stops the whole CLI.
 */
import { describe, expect, it } from "vitest";
import { selectAll } from "css-select";
import type { Element } from "domhandler";
import { buildCascade } from "../src/core/extractors/html/css-cascade.js";
import { selectMatching } from "../src/core/extractors/html/css-selector-match.js";
import { splitCompoundChain, subjectKey } from "../src/core/extractors/html/css-selector-compound-chain.js";
import { parseHtml } from "../src/core/extractors/html/html-dom.js";

const cascadeOf = (html: string) => {
  const parsed = parseHtml(html);
  return buildCascade(parsed.doc, parsed.sheets, html);
};

describe("css-cascade on hostile documents", () => {
  it("matches a 200-deep descendant chain whose leftmost compound never matches in well under a second", () => {
    const depth = 200;
    const html =
      "<style>.nope div div div div div{background:#111}.pill{background:#222}</style>" +
      "<div>".repeat(depth) + '<span class="pill">x</span>' + "</div>".repeat(depth);
    const t0 = performance.now();
    const { byElement, unsupportedSelectors } = cascadeOf(html);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(unsupportedSelectors).toEqual([]);
    const pill = [...byElement.keys()].find((el) => el.attribs["class"] === "pill");
    expect(pill && byElement.get(pill)?.get("background")?.value).toBe("#222");
    expect([...byElement.values()].filter((s) => s.get("background")?.value === "#111")).toHaveLength(0);
  });

  it.each([
    { shape: "a 3-compound descendant chain over 3,000 nested divs (css-select alone: 40 s)", html: "<style>.nope div div{background:#111}</style>" + "<div>".repeat(3000) + "x" },
    { shape: "a 6-compound ~ sibling chain over 300 sibling divs (css-select alone: over 40 s)", html: "<style>.nope ~ div ~ div ~ div ~ div ~ div{background:#111}</style>" + "<div></div>".repeat(300) },
  ])("matches $shape in milliseconds", ({ html }) => {
    const t0 = performance.now();
    const { byElement, unsupportedSelectors } = cascadeOf(html);
    expect(performance.now() - t0).toBeLessThan(1000); // runs in a few ms; the budget only catches the blow-up
    expect(unsupportedSelectors).toEqual([]);
    expect([...byElement.values()].filter((s) => s.has("background"))).toHaveLength(0);
  });

  it("still matches the chain when its leftmost compound does match", () => {
    const html = '<style>.root div div div span{color:red}</style><div class="root"><div><div><div><p><span id="hit">x</span></p></div></div></div></div>';
    const { byElement } = cascadeOf(html);
    const hit = [...byElement.keys()].find((el) => el.attribs["id"] === "hit");
    expect(hit && byElement.get(hit)?.get("color")?.value).toBe("red");
  });

  it("reads inline styles on a document nested 20,000 deep without overflowing the stack", () => {
    const html = "<div>".repeat(20_000) + '<span style="background:#fff">x</span>';
    expect(() => cascadeOf(html)).not.toThrow();
    const { byElement } = cascadeOf(html);
    expect([...byElement.values()].some((s) => s.get("background")?.value === "#fff")).toBe(true);
  });
});

describe("selectMatching agrees with the reference engine", () => {
  const doc = [
    '<div class="a"><section id="s"><div class="b"><p class="c"><span class="d">1</span><span class="e">2</span></p></div></section></div>',
    '<div class="b"><ul><li class="c"><a href="#x" class="d">3</a></li><li><a class="d">4</a></li></ul></div>',
    '<p class="c"><span class="d">5</span></p>',
  ].join("");
  const parsed = parseHtml(doc);

  it.each([
    "div div p span",
    ".a div .c span",
    "div > div p > span",
    ".a section .b p span.d",
    "div  p   span",
    "ul li a.d",
    ".b li + li a",
    "div :not(.e) span",
    "section :is(.b, .c) span",
    "a[href='#x']",
    "div div div div div div div",
    ".nope div p span",
  ])("%s", (selector) => {
    const expected = selectAll<Element, Element>(selector, parsed.doc as unknown as Element);
    expect(selectMatching(selector, parsed.doc)).toEqual(expected);
  });

  it("cuts only at top-level combinators, and refuses the shapes it does not read", () => {
    expect(splitCompoundChain("a b  c")).toEqual({ compounds: ["a", "b", "c"], combinators: [" ", " "] });
    expect(splitCompoundChain("a > b+c ~d e")).toEqual({ compounds: ["a", "b", "c", "d", "e"], combinators: [">", "+", "~", " "] });
    expect(splitCompoundChain(":not(a b) c")).toEqual({ compounds: [":not(a b)", "c"], combinators: [" "] });
    expect(splitCompoundChain('[title="x > y"] z')).toEqual({ compounds: ['[title="x > y"]', "z"], combinators: [" "] });
    expect(splitCompoundChain(".foo\\ bar .x")).toEqual({ compounds: [".foo\\ bar", ".x"], combinators: [" "] });
    expect(splitCompoundChain(".a\\31 23 .x")).toEqual({ compounds: [".a\\31 23", ".x"], combinators: [" "] });
    for (const refused of ["a, b", "> a", "a >", "a > > b", ":scope > a", "svg|rect a", ""]) expect(splitCompoundChain(refused)).toBeUndefined();
  });

  it("names a class, id or type the subject compound requires, and nothing it does not", () => {
    expect(subjectKey("div.a#x:hover")).toEqual({ kind: "id", value: "x" });
    expect(subjectKey("DIV.a")).toEqual({ kind: "class", value: "a" });
    expect(subjectKey("DIV:first-child")).toEqual({ kind: "tag", value: "div" });
    for (const none of [":not(.a)", "*", "[class=a]", ".md\\:flex", '[href="#x"]', ":is(.a, .b)"]) expect(subjectKey(none)).toBeUndefined();
  });
});
