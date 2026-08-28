/**
 * Roles derived from facts, not names.
 *
 * Name matching failed in BOTH directions on real pages, and the two failures
 * are the two halves of this suite:
 *  - `/(^|-)card($|-)/i` matches `card-title`, so a card's own title counted as
 *    a nested card — 16 false positives on one page;
 *  - a Tailwind surface carries no "card" in any name, so 9 rounded containers
 *    yielded 0 cards and four rules went silently inert.
 *
 * Both are pinned against the real files that produced them, so a future
 * "improvement" to role detection has to keep both true at once.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { synthesizeRoles, looksLikeCard } from "../src/core/design-facts/role-synthesis.js";
import type { Surface } from "../src/core/design-facts/role-synthesis.js";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import type { DesignFact, Provenance } from "../src/core/design-facts/index.js";

const html = extractorById("html-cascade")!;
const at = (line: number, nodeRef: string): Provenance =>
  ({ file: "f", line, extractor: "html-cascade", confidence: "resolved", nodeRef });

const cardsIn = (facts: readonly DesignFact[]): string[] =>
  synthesizeRoles(facts)
    .filter((f): f is Extract<DesignFact, { kind: "structure" }> => f.kind === "structure")
    .filter((f) => f.roles?.includes("card"))
    .map((f) => f.ref);

describe("the predicate", () => {
  const surface = (over: Partial<Surface>): Surface => ({
    hasShadow: false, hasBorder: false, hasRadius: false, hasOwnBackground: false,
    claimed: new Set<string>(), confidence: "resolved", tag: "div", ...over,
  });

  it("needs lift AND surface AND content", () => {
    expect(looksLikeCard(surface({ hasShadow: true, hasRadius: true }))).toBe(true);
    expect(looksLikeCard(surface({ hasBorder: true, hasOwnBackground: true }))).toBe(true);
    // Lift with no surface, and surface with no lift, are not cards.
    expect(looksLikeCard(surface({ hasShadow: true }))).toBe(false);
    expect(looksLikeCard(surface({ hasRadius: true }))).toBe(false);
    expect(looksLikeCard(undefined)).toBe(false);
  });

  it("stays generous on purpose — a bordered rounded div IS a card", () => {
    // Measured: every stricter variant that tamed a busy page also took a real
    // Tailwind page to ZERO cards, because `rounded-xl border p-4` and an
    // ordinary bordered div carry the same facts. The discrimination lives in
    // the rules (see nested-cards), not here.
    expect(looksLikeCard(surface({ hasBorder: true, hasRadius: true }))).toBe(true);
  });

  it("does not call a control a card even when it holds an icon and a label", () => {
    for (const tag of ["button", "input", "kbd", "select", "label", "img"]) {
      expect(looksLikeCard(surface({ hasBorder: true, hasRadius: true, tag })), tag).toBe(false);
    }
  });

  it("still allows a LINK-wrapped card, which is a real pattern", () => {
    expect(looksLikeCard(surface({ hasBorder: true, hasRadius: true, tag: "a" }))).toBe(true);
  });
});

describe("the false-positive half: a card's own title is not a card", () => {
  it("does not make a text child a card just because it is named one", () => {
    const facts: DesignFact[] = [
      // The card: border + radius + background.
      { kind: "structure", node: "a", depth: 1, ref: "body > a.card", at: at(1, "body > a.card") },
      { kind: "border", sides: ["top", "right", "bottom", "left"], widthPx: 1, at: at(1, "body > a.card") },
      { kind: "radius", px: 12, at: at(1, "body > a.card") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "body > a.card") },
      // The title: text only. It carries the WORD card and none of the facts.
      { kind: "structure", node: "div", depth: 2, ref: "body > a.card > div.card-title", at: at(2, "body > a.card > div.card-title") },
      { kind: "typography", sizePx: 18, weight: 700, at: at(2, "body > a.card > div.card-title") },
    ];
    expect(cardsIn(facts)).toEqual(["body > a.card"]);
  });

  it("reports no nested-cards for a card containing its own title", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "a", depth: 1, ref: "body > a.card", at: at(1, "body > a.card") },
      { kind: "border", sides: ["top", "right", "bottom", "left"], widthPx: 1, at: at(1, "body > a.card") },
      { kind: "radius", px: 12, at: at(1, "body > a.card") },
      { kind: "structure", node: "div", depth: 3, ref: "body > a.card > div > div.card-title", at: at(3, "body > a.card > div > div.card-title") },
    ];
    expect(lintTell(facts, html).findings.map((f) => f.checkId)).not.toContain("nested-cards");
  });

  it("still catches a card genuinely inside another card", () => {
    const mk = (ref: string, line: number): DesignFact[] => [
      { kind: "structure", node: "div", depth: line, ref, at: at(line, ref) },
      { kind: "border", sides: ["top", "right", "bottom", "left"], widthPx: 1, at: at(line, ref) },
      { kind: "radius", px: 12, at: at(line, ref) },
      // nested-cards needs both surfaces DISTINCT, not merely card-like.
      { kind: "color", hex: "ffffff", role: "bg", at: at(line, ref) },
    ];
    const facts = [...mk("body > div.outer", 1), ...mk("body > div.outer > div.wrap > div.inner", 3)];
    expect(lintTell(facts, html).findings.map((f) => f.checkId)).toContain("nested-cards");
  });
});

describe("the false-negative half: an unnamed Tailwind surface IS a card", () => {
  it("finds a card that nobody named", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 1, ref: "body > div", at: at(1, "body > div") },
      { kind: "border", sides: ["top", "right", "bottom", "left"], widthPx: 1, at: at(1, "body > div") },
      { kind: "radius", px: 12, at: at(1, "body > div") },
    ];
    expect(cardsIn(facts)).toEqual(["body > div"]);
  });

  it("works the same for facts an extractor emitted at literal confidence", () => {
    const lit = (line: number, ref: string): Provenance =>
      ({ file: "v.swift", line, extractor: "swiftui", confidence: "literal", nodeRef: ref });
    const facts: DesignFact[] = [
      { kind: "structure", node: "VStack", depth: 1, ref: "v > card", at: lit(1, "v > card") },
      { kind: "shadow", offsetXPx: 0, offsetYPx: 2, blurPx: 8, at: lit(1, "v > card") },
      { kind: "radius", px: 16, at: lit(1, "v > card") },
    ];
    // The predicate reads facts, so it crosses languages with no rule change.
    expect(cardsIn(facts)).toEqual(["v > card"]);
  });
});

describe("what the predicate refuses", () => {
  it("does not call a hairline divider a card edge", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 1, ref: "body > div", at: at(1, "body > div") },
      { kind: "border", sides: ["bottom"], widthPx: 1, at: at(1, "body > div") },
      { kind: "radius", px: 8, at: at(1, "body > div") },
    ];
    expect(cardsIn(facts)).toEqual([]);
  });

  it("does not count an INSET shadow as lift", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 1, ref: "body > div", at: at(1, "body > div") },
      { kind: "shadow", offsetXPx: 0, offsetYPx: 2, blurPx: 6, inset: true, at: at(1, "body > div") },
      { kind: "radius", px: 8, at: at(1, "body > div") },
    ];
    expect(cardsIn(facts)).toEqual([]);
  });

  it("does not count a nearly-transparent tint as an own background", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 1, ref: "body > div", at: at(1, "body > div") },
      { kind: "border", sides: ["top", "right", "bottom", "left"], widthPx: 1, at: at(1, "body > div") },
      { kind: "color", hex: "ffffff", alpha: 0.05, role: "bg", at: at(1, "body > div") },
    ];
    expect(cardsIn(facts)).toEqual([]);
  });

  it("is deterministic and leaves non-structure facts untouched", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 1, ref: "body > div", at: at(1, "body > div") },
      { kind: "radius", px: 8, at: at(1, "body > div") },
      { kind: "text", content: "hello", role: "body", at: at(1, "body > div") },
    ];
    const once = synthesizeRoles(facts);
    expect(JSON.stringify(once)).toBe(JSON.stringify(synthesizeRoles(facts)));
    expect(once.filter((f) => f.kind !== "structure")).toEqual(facts.filter((f) => f.kind !== "structure"));
  });
});

/**
 * The two real files that produced the two failures. Pinned as counts, so a
 * future change to role detection cannot fix one direction by breaking the other.
 */
