/**
 * Phase 06's paired test: JSX/Tailwind, SFC, and bare CSS.
 *
 * The interesting assertions are not "it finds tells" — they are the three ways
 * a web extractor can lie:
 *  - resolving a utility against the DEFAULT scale when the project overrode it;
 *  - inventing a value for `className={cn(...)}` it cannot evaluate;
 *  - reading an SFC's <style> block at the template's lower fidelity.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractJsx } from "../src/core/extractors/web/jsx-extractor.js";
import { extractSfc, extractCssOnly } from "../src/core/extractors/web/sfc-extractor.js";
import { resolveClass, spacingPx, TEXT_SIZES, RADII } from "../src/core/extractors/web/tailwind-resolver.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import type { DesignFact, FactKind } from "../src/core/design-facts/index.js";

const FIX = join(fileURLToPath(new URL("..", import.meta.url)), "tests", "fixtures", "web");
const read = (n: string): string => readFileSync(join(FIX, n), "utf8");
const jsxProfile = extractorById("jsx-tailwind")!;
const sfcProfile = extractorById("sfc")!;
const cssProfile = extractorById("css-only")!;

const of = <K extends FactKind>(facts: readonly DesignFact[], kind: K) =>
  facts.filter((f): f is Extract<DesignFact, { kind: K }> => f.kind === kind);

describe("tailwind resolver", () => {
  it("resolves the scales as data, not as guesses", () => {
    expect(spacingPx("4")).toBe(16);
    expect(spacingPx("px")).toBe(1);
    expect(TEXT_SIZES["sm"]).toBe(14);
    expect(RADII["2xl"]).toBe(16);
  });

  it("reads arbitrary values exactly", () => {
    expect(resolveClass("text-[13px]")).toEqual([{ kind: "fontSize", value: 13 }]);
    expect(resolveClass("bg-[#7c3aed]")).toEqual([{ kind: "color", hex: "7c3aed", role: "bg" }]);
    expect(resolveClass("p-[18px]")[0]).toMatchObject({ kind: "spacing", value: 18 });
  });

  it("keeps the SIDE of a one-sided border utility", () => {
    expect(resolveClass("border-l-4")).toEqual([
      { kind: "borderWidth", value: 4, sides: ["left"] },
    ]);
    expect(resolveClass("border-2")[0]).toMatchObject({ sides: ["top", "right", "bottom", "left"] });
  });

  it("strips a state or breakpoint prefix before resolving", () => {
    expect(resolveClass("md:rounded-2xl")).toEqual([{ kind: "radius", value: 16 }]);
    expect(resolveClass("hover:bg-violet-600")).toEqual([{ kind: "color", hex: "7c3aed", role: "bg" }]);
  });

  it("returns nothing for a token it does not carry", () => {
    expect(resolveClass("bg-teal-750")).toEqual([]);
    expect(resolveClass("not-a-utility")).toEqual([]);
  });
});

describe("JSX / Tailwind", () => {
  const slop = extractJsx(read("tell-react-slop.tsx"), "slop.tsx");
  const ids = lintTell(slop.collector.facts(), jsxProfile).findings.map((f) => f.checkId);

  it("finds the tells a generated component carries", () => {
    for (const expected of ["side-tab", "justified-text", "gray-on-color", "ai-color-palette", "extreme-negative-tracking"])
      expect(ids, expected).toContain(expected);
  });

  it("is silent on a considered component", () => {
    const clean = extractJsx(read("tell-react-clean.tsx"), "clean.tsx");
    expect(lintTell(clean.collector.facts(), jsxProfile).findings).toEqual([]);
  });

  it("emits NOTHING for a className it cannot evaluate, and counts it", () => {
    const src = `export const A = () => <div className={cn("border-l-4", on && "bg-purple-600")} />;`;
    const r = extractJsx(src, "a.tsx");
    // A guess here is a finding about a component that never renders that way.
    expect(of(r.collector.facts(), "border")).toHaveLength(0);
    expect(of(r.collector.facts(), "color")).toHaveLength(0);
    expect(r.collector.unresolvedCount).toBeGreaterThan(0);
  });

  it("counts a utility-shaped token it could not map, rather than dropping it", () => {
    const r = extractJsx(`export const A = () => <div className="bg-teal-750 p-4" />;`, "a.tsx");
    expect(r.collector.unresolved().some((u) => u.what.includes("bg-teal-750"))).toBe(true);
    // The token it COULD map still lands.
    expect(of(r.collector.facts(), "spacing").length).toBeGreaterThan(0);
  });

  it("reads a style={{}} object literal", () => {
    const src = `export const A = () => <p style={{ fontSize: 11, color: "#9ca3af" }}>x</p>;`;
    const facts = extractJsx(src, "a.tsx").collector.facts();
    expect(of(facts, "typography")[0]?.sizePx).toBe(11);
    expect(of(facts, "color")[0]).toMatchObject({ hex: "9ca3af", role: "fg" });
  });

  it("flags a styled-components interpolation as unresolvable", () => {
    const src = "const B = styled.div`color: ${p => p.tone}; border-radius: 16px;`;";
    const r = extractJsx(src, "b.tsx");
    expect(r.collector.unresolved().some((u) => u.what.includes("interpolation"))).toBe(true);
    expect(of(r.collector.facts(), "radius")[0]?.px).toBe(16);
  });

  it("supplies structure only at heuristic confidence", () => {
    expect(jsxProfile.supplies.structure).toBe("heuristic");
    const structures = of(slop.collector.facts(), "structure");
    expect(structures.length).toBeGreaterThan(0);
    for (const s of structures) expect(s.at.confidence).toBe("heuristic");
  });
});

describe("SFC", () => {
  const r = extractSfc(read("tell-svelte-slop.svelte"), "c.svelte");
  const ids = lintTell(r.collector.facts(), sfcProfile).findings.map((f) => f.checkId);

  it("reads the style block through the cascade and the template through the scanner", () => {
    for (const expected of ["side-tab", "gray-on-color", "overused-font"])
      expect(ids, expected).toContain(expected);
  });

  it("reports style-block facts at RESOLVED confidence, not the template's tier", () => {
    const colors = of(r.collector.facts(), "color");
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) expect(c.at.confidence).toBe("resolved");
  });

  it("points every fact at a line inside the SFC, not inside a synthetic carrier", () => {
    const lines = read("tell-svelte-slop.svelte").split("\n").length;
    for (const f of r.collector.facts()) {
      expect(f.at.line).toBeGreaterThan(0);
      expect(f.at.line).toBeLessThanOrEqual(lines);
    }
  });

  it("re-stamps borrowed template facts with its own extractor id", () => {
    for (const f of r.collector.facts()) expect(f.at.extractor).toBe("sfc");
  });
});

describe("bare stylesheet", () => {
  const r = extractCssOnly(read("tell-styles-slop.css"), "s.css");
  const ids = lintTell(r.collector.facts(), cssProfile).findings.map((f) => f.checkId);

  it("reads declarations", () => {
    for (const expected of ["overused-font", "ai-color-palette", "justified-text"])
      expect(ids, expected).toContain(expected);
  });

  it("declares no structure and no text — so nesting rules are NOT-EVALUATED", () => {
    expect(cssProfile.supplies.structure).toBeUndefined();
    expect(cssProfile.supplies.text).toBeUndefined();
    const notEvaluated = lintTell(r.collector.facts(), cssProfile).notEvaluated.map((n) => n.id);
    expect(notEvaluated).toContain("nested-cards");
    expect(notEvaluated).toContain("repeated-container-text");
  });

  it("reports declarations at RESOLVED confidence — the value IS what renders", () => {
    // A bare stylesheet has no cascade to lose: every declaration is exactly the
    // value it states. Dropping this tier to `literal` would make low-contrast
    // NOT-EVALUATED on stylesheets it can legitimately judge.
    expect(r.collector.facts().length).toBeGreaterThan(0);
    for (const f of r.collector.facts()) expect(f.at.confidence).toBe("resolved");
  });

  it("points every fact at its REAL line in the .css file", () => {
    const src = read("tell-styles-slop.css");
    const lines = src.split("\n");
    const font = of(r.collector.facts(), "typography").find((t) => t.family === "Inter");
    expect(font).toBeDefined();
    expect(lines[(font?.at.line ?? 1) - 1]).toContain("font-family");
    const align = of(r.collector.facts(), "typography").find((t) => t.align === "justify");
    expect(lines[(align?.at.line ?? 1) - 1]).toContain("text-align");
    expect(new Set(r.collector.facts().map((f) => f.at.line)).size).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const a = JSON.stringify(extractCssOnly(read("tell-styles-slop.css"), "s.css").collector.facts());
    const b = JSON.stringify(extractCssOnly(read("tell-styles-slop.css"), "s.css").collector.facts());
    expect(a).toBe(b);
  });
});
