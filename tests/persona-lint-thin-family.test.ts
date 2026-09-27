/**
 * PR-FU5b A2 — the thin-family floor, pure logic.
 *
 * Red-first: a fixture family with apps 2 / screens 5 (ratio 2.5, apps < 3)
 * must read thin; a well-attested family must not; a thin family with an
 * excusing history note passes anyway (a declared gap, not a silent one).
 */
import { describe, expect, it } from "vitest";
import { lintThinFamilies } from "../src/core/persona-lint-thin-family.js";
import type { ThinFamilyInput } from "../src/core/persona-lint-thin-family.js";

describe("lintThinFamilies", () => {
  it("flags a fixture family with apps 2 / screens 5 as thin (ratio below floor AND apps < 3)", () => {
    const families: ThinFamilyInput[] = [{ slug: "fixture-thin", apps: 2, screens: 5 }];
    const result = lintThinFamilies(families, 6);
    expect(result.rows[0]?.thin).toBe(true);
    expect(result.rows[0]?.ratio).toBeCloseTo(2.5);
    expect(result.pass).toBe(false);
    expect(result.failing).toEqual(["fixture-thin"]);
  });

  it("does not flag a family at or above the floor with at least 3 apps", () => {
    const families: ThinFamilyInput[] = [{ slug: "fixture-thick", apps: 5, screens: 40 }]; // ratio 8
    const result = lintThinFamilies(families, 6);
    expect(result.rows[0]?.thin).toBe(false);
    expect(result.pass).toBe(true);
  });

  it("flags apps < 3 as thin even when the ratio is well above the floor", () => {
    const families: ThinFamilyInput[] = [{ slug: "fixture-few-apps", apps: 2, screens: 100 }]; // ratio 50
    const result = lintThinFamilies(families, 6);
    expect(result.rows[0]?.thin).toBe(true);
    expect(result.failing).toEqual(["fixture-few-apps"]);
  });

  it("excuses a thin family whose history note says 'thin' or 'provisional', and it does not fail", () => {
    const families: ThinFamilyInput[] = [
      { slug: "fixture-excused", apps: 2, screens: 5, history: [{ note: "merged; still thin, revisit later" }] },
    ];
    const result = lintThinFamilies(families, 6);
    expect(result.rows[0]?.thin).toBe(true);
    expect(result.rows[0]?.excused).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.failing).toEqual([]);
  });

  it("a history note that does NOT mention thin/provisional does not excuse it", () => {
    const families: ThinFamilyInput[] = [
      { slug: "fixture-not-excused", apps: 2, screens: 5, history: [{ note: "renamed for clarity" }] },
    ];
    const result = lintThinFamilies(families, 6);
    expect(result.rows[0]?.excused).toBe(false);
    expect(result.pass).toBe(false);
  });
});
