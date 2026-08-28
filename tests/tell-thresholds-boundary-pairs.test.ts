/**
 * The meta-test: no threshold may sit unpinned.
 *
 * 13 of 63 deliberate red probes came back green while this family was being built.
 * Each one was a number nothing asserted — the guard existed, moving it broke nothing,
 * and the suite went on certifying a rule that no longer worked. Hand-probing is what
 * failed; this replaces it with a structural check.
 *
 * Two assertions, and the second is the one that matters:
 *   1. Every constant in TELL_THRESHOLDS has a boundary pair, or is on a stated
 *      unpinned list with a reason. A new constant with neither fails.
 *   2. Every pair actually behaves: silent AT the threshold, firing PAST it. A pair
 *      that fires in both directions, or neither, pins nothing.
 *
 * This is the shape `partition()` already uses — it throws when a rule lands in neither
 * bucket, rather than hoping someone notices.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TELL_THRESHOLDS } from "../src/core/tell-thresholds.js";
import type { ThresholdKey } from "../src/core/tell-thresholds.js";
import { BOUNDARY_PAIRS } from "./tell-boundary-pairs.js";
import type { CssPair, HexPair } from "./tell-boundary-pairs.js";
import { lintFileByExtractor } from "../src/core/lint-file-by-extractor.js";
import { extractorById } from "../src/core/design-facts/index.js";

const HTML = extractorById("html-cascade");
if (HTML === undefined) throw new Error("html-cascade must be registered");

/**
 * Thresholds that do not yet have a pair, each with the reason.
 *
 * This list is the honest half of the contract. It is not an escape hatch — every entry
 * is a threshold currently guarded only by the rules' own fixtures, and the count is
 * printed on every run so it can be driven down rather than quietly tolerated.
 *
 * A new constant may NOT be added here without a reason, and the meta-test fails if a
 * key appears in both this list and BOUNDARY_PAIRS.
 */
const UNPINNED: Partial<Record<ThresholdKey, string>> = {
  HIERARCHY_MIN_STEP: "needs a three-size document; pair pending",
  DISPLAY_FLOOR_PX: "needs a three-size document with and without display type; pair pending",
  OVERSIZED_H1_RATIO: "needs an h1 plus a second size at a controlled ratio; pair pending",
  BORDER_FRAME_MIN_PX: "side-tab also requires an edge position the cascade tier cannot see; pair pending",
  HAIRLINE_MAX_PX: "paired rule needs a border and a shadow on one owner; pair pending",
  HEAVY_SHADOW_MIN_BLUR_PX: "same rule as HAIRLINE_MAX_PX; pair pending",
  ROUNDED_MIN_PX: "side-tab dependency, as above; pair pending",
  CARD_RADIUS_MIN_PX: "heavy-frame needs four sides plus a radius on one owner; pair pending",
  ENOUGH_SPACINGS_TO_JUDGE: "needs eight spacing declarations of one value; pair pending",
  REPEATED_TEXT_MIN_COUNT: "the char-length pair covers the same rule; count pair pending",
  SHALLOW_CARD_MAX_DEPTH: "needs a controlled card nesting depth; pair pending",
  ICON_TILE_MAX_RADIUS_PX: "needs svg children with a controlled radius; pair pending",
  ICON_TILE_MIN_COUNT: "same rule; pair pending",
  KICKER_MAX_CHARS: "needs an all-caps run above a heading; pair pending",
  KICKER_MAX_PX: "same rule; pair pending",
  EYEBROW_MAX_CHARS: "needs a chip positioned above an h1 within a line window; pair pending",
  EYEBROW_MAX_LINE_GAP: "same rule; pair pending",
  PILL_RADIUS_PX: "shared by pulsing-dot and hero-eyebrow-chip; pair pending",
  CHIP_RADIUS_MIN_PX: "same rule as EYEBROW_MAX_CHARS; pair pending",
  FAST_LOOP_MAX_MS: "needs an infinite keyframe animation with a controlled duration; pair pending",
  SLOW_LOOP_MIN_MS: "same rule; pair pending",
  HALO_MAX_LINE_GAP: "needs a radial gradient at a controlled line distance from an h1; pair pending",
  INVISIBLE_TEXT_MAX_ALPHA: "needs an rgba foreground below the floor; pair pending",
  OPAQUE_MIN_ALPHA: "contrast resolution, not a rule predicate — exercised by the contrast tests",
  OWN_BACKGROUND_MIN_ALPHA: "role synthesis, exercised by role-synthesis.test.ts",
  EM_DASH_MIN_WORDS: "voice rules run on text content; pair pending",
  EM_DASH_MIN_COUNT: "same rule; pair pending",
  EM_DASH_MAX_RATE: "same rule; pair pending",
};

