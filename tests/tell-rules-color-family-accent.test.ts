/**
 * PR-FU5b A1 — the `ai-color-palette` tell knows the family.
 *
 * Red-first: without a family-accent context, a purple/cyan hit reads exactly
 * as it always has (the alarm message). With a matching context, that SAME hex
 * is acknowledged as "family accent (<slug>)" instead — the alarm never fires
 * for it. A hue outside the ±15° tolerance still alarms even with a context
 * set, and clearing the context restores default behaviour byte-for-byte.
 */
import { afterEach, describe, expect, it } from "vitest";
import { aiColorPalette, setFamilyAccentContext, getFamilyAccentContext } from "../src/core/tell-rules-color.js";
import { indexFacts } from "../src/core/tell-rules.js";
import type { DesignFact, Provenance } from "../src/core/design-facts/index.js";

const at = (line = 1): Provenance => ({ file: "f", line, extractor: "html-cascade", confidence: "resolved" });

// #735acc — OKLCH hue ~290°, the serif-display family's real declared accent
// (knowledge/personas/families.json, slug web-serif-display-plus-sans).
const FAMILY_ACCENT_HEX = "735acc";
const FAMILY_ACCENT_HUE_DEG = 290;
const FAMILY_SLUG = "web-serif-display-plus-sans";

function run(facts: DesignFact[]) {
  return aiColorPalette.run(indexFacts(facts));
}

afterEach(() => setFamilyAccentContext(undefined));

describe("ai-color-palette — without a family-accent context (unchanged default)", () => {
  it("flags a purple hit with the generic alarm message", () => {
    expect(getFamilyAccentContext()).toBeUndefined();
    const findings = run([{ kind: "color", hex: FAMILY_ACCENT_HEX, role: "bg", at: at(1) }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/most recognisable palette tell/);
    expect(findings[0]?.message).not.toMatch(/family accent/);
  });
});

describe("ai-color-palette — with a matching family-accent context (PR-FU5b A1)", () => {
  it("acknowledges the SAME hex as the family's own accent instead of alarming", () => {
    setFamilyAccentContext({ slug: FAMILY_SLUG, hueDeg: FAMILY_ACCENT_HUE_DEG });
    const findings = run([{ kind: "color", hex: FAMILY_ACCENT_HEX, role: "bg", at: at(1) }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(`family accent (${FAMILY_SLUG})`);
    expect(findings[0]?.message).not.toMatch(/most recognisable palette tell/);
    expect(findings[0]?.severity).toBe("advisory");
  });

  it("still alarms a hue outside the ±15° tolerance even with a context set", () => {
    setFamilyAccentContext({ slug: FAMILY_SLUG, hueDeg: FAMILY_ACCENT_HUE_DEG });
    // #06b6d4 is the AI-cyan family, nowhere near a 290° violet hue.
    const findings = run([{ kind: "color", hex: "06b6d4", role: "bg", at: at(1) }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/most recognisable palette tell/);
  });

  it("splits a mixed page: the family's own violet is acknowledged, an unrelated cyan still alarms", () => {
    setFamilyAccentContext({ slug: FAMILY_SLUG, hueDeg: FAMILY_ACCENT_HUE_DEG });
    const findings = run([
      { kind: "color", hex: FAMILY_ACCENT_HEX, role: "bg", at: at(1) },
      { kind: "color", hex: "06b6d4", role: "fg", at: at(2) },
    ]);
    expect(findings).toHaveLength(2);
    const alarm = findings.find((f) => f.message.includes("most recognisable palette tell"));
    const legit = findings.find((f) => f.message.includes("family accent"));
    expect(alarm?.actual).toBe("#06b6d4");
    expect(legit?.actual).toBe(`#${FAMILY_ACCENT_HEX}`);
  });

  it("legitimizes a gradient stop only when EVERY purple stop in it matches", () => {
    setFamilyAccentContext({ slug: FAMILY_SLUG, hueDeg: FAMILY_ACCENT_HUE_DEG });
    // #4100ff is ai-purple by the r/g/b heuristic but its OKLCH hue (~274°) sits
    // 16° from the family's 290° accent — just outside the ±15° tolerance.
    const findings = run([
      { kind: "gradient", gradientKind: "linear", stops: [{ hex: FAMILY_ACCENT_HEX }, { hex: "4100ff" }], at: at(1) },
    ]);
    expect(findings.some((f) => f.message.includes("most recognisable palette tell"))).toBe(true);
    expect(findings.some((f) => f.message.includes("family accent"))).toBe(false);
  });
});

describe("ai-color-palette — clearing the context restores default behaviour", () => {
  it("returns to the alarm message after setFamilyAccentContext(undefined)", () => {
    setFamilyAccentContext({ slug: FAMILY_SLUG, hueDeg: FAMILY_ACCENT_HUE_DEG });
    setFamilyAccentContext(undefined);
    const findings = run([{ kind: "color", hex: FAMILY_ACCENT_HEX, role: "bg", at: at(1) }]);
    expect(findings[0]?.message).toMatch(/most recognisable palette tell/);
  });
});
