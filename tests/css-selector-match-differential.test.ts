/**
 * `selectMatching` must return exactly what `css-select` returns, for every selector.
 *
 * It replaces `selectAll` inside the shared cascade, so a single over-match changes
 * what `ui gate`, the HTML/SFC extractors and taste-lint read. Hand-picked cases
 * missed one (a `>` inside a later descendant segment), so this file compares the
 * two engines over random documents and random selectors. The generator is seeded:
 * the same cases run on every machine, and a failure prints the case to reproduce.
 */
import { describe, expect, it } from "vitest";
import { selectAll } from "css-select";
import type { Document, Element } from "domhandler";
import { createSelectorMatcher, selectMatching } from "../src/core/extractors/html/css-selector-match.js";
import { parseHtml } from "../src/core/extractors/html/html-dom.js";

/** mulberry32: a small seeded PRNG, so the case list is fixed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAGS = ["div", "p", "span", "section", "li", "template"];
const CLASSES = ["a", "b", "c"];

function randomDocument(rand: () => number): string {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  let budget = 40;
  const node = (depth: number): string => {
    budget--;
    const tag = pick(TAGS);
    const attrs: string[] = [];
    const cls = CLASSES.filter(() => rand() < 0.35);
    if (cls.length > 0) attrs.push(`class="${cls.join(" ")}"`);
    if (rand() < 0.15) attrs.push(`id="${pick(["x", "y"])}"`);
    if (rand() < 0.2) attrs.push("data-k");
    let inner = "";
    const kids = depth >= 6 ? 0 : Math.floor(rand() * 4);
    for (let i = 0; i < kids && budget > 0; i++) inner += node(depth + 1);
    return `<${tag}${attrs.length > 0 ? " " + attrs.join(" ") : ""}>${inner}</${tag}>`;
  };
  let html = "";
  while (budget > 0) html += node(0);
  return html;
}

function randomSelector(rand: () => number): string {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const simple = (): string => {
    const r = rand();
    if (r < 0.3) return rand() < 0.1 ? pick(TAGS).toUpperCase() : pick(TAGS);
    if (r < 0.6) return "." + pick(CLASSES);
    if (r < 0.7) return "#" + pick(["x", "y"]);
    if (r < 0.8) return "[data-k]";
    if (r < 0.9) return `:not(${rand() < 0.5 ? "." + pick(CLASSES) : pick(TAGS)})`;
    return ":first-child";
  };
  const compound = (): string => {
    let out = simple();
    while (rand() < 0.3) {
      const extra = simple();
      // A type selector must lead its compound.
      out = /^[a-z]/.test(extra) ? (/^[a-z]/.test(out) ? out : extra + out) : out + extra;
    }
    return out;
  };
  const complex = (): string => {
    const n = 2 + Math.floor(rand() * 4); // 2..5 compounds
    let out = compound();
    for (let i = 1; i < n; i++) {
      const comb = pick([" ", " ", ">", "+", "~"]);
      const pad = comb === " " ? " " : pick(["", " "]);
      out += comb === " " ? " " + compound() : pad + comb + pad + compound();
    }
    return out;
  };
  return rand() < 0.15 ? `${complex()}, ${complex()}` : complex();
}

type Outcome = { ok: true; els: Element[] } | { ok: false };
const run = (fn: () => Element[]): Outcome => {
  try { return { ok: true, els: fn() }; } catch { return { ok: false }; }
};
const same = (a: Outcome, b: Outcome): boolean =>
  a.ok === b.ok && (!a.ok || !b.ok || (a.els.length === b.els.length && a.els.every((el, i) => el === b.els[i])));

describe("selectMatching against css-select over seeded random documents and selectors", () => {
  const DOCS = 60;
  const SELECTORS_PER_DOC = 120;
  const cases: Array<{ doc: Document; html: string; selectors: string[] }> = [];
  const rand = prng(350);
  for (let d = 0; d < DOCS; d++) {
    const html = randomDocument(rand);
    cases.push({ doc: parseHtml(html).doc, html, selectors: Array.from({ length: SELECTORS_PER_DOC }, () => randomSelector(rand)) });
  }

  it("covers every combinator inside a later compound, comma lists and 2-5 compounds", () => {
    const all = cases.flatMap((c) => c.selectors);
    expect(all).toHaveLength(DOCS * SELECTORS_PER_DOC);
    for (const shape of [/ \S+>/, / \S+\+/, / \S+~/, /,/, /:not\(/, /:first-child/, /#/, /\[data-k\]/]) {
      expect(all.some((s) => shape.test(s))).toBe(true);
    }
  });

  it("returns the same elements, in the same order, as css-select on every case", () => {
    const mismatches: string[] = [];
    for (const { doc, html, selectors } of cases) {
      for (const selector of selectors) {
        const expected = run(() => selectAll<Element, Element>(selector, doc as unknown as Element));
        if (!same(run(() => selectMatching(selector, doc)), expected)) mismatches.push(`${selector}  on  ${html}`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("returns the same elements when every selector is forced through the linear compound-chain path", () => {
    const mismatches: string[] = [];
    for (const { doc, html, selectors } of cases) {
      const chain = createSelectorMatcher(doc, { forceChain: true });
      for (const selector of selectors) {
        const expected = run(() => selectAll<Element, Element>(selector, doc as unknown as Element));
        if (!same(run(() => chain(selector)), expected)) mismatches.push(`${selector}  on  ${html}`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

describe("selectMatching on selector text the segment cutter used to mangle", () => {
  const doc = parseHtml('<body><div><p><span class="foo bar">x</span></p></div><div class="foo&#32;bar"><i>y</i></div><template><div><p><span><i>z</i></span></p></div></template></body>').doc;
  it.each([
    "div div>p span", // a `>` inside a later descendant segment: no div has a div ancestor
    ".foo\\ bar .x .y", // an escaped space is part of the class name, not a combinator
    "div .foo\\ bar i",
    "a b c, d", // a comma list handed straight to the exported function
    "div p span, i",
    "body > div p span",
    "div p span i", // nothing inside a <template> is a subject
  ])("%s", (selector) => {
    const expected = run(() => selectAll<Element, Element>(selector, doc as unknown as Element));
    expect(expected.ok).toBe(true);
    expect(same(run(() => selectMatching(selector, doc)), expected)).toBe(true);
  });
});