function checkIdsFor(html: string): Set<string> {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  try {
    const p = join(dir, "page.html");
    writeFileSync(p, html);
    const r = lintFileByExtractor(p, "html-cascade", HTML as never);
    return new Set(r.findings.map((f) => f.checkId));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("threshold boundary pairs", () => {
  it("every threshold is either pinned by a pair or listed as unpinned with a reason", () => {
    const keys = Object.keys(TELL_THRESHOLDS) as ThresholdKey[];
    const orphans = keys.filter((k) => BOUNDARY_PAIRS[k] === undefined && UNPINNED[k] === undefined);
    expect(
      orphans,
      "a threshold with neither a boundary pair nor a stated reason. Add a pair in " +
        "tests/tell-boundary-pairs.ts, or an entry in UNPINNED saying why not:\n  " +
        orphans.join("\n  "),
    ).toEqual([]);
  });

  it("no threshold is both pinned and excused", () => {
    const both = (Object.keys(TELL_THRESHOLDS) as ThresholdKey[]).filter(
      (k) => BOUNDARY_PAIRS[k] !== undefined && UNPINNED[k] !== undefined,
    );
    expect(both, "listed as unpinned while a pair exists — delete the excuse").toEqual([]);
  });

  it("every threshold carries provenance", () => {
    for (const [key, t] of Object.entries(TELL_THRESHOLDS)) {
      expect(t.provenance.trim().length, `${key} has no provenance`).toBeGreaterThan(0);
      expect(t.owner.trim().length, `${key} names no owner`).toBeGreaterThan(0);
    }
  });

  const hexPairs = Object.entries(BOUNDARY_PAIRS).filter(([, p]) => p?.kind === "hex") as Array<[string, HexPair]>;
  const cssPairs = Object.entries(BOUNDARY_PAIRS).filter(([, p]) => p?.kind === "css") as Array<[string, CssPair]>;

  it.each(hexPairs)("%s: the colour AT the edge is outside the window", (_k, pair) => {
    expect(pair.predicate(pair.at.replace("#", "")), pair.note).toBe(false);
  });

  it.each(hexPairs)("%s: the colour PAST the edge is inside the window", (_k, pair) => {
    expect(pair.predicate(pair.past.replace("#", "")), pair.note).toBe(true);
  });

  it.each(cssPairs)("%s: silent AT the threshold", (_k, pair) => {
    expect(checkIdsFor(pair.at), pair.note).not.toContain(pair.checkId);
  });

  it.each(cssPairs)("%s: fires PAST the threshold", (_k, pair) => {
    expect(checkIdsFor(pair.past), pair.note).toContain(pair.checkId);
  });

  it("reports how many thresholds are still unpinned", () => {
    const total = Object.keys(TELL_THRESHOLDS).length;
    const pinned = Object.keys(BOUNDARY_PAIRS).length;
    // Not a threshold — a visible number, so the gap is driven down rather than tolerated.
    console.log(
      `tell thresholds: ${total} total, ${pinned} pinned by an executable boundary pair, ` +
        `${total - pinned} still guarded only by rule fixtures`,
    );
    expect(pinned).toBeGreaterThan(0);
  });
});
