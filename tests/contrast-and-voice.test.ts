/**
 * Phase 08: contrast computed from facts, and the four voice tells.
 *
 * The bar for contrast is a number, not a behaviour: impeccable reported
 * `2.2:1 — #9ca3af on #7c3aed` on the probe fixture from static analysis. This
 * must reach the same value through the cascade, and must REFUSE in the three
 * cases where a number would be a fiction — a gradient background, a
 * literal-tier extractor, and no resolvable background at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkComputedContrast, AA_LARGE } from "../src/core/a11y-checks-contrast.js";
import {
  checkMarketingBuzzword, checkEmDashOveruse, checkTheaterSlopPhrase, checkAphoristicCadence, checkVoice,
} from "../src/core/content-checks-voice.js";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { extractSwiftUi } from "../src/core/extractors/native/swiftui-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import type { DesignFact, Provenance } from "../src/core/design-facts/index.js";
import { AA_NORMAL } from "../src/core/ds-a11y.js";

const PROBE = join(
  fileURLToPath(new URL("..", import.meta.url)),
  "plans", "260826-1603-polyglot-design-tell-detection", "evidence", "fixtures", "probe.html",
);

const html = extractorById("html-cascade")!;
const swiftui = extractorById("swiftui")!;

const at = (line: number, nodeRef?: string): Provenance =>
  ({ file: "f", line, extractor: "html-cascade", confidence: "resolved", nodeRef });

const text = (content: string, line = 1): DesignFact =>
  ({ kind: "text", content, role: "body", at: at(line) });

describe("computed contrast", () => {
  it("reaches the exact ratio measured on the probe fixture", () => {
    const r = extractHtml(readFileSync(PROBE, "utf8"), PROBE);
    const result = lintTell(r.collector.facts(), html);
    const low = result.contrast.find((f) => f.checkId === "low-contrast");
    expect(low).toBeDefined();
    expect(low?.ratio).toBeCloseTo(2.24, 2);
    expect(low?.required).toBe(AA_NORMAL);
    expect(low?.message).toContain("#9ca3af");
    expect(low?.message).toContain("#7c3aed");
    expect(low?.nodeRef).toContain("p.muted");
  });

  it("inherits the background from an ANCESTOR, not only the element itself", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 0, ref: "wrap", at: at(1, "wrap") },
      { kind: "color", hex: "7c3aed", role: "bg", at: at(1, "wrap") },
      { kind: "structure", node: "p", depth: 1, ref: "p", parentRef: "wrap", at: at(2, "p") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(2, "p") },
    ];
    const { findings } = checkComputedContrast(facts, "resolved");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ratio).toBeCloseTo(2.24, 2);
  });

  it("passes text that clears the floor", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 0, ref: "w", at: at(1, "w") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "w") },
      { kind: "structure", node: "p", depth: 1, ref: "p", parentRef: "w", at: at(2, "p") },
      { kind: "color", hex: "1a1a1a", role: "fg", at: at(2, "p") },
    ];
    expect(checkComputedContrast(facts, "resolved").findings).toEqual([]);
  });

  it("applies the LARGE-text threshold from computed size and weight", () => {
    const base: DesignFact[] = [
      { kind: "structure", node: "div", depth: 0, ref: "w", at: at(1, "w") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "w") },
      { kind: "structure", node: "h1", depth: 1, ref: "h", parentRef: "w", at: at(2, "h") },
      { kind: "color", hex: "8a8a8a", role: "fg", at: at(2, "h") },
    ];
    // ~3.5:1 — fails as body copy, passes as large text.
    const asBody = checkComputedContrast([...base, { kind: "typography", sizePx: 16, at: at(2, "h") }], "resolved");
    expect(asBody.findings).toHaveLength(1);
    expect(asBody.findings[0]?.required).toBe(AA_NORMAL);

    const asLarge = checkComputedContrast([...base, { kind: "typography", sizePx: 32, at: at(2, "h") }], "resolved");
    expect(asLarge.findings).toEqual([]);
    expect(AA_LARGE).toBe(3);
  });

  it("REFUSES to judge text over a gradient, and says the run was partial", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 0, ref: "w", at: at(1, "w") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "w") },
      { kind: "structure", node: "p", depth: 1, ref: "p", parentRef: "w", at: at(5, "p") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(5, "p") },
      { kind: "gradient", gradientKind: "linear", stops: [{ hex: "7c3aed" }, { hex: "2563eb" }], at: at(5, "p") },
    ];
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toEqual([]);
    expect(r.notComputable[0]?.reason).toBe("background is a gradient");
  });

  it("REFUSES when no opaque background resolves", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "p", depth: 0, ref: "p", at: at(1, "p") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(1, "p") },
    ];
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toEqual([]);
    expect(r.notComputable[0]?.reason).toBe("no opaque background resolved");
  });

  it("walks PAST a translucent paint rather than blending a colour nobody wrote", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "b", at: at(1, "b") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "b") },
      { kind: "structure", node: "div", depth: 1, ref: "veil", parentRef: "b", at: at(2, "veil") },
      { kind: "color", hex: "000000", alpha: 0.1, role: "bg", at: at(2, "veil") },
      { kind: "structure", node: "p", depth: 2, ref: "p", parentRef: "veil", at: at(3, "p") },
      { kind: "color", hex: "767676", role: "fg", at: at(3, "p") },
    ];
    // Against white it is ~4.54:1 and passes. Blending the 10% veil would
    // manufacture a background the stylesheet never states.
    expect(checkComputedContrast(facts, "resolved").findings).toEqual([]);
  });

  it("is NOT-EVALUATED on a literal-tier extractor rather than computed wrongly", () => {
    const facts: DesignFact[] = [
      { kind: "color", hex: "9ca3af", role: "fg", at: { file: "v.swift", line: 1, extractor: "swiftui", confidence: "literal" } },
      { kind: "color", hex: "7c3aed", role: "bg", at: { file: "v.swift", line: 1, extractor: "swiftui", confidence: "literal" } },
    ];
    expect(checkComputedContrast(facts, "literal").findings).toEqual([]);
    expect(checkComputedContrast(facts, undefined).findings).toEqual([]);

    const swift = extractSwiftUi(
      `struct V: View { var body: some View { Text("x").foregroundColor(Color(white: 0.62)) } }`,
      "v.swift",
    );
    const r = lintTell(swift.collector.facts(), swiftui);
    expect(r.contrast).toEqual([]);
  });
});

describe("voice tells", () => {
  it("names every buzzword it found, not just that it found one", () => {
    const f = checkMarketingBuzzword([text("Supercharge your enterprise-grade workflow")]);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("supercharge");
    expect(f[0]?.message).toContain("enterprise-grade");
    expect(f[0]?.severity).toBe("advisory");
  });

  it("measures em dashes as a RATE, so length does not decide the verdict", () => {
    const dense = Array.from({ length: 8 }, (_, i) => text(`a b c — d e f g h i j k l`, i + 1));
    expect(checkEmDashOveruse(dense)).toHaveLength(1);

    // Same eight dashes spread across a long page is punctuation, not a habit.
    const sparse = Array.from({ length: 8 }, (_, i) => text(`${"word ".repeat(40)}— tail`, i + 1));
    expect(checkEmDashOveruse(sparse)).toEqual([]);
  });

  it("does not fire on a short run with one or two dashes", () => {
    expect(checkEmDashOveruse([text("A short line — with one dash")])).toEqual([]);
  });

  it("catches the theatrical intensifier and the aphoristic cadence", () => {
    expect(checkTheaterSlopPhrase([text("A stunning, jaw-dropping interface")])).toHaveLength(1);
    expect(checkAphoristicCadence([text("This is not just a tool — it's a way of thinking")])).toHaveLength(1);
  });

  it("leaves ordinary technical prose alone", () => {
    const prose = [
      text("The resolver reads Tailwind utilities and returns nothing for tokens it does not carry."),
      text("Run npm test before pushing."),
      text("Contrast is computed against the nearest opaque ancestor background."),
    ];
    expect(checkVoice(prose)).toEqual([]);
  });

  it("reads text from ANY language's facts — the same check on Swift", () => {
    const swift = extractSwiftUi(
      `struct V: View { var body: some View { Text("Supercharge your world-class workflow") } }`,
      "v.swift",
    );
    const r = lintTell(swift.collector.facts(), swiftui);
    expect(r.voice.map((f) => f.checkId)).toContain("marketing-buzzword");
  });

  it("orders deterministically", () => {
    const facts = [text("Supercharge this", 3), text("A stunning result", 1)];
    expect(JSON.stringify(checkVoice(facts))).toBe(JSON.stringify(checkVoice([...facts].reverse())));
  });
});

/**
 * Guards the first pass did not actually guard.
 *
 * Breaking the translucent skip and the ancestor walk both left the suite green:
 * the first case happened to pass against either background, and the second was
 * rescued by the document-background fallback. Neither test discriminated.
 */
