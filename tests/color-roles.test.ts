import { describe, expect, it } from "vitest";
import {
  classifyRole,
  generateSemanticPalette,
  generateScalesFromTokens,
} from "../src/core/color-roles.js";

describe("classifyRole", () => {
  it("'brand-blue' → primary", () => expect(classifyRole("brand-blue")).toBe("primary"));
  it("'main-color' → primary", () => expect(classifyRole("main-color")).toBe("primary"));
  it("'error-red' → danger",   () => expect(classifyRole("error-red")).toBe("danger"));
  it("'danger' → danger",      () => expect(classifyRole("danger")).toBe("danger"));
  it("'surface-gray' → neutral", () => expect(classifyRole("surface-gray")).toBe("neutral"));
  it("'background' → neutral",   () => expect(classifyRole("background")).toBe("neutral"));
  it("'success-green' → success", () => expect(classifyRole("success-green")).toBe("success"));
  it("'warning-amber' → warning", () => expect(classifyRole("warning-amber")).toBe("warning"));
  it("'info-blue' → info",       () => expect(classifyRole("info-blue")).toBe("info"));
  it("'accent-highlight' → accent", () => expect(classifyRole("accent-highlight")).toBe("accent"));
  it("unrecognised name → null",  () => expect(classifyRole("xyzzy")).toBeNull());
});

describe("generateSemanticPalette", () => {
  const colors = [
    { name: "brand", value: "#3b82f6" },
    { name: "brand2", value: "#2563eb" },   // second primary — should be deduped
    { name: "error", value: "#ef4444" },
  ];
  const palette = generateSemanticPalette(colors);

  it("deduplicates roles — only one primary entry", () => {
    const primaryEntries = palette.entries.filter((e) => e.role === "primary");
    expect(primaryEntries).toHaveLength(1);
  });

  it("produces entries for primary and danger", () => {
    const roles = palette.entries.map((e) => e.role);
    expect(roles).toContain("primary");
    expect(roles).toContain("danger");
  });

  it("entries are sorted in canonical role order (primary before danger)", () => {
    const roles = palette.entries.map((e) => e.role);
    expect(roles.indexOf("primary")).toBeLessThan(roles.indexOf("danger"));
  });

  it("each entry has a scale with 11 stops", () => {
    for (const entry of palette.entries) {
      expect(Object.keys(entry.scale.shades)).toHaveLength(11);
    }
  });

  it("skips non-hex values", () => {
    const result = generateSemanticPalette([
      { name: "brand", value: "rgba(0,0,255,1)" },
      { name: "error", value: "#ef4444" },
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.role).toBe("danger");
  });
});

describe("generateScalesFromTokens", () => {
  it("deduplicates identical hex values", () => {
    const scales = generateScalesFromTokens([
      { name: "blue", value: "#3b82f6" },
      { name: "blue2", value: "#3b82f6" },
    ]);
    expect(scales).toHaveLength(1);
  });

  it("skips achromatic colors", () => {
    const scales = generateScalesFromTokens([
      { name: "white", value: "#ffffff" },
      { name: "black", value: "#000000" },
    ]);
    expect(scales).toHaveLength(0);
  });

  it("skips non-hex values", () => {
    const scales = generateScalesFromTokens([
      { name: "c", value: "rgba(0,0,0,1)" },
    ]);
    expect(scales).toHaveLength(0);
  });

  it("sets baseName from token name", () => {
    const scales = generateScalesFromTokens([
      { name: "brand-blue", value: "#3b82f6" },
    ]);
    expect(scales[0]?.baseName).toBe("brand-blue");
  });
});
