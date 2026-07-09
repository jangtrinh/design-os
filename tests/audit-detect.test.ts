/**
 * C1 — `ui audit` deterministic detection core. Hard fixture tests: each of the
 * five violation families in isolation, the off-grid grid math + pill exemption,
 * spec-absence skips, section-aware recursion, and the remap table.
 */
import { describe, it, expect } from "vitest";
import {
  detectViolations,
  AUDIT_RULES,
  type AuditNode,
  type AuditRule,
} from "../src/core/audit-detect.js";
import { buildAuditSpec, normalizeHex } from "../src/core/audit-spec.js";

const TOKENS = { color: { danger: { $value: "#ff0000", $type: "color" }, brand: { $value: "#4f46e5", $type: "color" } } };
const REGISTRY = {
  version: "0.1.0",
  components: [
    { name: "Button/Primary", category: "Button" },
    { name: "Icon/Base", category: "Icon" },
    { name: "Card/Legacy", category: "Card", deprecated: true },
  ],
};

function fullSpec(gridBase?: number) {
  return buildAuditSpec({ tokens: TOKENS, registry: REGISTRY, gridBase });
}

/** Rules present in the result, in order. */
function rules(nodes: AuditNode | AuditNode[], spec = fullSpec()): AuditRule[] {
  return detectViolations(nodes, spec).violations.map((v) => v.rule);
}

describe("raw-hex-vs-token", () => {
  it("flags an unbound solid fill whose hex is a DS token, with a remap", () => {
    const r = detectViolations({ name: "Btn", type: "FRAME", fills: [{ type: "SOLID", hex: "#FF0000" }] }, fullSpec());
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatchObject({ rule: "raw-hex-vs-token", nodeName: "Btn" });
    expect(r.remap).toEqual([{ kind: "color", nodeName: "Btn", from: "#ff0000", to: "color.danger" }]);
  });
  it("does NOT flag a fill already bound to a token", () => {
    expect(rules({ name: "Btn", type: "FRAME", fills: [{ hex: "#ff0000", boundToken: "color.danger" }] })).toEqual([]);
  });
  it("does NOT flag a hex absent from the palette", () => {
    expect(rules({ name: "Btn", type: "FRAME", fills: [{ hex: "#123456" }] })).toEqual([]);
  });
  it("is skipped entirely when no token file is supplied", () => {
    const spec = buildAuditSpec({ registry: REGISTRY });
    expect(rules({ name: "Btn", type: "FRAME", fills: [{ hex: "#ff0000" }] }, spec)).toEqual([]);
  });
});

describe("detached-instance", () => {
  it("flags an explicit detached flag", () => {
    expect(rules({ name: "X", type: "INSTANCE", detached: true })).toEqual(["detached-instance"]);
  });
  it("flags a frame named like a registered component but not an INSTANCE", () => {
    expect(rules({ name: "Button/Primary", type: "FRAME" })).toEqual(["detached-instance"]);
  });
  it("does NOT flag a real INSTANCE of that component", () => {
    expect(rules({ name: "Button/Primary", type: "INSTANCE", mainComponent: "Button/Primary" })).toEqual([]);
  });
  it("is skipped when no registry is supplied", () => {
    const spec = buildAuditSpec({ tokens: TOKENS });
    expect(rules({ name: "Button/Primary", type: "FRAME" }, spec)).toEqual([]);
  });
});

describe("raw-icon-vs-Icon", () => {
  it("flags a role:icon node when an Icon component exists", () => {
    expect(rules({ name: "cart", type: "VECTOR", role: "icon" })).toEqual(["raw-icon-vs-Icon"]);
  });
  it("flags a TEXT node of private-use glyphs", () => {
    expect(rules({ name: "cart", type: "TEXT", characters: "" })).toEqual(["raw-icon-vs-Icon"]);
  });
  it("does NOT flag a TEXT node of ordinary characters", () => {
    expect(rules({ name: "label", type: "TEXT", characters: "Buy now" })).toEqual([]);
  });
  it("does NOT flag an INSTANCE even if role:icon", () => {
    expect(rules({ name: "cart", type: "INSTANCE", role: "icon", mainComponent: "Icon/Base" })).toEqual([]);
  });
  it("is skipped when the DS has no Icon component", () => {
    const spec = buildAuditSpec({ registry: { version: "1", components: [{ name: "Button/Primary", category: "Button" }] } });
    expect(rules({ name: "cart", type: "VECTOR", role: "icon" }, spec)).toEqual([]);
  });
});