describe("pinned against the pages that exposed both failures", () => {
  const CARD_TITLE_PAGE = "/Users/jang/Products/jang-personal-site/reference-html/index.html";
  const TAILWIND_PAGE = "/Users/jang/Products/design-starter-lab/rebuild/apple/site/index.html";

  it.skipIf(!existsSync(CARD_TITLE_PAGE))("reports no nested-cards on the page that produced 16 phantoms", () => {
    const r = extractHtml(readFileSync(CARD_TITLE_PAGE, "utf8"), CARD_TITLE_PAGE);
    const ids = lintTell(r.collector.facts(), html).findings.map((f) => f.checkId);
    expect(ids.filter((i) => i === "nested-cards")).toHaveLength(0);
  });

  it.skipIf(!existsSync(TAILWIND_PAGE))("finds cards on the Tailwind page that yielded zero", () => {
    const r = extractHtml(readFileSync(TAILWIND_PAGE, "utf8"), TAILWIND_PAGE);
    expect(cardsIn(r.collector.facts()).length).toBeGreaterThan(0);
  });
});

describe("nested-cards needs two DISTINCT surfaces, not two card-like divs", () => {
  const bordered = (ref: string, line: number): DesignFact[] => [
    { kind: "structure", node: "div", depth: line, ref, at: at(line, ref) },
    { kind: "border", sides: ["top", "right", "bottom", "left"], widthPx: 1, at: at(line, ref) },
    { kind: "radius", px: 12, at: at(line, ref) },
  ];

  it("does not fire on nested TRANSPARENT bordered divs — that is layout", () => {
    // A busy real page had 520 of these. Neither surface has its own paint, so a
    // reader sees a layout grid, not a card inside a card.
    const facts = [...bordered("body > a", 1), ...bordered("body > a > b", 2)];
    expect(lintTell(facts, html).findings.map((f) => f.checkId)).not.toContain("nested-cards");
  });

  it("fires once BOTH carry their own paint", () => {
    const facts: DesignFact[] = [
      ...bordered("body > a", 1),
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "body > a") },
      ...bordered("body > a > b", 2),
      { kind: "color", hex: "f0f0f0", role: "bg", at: at(2, "body > a > b") },
    ];
    expect(lintTell(facts, html).findings.map((f) => f.checkId)).toContain("nested-cards");
  });

  it("a shadow counts as distinct paint too", () => {
    const facts: DesignFact[] = [
      ...bordered("body > a", 1),
      { kind: "shadow", offsetXPx: 0, offsetYPx: 2, blurPx: 8, at: at(1, "body > a") },
      ...bordered("body > a > b", 2),
      { kind: "shadow", offsetXPx: 0, offsetYPx: 1, blurPx: 4, at: at(2, "body > a > b") },
    ];
    expect(lintTell(facts, html).findings.map((f) => f.checkId)).toContain("nested-cards");
  });

  it("one painted, one not, is still not the tell", () => {
    const facts: DesignFact[] = [
      ...bordered("body > a", 1),
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "body > a") },
      ...bordered("body > a > b", 2),
    ];
    expect(lintTell(facts, html).findings.map((f) => f.checkId)).not.toContain("nested-cards");
  });
});
