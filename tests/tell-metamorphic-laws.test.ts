/**
 * Three properties of the rule engine that no single fixture can state.
 *
 * A fixture says "these facts produce this finding". These say something a fixture
 * cannot: that the ANSWER DOES NOT DEPEND on things it must not depend on. L3 in
 * particular closes a defect by construction rather than by example — 54 findings were
 * once reported where 210 duplicate facts existed, and the fix went in inside
 * `cramped-padding`. The repo's own rule says a missing-rule bug is fixed at the shared
 * layer, so the property is asserted at the sink for every rule at once.
 *
 * Deliberately three named laws and not broad property-based generation. Random
 * DesignFacts explore unrealistic space with no oracle for "should this fire"; these
 * three have obvious oracles and would each have caught a real defect.
 *
 * WHAT THE PROBES FOUND, recorded because it is not obvious from the code:
 *
 *  - L3 is guarded TWICE. Disabling the dedup alone leaves it green; disabling
 *    `collapseRepeated` alone leaves it green; only disabling BOTH turns it red. Either
 *    mechanism is sufficient on its own, which is defence in depth — and also means a
 *    probe aimed at one of them proves nothing about the law.
 *  - L2 does NOT rest on the engine's final `findings.sort()`. Deleting that sort leaves
 *    the law green, because the rules are order-insensitive and emit in fact order. The
 *    law only reddens under a change that genuinely varies with input order — and then
 *    it fails 2 of its 5 cases, so a single-seed version of L2 would have missed the
 *    break entirely. That is why there are four seeds and a reversal, not one shuffle.
 */
import { describe, expect, it } from "vitest";
import { lintTell, TELL_RULES } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import type { DesignFact } from "../src/core/design-facts/fact-kinds.js";
import type { Provenance } from "../src/core/design-facts/fact-model.js";
import { withOrdinals } from "./helpers/finding-key.js";

const html = extractorById("html-cascade");
if (html === undefined) throw new Error("html-cascade must be registered");

const at = (line = 1, nodeRef?: string): Provenance =>
  ({ file: "f", line, extractor: "html-cascade", confidence: "resolved", nodeRef });

/** Small fact sets that each trip at least one rule. */
const CASES: Record<string, DesignFact[]> = {
  "side-tab": [
    { kind: "border", sides: ["left"], widthPx: 4, at: at(3, "n1") },
    { kind: "radius", px: 16, at: at(3, "n1") },
  ],
  "cream-palette": [{ kind: "color", role: "bg", hex: "faf7f0", at: at(4, "n2") }],
  "tight-leading": [
    { kind: "typography", sizePx: 16, lineHeight: 1.0, at: at(5, "n3") },
  ],
  "dark-glow": [
    { kind: "color", role: "bg", hex: "141c17", at: at(6, "n4") },
    { kind: "shadow", offsetXPx: 0, offsetYPx: 0, blurPx: 40, hex: "9ef5b4", at: at(6, "n4") },
  ],
};

/** A fact kind nothing in CASES depends on, so adding it must change nothing. */
const UNRELATED: DesignFact = {
  kind: "motion",
  motionKind: "transition",
  durationMs: 200,
  props: ["opacity"],
  at: at(99, "unrelated-node"),
};

function findingsFor(facts: DesignFact[]): string[] {
  return lintTell(facts, html as never)
    .findings.map((f) => `${f.checkId}|${f.message}`)
    .sort();
}

/**
 * The finding SET, by stable key, for L3.
 *
 * Deliberately not `findingsFor`: that keys on `message`, and `collapseRepeated`
 * folds an element count into the message. Under duplication a count legitimately
 * changes, so a message-keyed set would be red for a reason that is not a defect.
 * `keyOf` is the identity the field corpus already uses — shared from one file so
 * a law and the corpus cannot drift apart about what "the same finding" means.
 */
function keysFor(facts: DesignFact[]): string[] {
  return withOrdinals(lintTell(facts, html as never).findings).sort();
}

/**
 * The findings in the order the engine emitted them.
 *
 * L2 MUST use this. The sorted helper above makes the law tautological — order
 * dependence cannot be observed through a sort — and the first draft of L2 did exactly
 * that: deleting the engine's own deterministic sort left the law green. That is the
 * same shape as the 13 probes this work exists to prevent, found in the probe's own
 * scaffolding rather than in the code under test.
 */
function findingsInEmittedOrder(facts: DesignFact[]): string[] {
  return lintTell(facts, html as never).findings.map((f) => `${f.checkId}|${f.message}`);
}