describe("off-grid", () => {
  it("flags radius + spacing off the base grid with snapped remaps", () => {
    const r = detectViolations({ name: "Card", type: "FRAME", cornerRadius: 7, itemSpacing: 10, paddingTop: 8 }, fullSpec());
    expect(r.counts["off-grid"]).toBe(2); // radius 7 + itemSpacing 10; padding 8 is on-grid
    expect(r.remap).toEqual([
      { kind: "radius", nodeName: "Card", from: "7", to: "8" },
      { kind: "spacing", nodeName: "Card", from: "10", to: "12" },
    ]);
  });
  it("exempts pill/full radii (>=100)", () => {
    expect(rules({ name: "Pill", type: "FRAME", cornerRadius: 999 })).toEqual([]);
  });
  it("honours a custom --grid base", () => {
    // grid 8: radius 8 clean, itemSpacing 12 now off-grid
    const r = detectViolations({ name: "C", type: "FRAME", cornerRadius: 8, itemSpacing: 12 }, fullSpec(8));
    expect(r.counts["off-grid"]).toBe(1);
    expect(r.remap[0]).toMatchObject({ kind: "spacing", from: "12", to: "16" });
  });
  it("treats 0 as on-grid", () => {
    expect(rules({ name: "C", type: "FRAME", cornerRadius: 0, itemSpacing: 0, paddingLeft: 0 })).toEqual([]);
  });
  it("runs with no spec files at all (pure grid math)", () => {
    const spec = buildAuditSpec({});
    expect(rules({ name: "C", type: "FRAME", cornerRadius: 6 }, spec)).toEqual(["off-grid"]);
  });
});

describe("deprecated-component", () => {
  it("flags an INSTANCE of a registry-deprecated component", () => {
    expect(rules({ name: "Old", type: "INSTANCE", mainComponent: "Card/Legacy" })).toEqual(["deprecated-component"]);
  });
  it("does NOT flag an instance of a non-deprecated component", () => {
    expect(rules({ name: "OK", type: "INSTANCE", mainComponent: "Button/Primary" })).toEqual([]);
  });
});

describe("tree traversal + aggregation", () => {
  it("recurses into children (section-aware) and counts each occurrence", () => {
    const tree: AuditNode = {
      name: "Page", type: "SECTION",
      children: [
        { name: "A", type: "FRAME", cornerRadius: 7 },
        { name: "B", type: "SECTION", children: [{ name: "C", type: "FRAME", itemSpacing: 6 }] },
      ],
    };
    const r = detectViolations(tree, fullSpec());
    expect(r.counts["off-grid"]).toBe(2);
    expect(r.violations.map((v) => v.nodeName)).toEqual(["A", "C"]);
  });
  it("accepts an array root and reports total + full per-rule counts", () => {
    const r = detectViolations(
      [
        { name: "Btn", type: "FRAME", fills: [{ hex: "#ff0000" }], cornerRadius: 7 },
        { name: "Old", type: "INSTANCE", mainComponent: "Card/Legacy" },
      ],
      fullSpec(),
    );
    expect(r.total).toBe(3);
    expect(r.counts).toEqual({
      "raw-hex-vs-token": 1,
      "detached-instance": 0,
      "raw-icon-vs-Icon": 0,
      "off-grid": 1,
      "deprecated-component": 1,
    });
  });
  it("clean tree → zero violations, all counts present and zero", () => {
    const r = detectViolations({ name: "Clean", type: "FRAME", cornerRadius: 8 }, fullSpec());
    expect(r.total).toBe(0);
    for (const rule of AUDIT_RULES) expect(r.counts[rule]).toBe(0);
  });
  it("tolerates unnamed nodes", () => {
    const r = detectViolations({ type: "FRAME", cornerRadius: 3 }, fullSpec());
    expect(r.violations[0]?.nodeName).toBe("(unnamed)");
  });
});

describe("audit-spec helpers", () => {
  it("normalizeHex expands shorthand and lower-cases", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("00FF00")).toBe("#00ff00");
    expect(normalizeHex("not-a-hex")).toBeNull();
  });
  it("prefers the lexicographically-smaller path when two tokens share a hex", () => {
    const spec = buildAuditSpec({
      tokens: { color: { zeta: { $value: "#abcdef", $type: "color" }, alpha: { $value: "#abcdef", $type: "color" } } },
    });
    expect(spec.colorTokens.get("#abcdef")).toBe("color.alpha");
  });
  it("defaults gridBase to 4 and ignores non-positive overrides", () => {
    expect(buildAuditSpec({}).gridBase).toBe(4);
    expect(buildAuditSpec({ gridBase: 0 }).gridBase).toBe(4);
    expect(buildAuditSpec({ gridBase: 8 }).gridBase).toBe(8);
  });
});
