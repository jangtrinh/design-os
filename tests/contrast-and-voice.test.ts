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

describe("one decision is reported once", () => {
  // Collapsing lives in lintTell, not in this family: one declaration painting
  // many elements is a blind spot every rule shares, so it is fixed once.
  it("collapses a colour pair that paints many elements, keeping the count", () => {
    // Measured on a real scraped page: 210 identical "#62666d on #08090a" lines
    // for ONE declared pair. Accurate output nobody scrolls past is not output.
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "b", at: at(1, "b") },
      { kind: "color", hex: "08090a", role: "bg", at: at(1, "b") },
    ];
    for (let i = 0; i < 12; i++) {
      facts.push({ kind: "structure", node: "span", depth: 1, ref: `s${i}`, parentRef: "b", at: at(2 + i, `s${i}`) });
      facts.push({ kind: "color", hex: "62666d", role: "fg", at: at(2 + i, `s${i}`) });
    }
    const r = lintTell(facts, html);
    expect(r.contrast).toHaveLength(1);
    expect(r.contrast[0]?.message).toContain("12 elements");
    expect(r.contrast[0]?.ratio).toBeCloseTo(3.45, 1);
  });

  it("leaves a single occurrence unchanged — no count noise on one element", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "b", at: at(1, "b") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "b") },
      { kind: "structure", node: "p", depth: 1, ref: "p", parentRef: "b", at: at(2, "p") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(2, "p") },
    ];
    const r = lintTell(facts, html);
    expect(r.contrast).toHaveLength(1);
    expect(r.contrast[0]?.message).not.toContain("elements, first at");
  });

  it("keeps DIFFERENT pairs apart", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "b", at: at(1, "b") },
      { kind: "color", hex: "ffffff", role: "bg", at: at(1, "b") },
      { kind: "structure", node: "p", depth: 1, ref: "p1", parentRef: "b", at: at(2, "p1") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(2, "p1") },
      { kind: "structure", node: "p", depth: 1, ref: "p2", parentRef: "b", at: at(3, "p2") },
      { kind: "color", hex: "b0b0b0", role: "fg", at: at(3, "p2") },
    ];
    expect(lintTell(facts, html).contrast).toHaveLength(2);
  });
});

describe("a background a media element paints over is not knowable", () => {
  const mediaCase = (mediaTag: string): DesignFact[] => [
    { kind: "structure", node: "div", depth: 0, ref: "shell", at: at(1, "shell") },
    { kind: "color", hex: "fdfdfd", role: "bg", at: at(1, "shell") },
    { kind: "structure", node: mediaTag, depth: 1, ref: "media", parentRef: "shell", at: at(2, "media") },
    { kind: "structure", node: "button", depth: 1, ref: "btn", parentRef: "shell", at: at(3, "btn") },
    { kind: "color", hex: "ffffff", role: "fg", at: at(3, "btn") },
  ];

  it("REFUSES rather than reporting white-on-near-white for player controls", () => {
    // Found on a real site: <div style="background-color:#FDFDFD"><video …>
    // with white controls over it. The cascade says the background is #FDFDFD,
    // so the check reported 1.02:1 — a ratio for a surface nobody ever sees.
    const r = checkComputedContrast(mediaCase("video"), "resolved");
    expect(r.findings).toEqual([]);
    expect(r.notComputable[0]?.reason).toBe("a media element paints over the background");
  });

  it("refuses for every media element that can cover a surface", () => {
    for (const tag of ["video", "img", "canvas", "svg", "picture", "iframe"]) {
      const r = checkComputedContrast(mediaCase(tag), "resolved");
      expect(r.findings, tag).toEqual([]);
    }
  });

  it("still judges a surface with no media in it", () => {
    const plain: DesignFact[] = [
      { kind: "structure", node: "div", depth: 0, ref: "shell", at: at(1, "shell") },
      { kind: "color", hex: "fdfdfd", role: "bg", at: at(1, "shell") },
      { kind: "structure", node: "button", depth: 1, ref: "btn", parentRef: "shell", at: at(3, "btn") },
      { kind: "color", hex: "ffffff", role: "fg", at: at(3, "btn") },
    ];
    const r = checkComputedContrast(plain, "resolved");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.ratio).toBeCloseTo(1.02, 2);
  });

  it("does not refuse when the media is in an UNRELATED subtree", () => {
    const elsewhere: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "body", at: at(1, "body") },
      { kind: "structure", node: "figure", depth: 1, ref: "fig", parentRef: "body", at: at(2, "fig") },
      { kind: "structure", node: "video", depth: 2, ref: "vid", parentRef: "fig", at: at(3, "vid") },
      { kind: "structure", node: "section", depth: 1, ref: "sec", parentRef: "body", at: at(9, "sec") },
      { kind: "color", hex: "7c3aed", role: "bg", at: at(9, "sec") },
      { kind: "structure", node: "p", depth: 2, ref: "p", parentRef: "sec", at: at(10, "p") },
      { kind: "color", hex: "9ca3af", role: "fg", at: at(10, "p") },
    ];
    // The video sits under <figure>, not under <section>; the section's own
    // background is still knowable. Refusing here would silence the check on any
    // page that contains an image anywhere.
    const r = checkComputedContrast(elsewhere, "resolved");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.ratio).toBeCloseTo(2.24, 2);
  });
});

