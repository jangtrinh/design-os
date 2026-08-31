/**
 * Identical facts collapse before any rule sees them.
 *
 * The same authored decision read twice is one decision. Two facts agreeing on
 * every field INCLUDING their provenance came from one place in one file, so a rule
 * counting them counts the reader's stutter rather than the page.
 *
 * This is a sink fix, and the alternative was the trap. Rules that print a fact
 * COUNT into `actual` — `image-hover-transform` reports "N transitions over M
 * images", `shape-assembled-illustration` reports "N stacked shapes" — reported a
 * DIFFERENT finding when their facts were duplicated. Guarding either rule would
 * have left the next count-printing rule exposed.
 *
 * The line the collapse must not cross is the second test: facts on different nodes
 * are different evidence, however alike their values look. This collapses stutter,
 * never evidence.
 *
 * Red probe: remove the dedupe from `indexFacts` and the first and third cases fail,
 * along with two metamorphic-law cases. The "different nodes" case stays green
 * throughout — it is the control that would catch a dedupe made too greedy.
 */
import { describe, expect, it } from "vitest";
import { indexFacts } from "../src/core/tell-rules.js";
import type { DesignFact } from "../src/core/design-facts/index.js";
import type { Provenance } from "../src/core/design-facts/fact-model.js";

const at = (line: number, nodeRef: string): Provenance =>
  ({ file: "f", line, extractor: "html-cascade", confidence: "resolved", nodeRef });

describe("indexFacts collapses stutter, not evidence", () => {
  it("collapses a fact read twice", () => {
    const fact: DesignFact = { kind: "radius", px: 16, at: at(3, "n1") };
    const index = indexFacts([fact, { ...fact }]);
    expect(index.by("radius")).toHaveLength(1);
  });

  it("keeps identical VALUES on different nodes", () => {
    // The control, and the line the collapse must never cross: two elements with
    // the same radius are two elements, and `monotonous-spacing` exists to say so.
    const index = indexFacts([
      { kind: "radius", px: 16, at: at(3, "n1") },
      { kind: "radius", px: 16, at: at(4, "n2") },
    ]);
    expect(index.by("radius")).toHaveLength(2);
  });

  it("collapses regardless of the order an extractor built the object in", () => {
    // Property order is not part of what a fact SAYS.
    const a = { kind: "radius", px: 16, at: at(3, "n1") } as DesignFact;
    const b = { at: at(3, "n1"), px: 16, kind: "radius" } as unknown as DesignFact;
    expect(indexFacts([a, b]).by("radius")).toHaveLength(1);
  });

  it("keeps the deterministic line ordering the engine relies on", () => {
    const index = indexFacts([
      { kind: "radius", px: 4, at: at(9, "n9") },
      { kind: "radius", px: 8, at: at(2, "n2") },
    ]);
    expect(index.by("radius").map((r) => r.at.line)).toEqual([2, 9]);
  });
});
