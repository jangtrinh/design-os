/**
 * Spec-022 R4 (amendment item 4 / Fable B6) — shared identity-token matcher
 * regressions.
 *
 * `identity-tokens.mjs` is the ONE word-boundary matcher every consumer
 * (checks-judging.mjs, checks-candidates.mjs, build-judging-bundle.mjs) is
 * rewired onto. These are the exact regressions the amendment names: hex
 * codenames and CSS colors that merely CONTAIN a short token must never
 * false-positive; a real standalone occurrence must always fire.
 */
import { describe, expect, it } from "vitest";
// Plain .mjs, no ambient type declarations — this file unit-tests the shared
// matcher module directly, which is exactly the module under test here.
// @ts-expect-error — no .d.ts for this .mjs module
import { boundaryTokenRegex, scanIdentityTokens } from "../specs/022-taste-transfer-prereg/scripts/lib/identity-tokens.mjs";

describe("R4 — identity-tokens.mjs boundary matcher", () => {
  const boundaryTokens = ["control", "treatment", "A1", "P2"];

  it("does NOT fire on ordinary English containing a banned token as a substring", () => {
    expect(scanIdentityTokens("The form controls are legible.", { boundaryTokens })).toEqual([]);
    expect(scanIdentityTokens("# controlled vocabulary", { boundaryTokens })).toEqual([]);
    expect(scanIdentityTokens("both treatments looked calm", { boundaryTokens })).toEqual([]);
  });

  it("does NOT fire on a CSS hex color that merely contains a candidate-id digram", () => {
    expect(scanIdentityTokens("accent: #1a1a1a;", { boundaryTokens: ["A1"] })).toEqual([]);
  });

  it("does NOT fire on 8-hex codenames that merely contain a candidate-id digram", () => {
    expect(scanIdentityTokens("codename a1b2c3d4 assigned", { boundaryTokens: ["A1"] })).toEqual([]);
    expect(scanIdentityTokens("codename d1e2f3a4 assigned", { boundaryTokens: ["D1"] })).toEqual([]);
  });

  it("DOES fire on a real standalone occurrence of an arm word", () => {
    expect(scanIdentityTokens("Left side is the control.", { boundaryTokens })).toEqual(["control"]);
    expect(scanIdentityTokens("This is the treatment arm.", { boundaryTokens })).toEqual(["treatment"]);
  });

  it("DOES fire on a real standalone occurrence of a candidate id", () => {
    expect(scanIdentityTokens("Built with candidate A1 guidance.", { boundaryTokens: ["A1"] })).toEqual(["A1"]);
    expect(scanIdentityTokens('the badge reads "P2"', { boundaryTokens: ["P2"] })).toEqual(["P2"]);
  });

  it("DOES fire on a real standalone occurrence of an asset id (boundary)", () => {
    expect(scanIdentityTokens("ref=PA-MED-1-wide-1 here", { boundaryTokens: ["PA-MED-1-wide-1"] })).toEqual(["PA-MED-1-wide-1"]);
  });

  it("DOES fire on a committed media path (substring)", () => {
    expect(
      scanIdentityTokens('<img src="../../../assets/brief-media/PA-MED-1-wide-1.jpg">', {
        substringTokens: ["assets/brief-media/PA-MED-1-wide-1.jpg"],
      }),
    ).toEqual(["assets/brief-media/PA-MED-1-wide-1.jpg"]);
  });

  it("boundaryTokenRegex matches only on a genuine word boundary", () => {
    expect(boundaryTokenRegex("control").test("controls")).toBe(false);
    expect(boundaryTokenRegex("control").test("the control panel")).toBe(true);
    expect(boundaryTokenRegex("A1").test("a1b2c3d4")).toBe(false);
    expect(boundaryTokenRegex("A1").test("candidate A1 wins")).toBe(true);
  });
});
