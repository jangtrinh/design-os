/**
 * figma-ds-registry.ts — pure unit tests for buildRegistry's lifecycle-marker
 * handling (learn-from-shadcn Phase 4). shadcn convention: 🟢 = stable, 🔵/🟡 =
 * beta. Markers are read from the component's own name OR its enclosing section
 * (joined before matching, so either wins; 🟢 is checked first so it always beats
 * 🔵/🟡 regardless of position), then stripped from the stored name so aliasing /
 * reconcile keeps working against a clean name. No marker → the `status` key is
 * omitted entirely (not set to undefined) — the common case stays lean.
 */
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/core/figma-ds-registry.js";
import type { DsComponent } from "../src/core/figma-ds-registry.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const comp = (over: Partial<DsComponent> = {}): DsComponent => ({
  id: "1:1",
  name: "Button",
  type: "COMPONENT",
  ...over,
});

// ─── buildRegistry — lifecycle status markers ─────────────────────────────────

describe("buildRegistry — lifecycle status markers (P4)", () => {
  it("🟢 in the name marks the component stable and strips the marker from the name", () => {
    const reg = buildRegistry([comp({ name: "🟢 Button" })]);
    expect(reg.components[0]?.name).toBe("Button");
    expect(reg.components[0]?.status).toBe("stable");
  });

  it("🔵 in the name marks the component beta", () => {
    const reg = buildRegistry([comp({ name: "🔵 Button" })]);
    expect(reg.components[0]?.status).toBe("beta");
  });

  it("🟡 in the name also marks the component beta", () => {
    const reg = buildRegistry([comp({ name: "🟡 Button" })]);
    expect(reg.components[0]?.status).toBe("beta");
  });

  it("a marker in the section (not the name) still sets status; the name is unaffected", () => {
    const reg = buildRegistry([comp({ name: "Alert", section: "🟢 Ready" })]);
    expect(reg.components[0]?.status).toBe("stable");
    expect(reg.components[0]?.name).toBe("Alert");
  });

  it("🟢 wins over 🔵 regardless of which one sits in the name vs. the section", () => {
    const reg = buildRegistry([comp({ name: "🔵 Badge", section: "🟢 Page" })]);
    expect(reg.components[0]?.status).toBe("stable");
  });

  it("no marker anywhere → the status key is omitted entirely from the record", () => {
    const reg = buildRegistry([comp()]);
    const rec = reg.components.find((c) => c.name === "Button");
    if (rec === undefined) throw new Error("expected a Button record in the built registry");
    expect("status" in rec).toBe(false);
  });

  it("emoji-strip collapses interior whitespace and category is derived from the cleaned name", () => {
    const reg = buildRegistry([comp({ name: "Nav 🟢 / Tabs" })]);
    expect(reg.components[0]?.name).toBe("Nav / Tabs");
    expect(reg.components[0]?.category).toBe("Nav");
    expect(reg.components[0]?.status).toBe("stable");
  });

  it("records are sorted by the CLEANED name (marker stripped before sorting)", () => {
    const reg = buildRegistry([
      comp({ id: "a", name: "🟢 Zeta" }),
      comp({ id: "b", name: "Alpha" }),
    ]);
    expect(reg.components.map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("variants and description are unaffected by the marker", () => {
    const reg = buildRegistry([
      comp({ name: "🟢 Button", variantAxes: { Size: ["Small", "Large"] } }),
    ]);
    expect(reg.components[0]?.variants).toEqual(["Size=Large", "Size=Small"]);
    expect(reg.components[0]?.description).toContain("props: Size(Small,Large)");
  });
});
