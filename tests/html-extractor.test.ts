/**
 * Phase 02's paired test: the resolved cascade.
 *
 * The bar is the one impeccable already cleared on the same fixture. Its
 * detector reported `low-contrast 2.2:1 — #9ca3af on #7c3aed` from static
 * analysis, WITH `var(--brand)` resolved. If this extractor cannot hand a rule
 * those two colours off `tests/fixtures/tell-cascade-probe.html`, the engine is
 * not finished — so the assertions are written against that file, not a fixture
 * invented to pass.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { parseHtml } from "../src/core/extractors/html/html-dom.js";
import { buildCascade, specificityOf } from "../src/core/extractors/html/css-cascade.js";
import { resolveVars } from "../src/core/extractors/html/css-custom-properties.js";
import { parseColor, parseLengthPx, parseGradient, parseShadow, splitTopLevel } from "../src/core/extractors/html/css-values.js";
import type { DesignFact, FactKind } from "../src/core/design-facts/index.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROBE = join(ROOT, "tests", "fixtures", "tell-cascade-probe.html");

const of = <K extends FactKind>(facts: readonly DesignFact[], kind: K) =>
  facts.filter((f): f is Extract<DesignFact, { kind: K }> => f.kind === kind);

describe("css value parsers", () => {
  it("parses every colour form without guessing at the unknown ones", () => {
    expect(parseColor("#7C3AED")).toEqual({ hex: "7c3aed" });
    expect(parseColor("#abc")).toEqual({ hex: "aabbcc" });
    expect(parseColor("rgb(156, 163, 175)")).toEqual({ hex: "9ca3af" });
    expect(parseColor("rgba(0,0,0,.2)")).toEqual({ hex: "000000", alpha: 0.2 });
    expect(parseColor("#00000080")?.alpha).toBeCloseTo(0.5, 2);
    expect(parseColor("color-mix(in srgb, red, blue)")).toBeUndefined();
    expect(parseColor("var(--brand)")).toBeUndefined();
  });

  it("converts lengths but refuses units it cannot resolve statically", () => {
    expect(parseLengthPx("16px")).toBe(16);
    expect(parseLengthPx("1rem")).toBe(16);
    expect(parseLengthPx("0")).toBe(0);
    expect(parseLengthPx("50%")).toBeUndefined();
    expect(parseLengthPx("100vw")).toBeUndefined();
  });

  it("splits on top-level separators only — commas inside rgba() are not separators", () => {
    expect(splitTopLevel("rgba(0, 0, 0, .2) 0 2px", " ")).toEqual(["rgba(0, 0, 0, .2)", "0", "2px"]);
    expect(splitTopLevel("linear-gradient(a, b), red", ",")).toEqual(["linear-gradient(a, b)", "red"]);
  });

  it("reads gradient stops and angle", () => {
    const g = parseGradient("linear-gradient(135deg, #7c3aed, #2563eb)");
    expect(g).toMatchObject({ kind: "linear", angleDeg: 135 });
    expect(g?.stops.map((s) => s.hex)).toEqual(["7c3aed", "2563eb"]);
  });

  it("reads a shadow's geometry and colour", () => {
    expect(parseShadow("0 2px 8px rgba(0,0,0,.2)")).toMatchObject({
      offsetXPx: 0, offsetYPx: 2, blurPx: 8, hex: "000000", alpha: 0.2,
    });
    expect(parseShadow("none")).toBeUndefined();
  });
});

describe("cascade", () => {
  it("orders by specificity, then by document position", () => {
    expect(specificityOf("#id")).toBeGreaterThan(specificityOf(".cls"));
    expect(specificityOf(".cls")).toBeGreaterThan(specificityOf("div"));
    expect(specificityOf("div.cls")).toBeGreaterThan(specificityOf("div"));

    const html = `<html><head><style>
      p { color: #111111 }
      .a { color: #222222 }
      p { color: #333333 }
    </style></head><body><p class="a">x</p></body></html>`;
    const parsed = parseHtml(html);
    const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
    const p = [...cascade.byElement.keys()].find((e) => e.tagName === "p");
    // .a (class, 100) beats both p rules (type, 1) regardless of their order.
    expect(cascade.byElement.get(p!)?.get("color")?.value).toBe("#222222");
  });

  it("lets a later rule of equal specificity win", () => {
    const html = `<html><head><style>p{color:#111}p{color:#333}</style></head><body><p>x</p></body></html>`;
    const parsed = parseHtml(html);
    const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
    const p = [...cascade.byElement.keys()].find((e) => e.tagName === "p");
    expect(cascade.byElement.get(p!)?.get("color")?.value).toBe("#333");
  });

  it("keeps @media rules OUT of the unconditional cascade", () => {
    const html = `<html><head><style>
      p { font-size: 18px }
      @media (max-width: 480px) { p { font-size: 12px } }
    </style></head><body><p>x</p></body></html>`;
    const parsed = parseHtml(html);
    const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
    const p = [...cascade.byElement.keys()].find((e) => e.tagName === "p");
    expect(cascade.byElement.get(p!)?.get("font-size")?.value).toBe("18px");
    expect(cascade.mediaConditions).toContain("(max-width:480px)");
  });

  it("lets inline style outrank a stylesheet rule", () => {
    const html = `<html><head><style>#x{color:#111}</style></head><body><p id="x" style="color:#999">y</p></body></html>`;
    const parsed = parseHtml(html);
    const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
    const p = [...cascade.byElement.keys()].find((e) => e.tagName === "p");
    expect(cascade.byElement.get(p!)?.get("color")?.value).toBe("#999");
  });
});

describe("custom properties", () => {
  const style = (pairs: Record<string, string>) =>
    new Map(Object.entries(pairs).map(([k, v]) => [k, { value: v, line: 1, specificity: 0, important: false }]));

  it("resolves a var against :root", () => {
    const root = style({ "--brand": "#7c3aed" });
    expect(resolveVars("var(--brand)", null, new Map(), root).value).toBe("#7c3aed");
  });

  it("uses the fallback when the name is undeclared", () => {
    expect(resolveVars("var(--nope, #123456)", null, new Map(), undefined).value).toBe("#123456");
  });

  it("returns UNRESOLVED rather than a guess when there is no fallback", () => {
    const r = resolveVars("var(--nope)", null, new Map(), undefined);
    expect(r.value).toBeUndefined();
    expect(r.unresolved).toEqual(["--nope"]);
  });

  it("names the cycled variable rather than merely running out of depth", () => {
    // A weaker assertion here passes even with the cycle guard deleted, because
    // MAX_DEPTH also terminates. The guard is only proven by the REASON given.
    const root = style({ "--a": "var(--b)", "--b": "var(--a)" });
    const r = resolveVars("var(--a)", null, new Map(), root);
    expect(r.value).toBeUndefined();
    expect(r.unresolved).toEqual(["--a"]);
    expect(r.unresolved.join()).not.toContain("deeper than");
  });
});

describe("html extractor on the real probe fixture", () => {
  const html = readFileSync(PROBE, "utf8");
  const result = extractHtml(html, PROBE);
  const facts = result.collector.facts();

  it("is not degraded and emits every fact kind the tells need", () => {
    expect(result.degraded).toBe(false);
    const kinds = [...result.collector.kindsPresent()].sort();
    for (const need of ["border", "color", "gradient", "radius", "spacing", "structure", "text", "typography"])
      expect(kinds).toContain(need);
  });

  it("hands a rule the exact contrast pair impeccable found on this file", () => {
    // .muted { color:#9ca3af; background:#7c3aed } — the 2.2:1 pair.
    const fg = of(facts, "color").find((f) => f.role === "fg" && f.hex === "9ca3af");
    const bg = of(facts, "color").find((f) => f.role === "bg" && f.hex === "7c3aed");
    expect(fg, "foreground #9ca3af").toBeDefined();
    expect(bg, "background #7c3aed").toBeDefined();
  });

  it("resolves a custom property end-to-end, on the fixture that uses one", () => {
    // tell-cascade-rendered-probe.html declares --brand and paints .muted with var(--brand);
    // the CDP probe proved a real engine resolves it, so the static path must too.
    const rendered = readFileSync(join(dirname(PROBE), "tell-cascade-rendered-probe.html"), "utf8");
    const r = extractHtml(rendered, "rendered-probe.html");
    const bg = of(r.collector.facts(), "color").find((f) => f.role === "bg" && f.hex === "7c3aed");
    expect(bg, "background resolved through var(--brand)").toBeDefined();
  });

  it("expands the padding shorthand — the form real stylesheets are written in", () => {
    const pads = of(facts, "spacing").filter((f) => f.prop.startsWith("padding-"));
    expect(pads.length).toBeGreaterThanOrEqual(4);
    expect(pads.every((p) => p.px === 4)).toBe(true);
  });

  it("sees the one-sided border that makes `side-tab` expressible", () => {
    const oneSided = of(facts, "border").find((f) => f.sides.length === 1);
    expect(oneSided).toMatchObject({ sides: ["left"], widthPx: 4 });
  });

  it("emits the FACTS that prove nesting — the role itself is derived downstream", () => {
    // Roles moved out of the extractor: name matching read `card-title` as a
    // card and read a Tailwind surface as nothing. The extractor's job is now
    // the parent chain and the surface facts; `tests/role-synthesis.test.ts`
    // owns whether those add up to a card.
    const structures = of(facts, "structure");
    const withParent = structures.filter((f) => f.parentRef !== undefined);
    expect(withParent.length).toBeGreaterThan(0);
    // The chain is a real path: a child's ref extends its parent's.
    for (const s of withParent.slice(0, 20)) expect(s.ref.startsWith(`${s.parentRef} > `)).toBe(true);
    // And the surface facts a card is proved from are present and located.
    expect(of(facts, "border").length).toBeGreaterThan(0);
    expect(of(facts, "radius").length).toBeGreaterThan(0);
    for (const b of of(facts, "border")) expect(b.at.nodeRef).toBeDefined();
  });

  it("reads the AI-tell gradient and the overused font", () => {
    expect(of(facts, "gradient").some((g) => g.stops.some((s) => s.hex === "7c3aed"))).toBe(true);
    expect(of(facts, "typography").some((t) => t.family === "Inter")).toBe(true);
  });

  it("reports the REAL source line, not a placeholder", () => {
    // probe.html line 8 is `.muted{color:#9ca3af;background:#7c3aed}`. Asserting
    // only `line > 0` passes even with source offsets switched off, because
    // everything then collapses to line 1 — which is > 0.
    const mutedFg = of(facts, "color").find((f) => f.role === "fg" && f.hex === "9ca3af");
    expect(mutedFg?.at.line).toBe(8);
    const bodyFont = of(facts, "typography").find((t) => t.family === "Inter");
    expect(bodyFont?.at.line).toBe(3);
    const lines = new Set(facts.map((f) => f.at.line));
    expect(lines.size).toBeGreaterThan(3);
  });

  it("stamps every fact with this extractor's id and confidence", () => {
    for (const f of facts) {
      expect(f.at.extractor).toBe("html-cascade");
      expect(f.at.confidence).toBe("resolved");
    }
  });
});

describe("degrade and say so", () => {
  it("declares a remote stylesheet unresolved instead of pretending it read it", () => {
    const html = `<html><head><link rel="stylesheet" href="https://cdn.example/x.css"></head><body><p>y</p></body></html>`;
    const r = extractHtml(html, "x.html");
    expect(r.unresolvedSheets).toEqual(["https://cdn.example/x.css"]);
  });

  it("counts an unresolvable var rather than inventing a value", () => {
    const html = `<html><head><style>p{color:var(--missing)}</style></head><body><p>y</p></body></html>`;
    const r = extractHtml(html, "x.html");
    expect(r.collector.unresolvedCount).toBeGreaterThan(0);
    expect(of(r.collector.facts(), "color")).toHaveLength(0);
  });
});