/** Deterministic shuffle. A law asserted with Math.random is not reproducible. */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("metamorphic law L1 — an unrelated fact changes nothing", () => {
  it.each(Object.entries(CASES))("%s is unaffected by an unrelated motion fact", (_name, facts) => {
    const before = findingsFor(facts);
    const after = findingsFor([...facts, UNRELATED]);
    // Compare only the checkIds the original produced. Adding a fact may legitimately
    // trip a DIFFERENT rule; what must not happen is the original verdict moving.
    const ids = new Set(before.map((s) => s.split("|")[0]));
    expect(after.filter((s) => ids.has(s.split("|")[0] as string))).toEqual(before);
  });
});

describe("metamorphic law L2 — fact order changes nothing", () => {
  const all = Object.values(CASES).flat();

  it.each([1, 7, 42, 1337])("output is identical under shuffle seed %i", (seed) => {
    expect(findingsInEmittedOrder(seededShuffle(all, seed))).toEqual(findingsInEmittedOrder(all));
  });

  it("is identical under full reversal", () => {
    expect(findingsInEmittedOrder([...all].reverse())).toEqual(findingsInEmittedOrder(all));
  });
});

describe("metamorphic law L3 — a duplicated fact changes no finding", () => {
  /**
   * The law that closes a class. 210 duplicate facts once produced 54 findings where
   * they should have produced far fewer, and the fix went in inside one rule. Asserting
   * it at the sink covers every rule, including ones not yet written.
   *
   * WHY SET EQUALITY AND NOT A COUNT CEILING. The first form was
   * `twice.length <= once.length`. That catches doubling — the defect it was written
   * for — but passes just as happily if duplication makes a finding DISAPPEAR, which
   * is an equally real bug (a dedup key collision swallowing a distinct finding).
   * Comparing the SET of stable keys closes both directions.
   *
   * HONESTY ABOUT WHAT THIS STRENGTHENING IS PROVEN TO ADD: nothing yet, on this
   * engine. Three sabotages were run trying to find an input where set equality
   * reddens and the ceiling stays green, and none of them separated the two laws:
   *
   *   1. dedup key reduced to `checkId` alone      -> both stayed green
   *   2. `collapseRepeated` made to DROP repeated groups instead of folding them
   *      (the literal "duplicate-induced removal" shape)  -> both stayed green,
   *      because the dedup pass upstream removes the duplicates before collapse
   *      ever sees them
   *   3. both of the above at once                 -> L3 still green; the vacuity
   *      guard below fired instead, which is a different guard doing its job
   *
   * The reason is structural, and the file header already names it: L3 is guarded
   * twice, and both guards are insensitive to duplication, so neither can produce a
   * once-vs-twice difference. A rule with an UPPER bound on a fact count could —
   * doubling would push it past the bound and the finding would vanish — and no such
   * rule exists today. So this assertion is stronger BY CONSTRUCTION for the class
   * the issue names, and is currently unfalsifiable in practice. It is written this
   * way so that the day such a rule is added, the law is already waiting for it.
   */
  it.each(Object.entries(CASES))("%s reports the same finding SET when its facts are duplicated", (_name, facts) => {
    const once = keysFor(facts);
    // Same nodeRef, same values — the same authored decision seen twice.
    const twice = keysFor([...facts, ...facts.map((f) => ({ ...f }))]);
    expect(twice, "duplicating a fact changed which findings were reported").toEqual(once);
  });

  it("holds across the whole set at once", () => {
    const all = Object.values(CASES).flat();
    const once = keysFor(all);
    const twice = keysFor([...all, ...all.map((f) => ({ ...f }))]);
    expect(twice).toEqual(once);
  });
});

describe("the laws are asserted against a set that actually fires", () => {
  it("every case trips at least one rule", () => {
    // A law proven over facts that produce no findings proves nothing at all.
    for (const [name, facts] of Object.entries(CASES)) {
      expect(findingsFor(facts).length, `${name} produced no findings — the laws over it are vacuous`)
        .toBeGreaterThan(0);
    }
  });

  it("covers rules from more than one section", () => {
    const sections = new Set(
      lintTell(Object.values(CASES).flat(), html as never).findings.map((f) => f.section),
    );
    expect(sections.size).toBeGreaterThan(1);
  });

  it("the engine has rules to be lawful about", () => {
    expect(TELL_RULES.length).toBeGreaterThan(30);
  });
});