describe("the page background comes from the root, never from a guess", () => {
  it("does NOT adopt an arbitrary element's background as the page background", () => {
    // The old fallback took "the first opaque background encountered". On a real
    // page that was a <div style="background-color:#FDFDFD"> holding a video
    // poster, so unrelated text was judged against a video placeholder and
    // reported white-on-near-white at 1.02:1 for a surface nobody sees.
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "body", at: at(1, "body") },
      { kind: "structure", node: "div", depth: 1, ref: "poster", parentRef: "body", at: at(2, "poster") },
      { kind: "color", hex: "fdfdfd", role: "bg", at: at(2, "poster") },
      { kind: "structure", node: "p", depth: 1, ref: "p", parentRef: "body", at: at(9, "p") },
      { kind: "color", hex: "ffffff", role: "fg", at: at(9, "p") },
    ];
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toEqual([]);
    expect(r.notComputable[0]?.reason).toBe("no opaque background resolved");
  });

  it("DOES use a background painted on body", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "body", at: at(1, "body") },
      { kind: "color", hex: "101010", role: "bg", at: at(1, "body") },
      { kind: "structure", node: "code", depth: 2, ref: "code", parentRef: "body", at: at(9, "code") },
      { kind: "color", hex: "3178c6", role: "fg", at: at(9, "code") },
    ];
    // Syntax highlighting on a dark page: 4.2:1, marginally under AA. A real
    // finding on a real site, and it must survive both guards above.
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.ratio).toBeCloseTo(4.2, 1);
  });

  it("an icon somewhere on the page does not silence the whole page", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "body", at: at(1, "body") },
      { kind: "color", hex: "101010", role: "bg", at: at(1, "body") },
      { kind: "structure", node: "button", depth: 1, ref: "btn", parentRef: "body", at: at(2, "btn") },
      { kind: "structure", node: "svg", depth: 2, ref: "icon", parentRef: "btn", at: at(3, "icon") },
      { kind: "structure", node: "code", depth: 1, ref: "code", parentRef: "body", at: at(9, "code") },
      { kind: "color", hex: "3178c6", role: "fg", at: at(9, "code") },
    ];
    // Marking the icon's whole ancestor chain silenced 271 pairs on one site.
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toHaveLength(1);
  });
});

describe("the root fallback, where it actually matters", () => {
  it("uses body's background for text whose ancestor chain is broken", () => {
    // An extractor that supplies structure only heuristically may not emit a
    // parentRef chain reaching the root. The walk then finds nothing, and the
    // root fallback is the only thing standing between a real finding and a
    // NOT COMPUTABLE. Every earlier test had a complete chain, so removing root
    // detection left them all green.
    const facts: DesignFact[] = [
      { kind: "structure", node: "body", depth: 0, ref: "body", at: at(1, "body") },
      { kind: "color", hex: "101010", role: "bg", at: at(1, "body") },
      // No parentRef: this node is floating.
      { kind: "structure", node: "code", depth: 3, ref: "orphan", at: at(9, "orphan") },
      { kind: "color", hex: "3178c6", role: "fg", at: at(9, "orphan") },
    ];
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.message).toContain("#101010");
  });

  it("refuses for a floating node when NO root background exists", () => {
    const facts: DesignFact[] = [
      { kind: "structure", node: "div", depth: 1, ref: "poster", at: at(2, "poster") },
      { kind: "color", hex: "fdfdfd", role: "bg", at: at(2, "poster") },
      { kind: "structure", node: "code", depth: 3, ref: "orphan", at: at(9, "orphan") },
      { kind: "color", hex: "ffffff", role: "fg", at: at(9, "orphan") },
    ];
    const r = checkComputedContrast(facts, "resolved");
    expect(r.findings).toEqual([]);
    expect(r.notComputable[0]?.reason).toBe("no opaque background resolved");
  });
});