describe("background resolution, pinned where it can flip", () => {
  it("does not treat a translucent veil as the background — a case where it CHANGES the verdict", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "b", at: at(1, "b") },
      { kind: "color", hex: "000000", role: "bg", at: at(1, "b") },
      { kind: "structure", node: "div", depth: 1, ref: "veil", parentRef: "b", at: at(2, "veil") },
      { kind: "color", hex: "ffffff", alpha: 0.1, role: "bg", at: at(2, "veil") },
      { kind: "structure", node: "p", depth: 2, ref: "p", parentRef: "veil", at: at(3, "p") },
      { kind: "color", hex: "7a7a7a", role: "fg", at: at(3, "p") },
    ];
    // #7a7a7a is 4.89:1 on black (passes) and 4.29:1 on white (FAILS). The two
    // paths therefore disagree, which is the only way this assertion can
    // discriminate — the first version used #767676, which passes either way and
    // stayed green with the guard deleted.
    expect(checkComputedContrast(facts, "resolved").findings).toEqual([]);
  });

  it("uses the text's OWN ancestor, not the document's first background", () => {
    const facts: DesignFact[] = [
      // First subtree paints white and is where the document fallback comes from.
      { kind: "structure", node: "header", depth: 0, ref: "hdr", at: at(1, "hdr") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "hdr") },
      // Second subtree paints purple; its text must be judged against THAT.
      { kind: "structure", node: "section", depth: 0, ref: "sec", at: at(5, "sec") },
      { kind: "color", hex: "7c3aed", role: "bg", at: at(5, "sec") },
      { kind: "structure", node: "p", depth: 1, ref: "p", parentRef: "sec", at: at(6, "p") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(6, "p") },
    ];
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toHaveLength(1);
    // 2.24 is grey-on-purple. Falling back to the document's white would give
    // 2.61 — still a failure, so only the RATIO distinguishes the two paths.
    expect(r.findings[0]?.ratio).toBeCloseTo(2.24, 2);
    expect(r.findings[0]?.message).toContain("#7c3aed");
  });
});
