/**
 * One typography fact per element — the shape `html-cascade` has always emitted,
 * and the thing `jsx-tailwind` was missing.
 *
 * Found through a false positive on a real page. `hvs/components/marketing/
 * cta-section.tsx` has `className="text-[12px] font-sans font-[900] uppercase
 * tracking-[0.2em]"`, and `wide-tracking` fired on it — even though that rule
 * already EXEMPTS uppercase text, because wide tracking on small all-caps is
 * correct typography.
 *
 * Two separate causes had to be removed, and the second is the interesting one:
 *
 *  1. `resolveClass` never mapped Tailwind's `uppercase` utility to anything, so
 *     the `transform` field was empty.
 *  2. Even once it did, the exemption still could not fire — this extractor
 *     emitted one typography fact PER UTILITY, so the tracking value and the
 *     transform value lived on different facts. No rule that correlates two
 *     typography properties on one element could work here at all.
 *
 * `tight-leading` needs `lineHeight` and `sizePx` together and was blind on this
 * extractor for exactly the same reason. It is guarded below so the next person
 * to touch this cannot fix one victim and leave the other.
 *
 * The class of bug is worth naming: `needs` is KIND-granular. `typography` was
 * present the whole time, so the rules RAN. An exemption whose field is never
 * populated does not report NOT-EVALUATED — it reports a false positive, in
 * silence.
 *
 * Red probe: revert either cause and this file reddens. Dropping the
 * TEXT_TRANSFORMS branch fails "resolves the uppercase utility"; going back to
 * one fact per utility fails "carries tracking and transform on the SAME fact"
 * and both end-to-end rule assertions. The two control cases stay green through
 * all of it.
 */
import { describe, expect, it } from "vitest";
import { resolveClass } from "../src/core/extractors/web/tailwind-resolver.js";
import { extractJsx } from "../src/core/extractors/web/jsx-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import type { DesignFact } from "../src/core/design-facts/index.js";

const JSX = extractorById("jsx-tailwind");
if (JSX === undefined) throw new Error("jsx-tailwind must be registered");

const typography = (facts: readonly DesignFact[]) =>
  facts.filter((f): f is Extract<DesignFact, { kind: "typography" }> => f.kind === "typography");

const fire = (src: string, checkId: string) =>
  lintTell(extractJsx(src, "page.tsx").collector.facts(), JSX).findings.filter((f) => f.checkId === checkId);

describe("the tailwind resolver reads text-transform", () => {
  it("resolves the uppercase utility", () => {
    expect(resolveClass("uppercase")).toEqual([{ kind: "transform", text: "uppercase" }]);
  });

  it("resolves the rest of the family, including the reset", () => {
    expect(resolveClass("lowercase")).toEqual([{ kind: "transform", text: "lowercase" }]);
    expect(resolveClass("capitalize")).toEqual([{ kind: "transform", text: "capitalize" }]);
    expect(resolveClass("normal-case")).toEqual([{ kind: "transform", text: "none" }]);
  });

  it("still refuses tokens it does not carry", () => {
    // The control. A resolver that answered everything would be worse than one
    // that answers nothing, because the unresolved count is what keeps the report honest.
    expect(resolveClass("uppercased")).toEqual([]);
    expect(resolveClass("text-balance")).toEqual([]);
  });
});

describe("an element's utilities become one typography fact", () => {
  it("carries tracking and transform on the SAME fact", () => {
    const facts = extractJsx(`<p className="text-[12px] uppercase tracking-[0.2em]">Go</p>`, "page.tsx")
      .collector.facts();
    const withTracking = typography(facts).filter((t) => t.letterSpacingEm !== undefined);
    expect(withTracking).toHaveLength(1);
    expect(withTracking[0]?.transform).toBe("uppercase");
    expect(withTracking[0]?.sizePx).toBe(12);
  });

  it("keeps two elements apart", () => {
    // The merge is per element, not per file: uppercase on one must not exempt the other.
    const facts = extractJsx(
      `<div><p className="uppercase">A</p><p className="tracking-[0.2em] text-[12px]">B</p></div>`,
      "page.tsx",
    ).collector.facts();
    const withTracking = typography(facts).filter((t) => t.letterSpacingEm !== undefined);
    expect(withTracking).toHaveLength(1);
    expect(withTracking[0]?.transform).toBeUndefined();
  });
});

describe("the rules that correlate two typography fields now work here", () => {
  it("wide-tracking stays silent on small all-caps", () => {
    expect(fire(`<p className="text-[12px] uppercase tracking-[0.2em]">Ship</p>`, "wide-tracking")).toEqual([]);
  });

  it("wide-tracking still fires when the text is NOT uppercase", () => {
    // The control that proves the exemption is an exemption and not a mute button.
    expect(fire(`<p className="text-[12px] tracking-[0.2em]">Ship</p>`, "wide-tracking").length).toBeGreaterThan(0);
  });

  it("tight-leading sees line-height and size together", () => {
    // The sibling victim. `leading-3` is 0.75 and `text-[16px]` is body-sized, so
    // the rule has both halves of its predicate for the first time on this extractor.
    expect(fire(`<p className="text-[16px] leading-3">Ship</p>`, "tight-leading").length).toBeGreaterThan(0);
  });
});
