import { describe, expect, it } from "vitest";

import { expandPersona, ExpandError } from "../src/core/persona-expand.js";
import { loadPersonaIndex, findPersona } from "../src/core/persona-loader.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { parseTokenFile } from "../src/core/token-model.js";

const PERSONAS_PATH = new URL(
  "../knowledge/personas/personas.json",
  import.meta.url,
).pathname;

function liquidGlass() {
  const records = loadPersonaIndex(PERSONAS_PATH);
  return findPersona(records, "liquid-glass");
}

// ─── Token skeleton structure ─────────────────────────────────────────────────

describe("expandPersona — token skeleton", () => {
  it("produces a token count in the expected range (≥ 95)", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    let count = 0;
    for (const group of Object.values(tokens)) {
      count += Object.keys(group).length;
    }
    expect(count).toBeGreaterThanOrEqual(95);
  });

  it("produces 11 color stops for the primary palette", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(Object.keys(tokens["primary"] ?? {})).toHaveLength(11);
  });

  it("produces all 6 color palettes", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    for (const cat of ["primary", "neutral", "success", "warning", "danger", "info"]) {
      expect(Object.keys(tokens[cat] ?? {})).toHaveLength(11);
    }
  });

  it("produces paired semantic color aliases ({role}/{role}-foreground)", () => {
    const persona = liquidGlass(); // colorMode "both" → light-mode defaults
    const { tokens } = expandPersona({ persona, intent: "test" });
    const color = tokens["color"] ?? {};
    // Brand + surfaces
    expect(color["primary"]?.$value).toBe("{primary.500}");
    expect(color["primary-hover"]?.$value).toBe("{primary.600}");
    expect(color["background"]?.$value).toBe("{neutral.50}");
    expect(color["foreground"]?.$value).toBe("{neutral.900}");
    expect(color["card"]?.$value).toBe("{neutral.100}");
    expect(color["muted"]?.$value).toBe("{neutral.200}");
    // Every foreground is present and aliases a primitive (two-tier); on-color
    // foregrounds resolve through the pure-white/black base primitives.
    expect(color["primary-foreground"]?.$value).toMatch(/^\{base\.(white|black)\}$/);
    expect(color["card-foreground"]?.$value).toMatch(/^\{neutral\.\d+\}$/);
    expect(color["muted-foreground"]?.$value).toMatch(/^\{neutral\.\d+\}$/);
    for (const role of ["danger", "success", "info", "warning"]) {
      expect(color[`${role}-foreground`]?.$value, `${role}-foreground`).toMatch(/^\{base\.(white|black)\}$/);
    }
    // The pre-standard names are gone (dogfood finding L7).
    for (const old of ["text-body", "text-muted", "text-on-primary", "surface", "surface-raised"]) {
      expect(color[old], `stale name ${old}`).toBeUndefined();
    }
  });

  it("exposes pure white/black base primitives (the on-color foreground anchors)", () => {
    const { tokens } = expandPersona({ persona: liquidGlass(), intent: "test" });
    expect(tokens["base"]?.["white"]?.$value).toBe("#FFFFFF");
    expect(tokens["base"]?.["black"]?.$value).toBe("#000000");
  });

  it("dark-only persona swaps background and foreground to dark-appropriate values", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    const darkPersona = findPersona(records, "velvet-noir"); // colorMode: dark
    const { tokens } = expandPersona({ persona: darkPersona, intent: "test" });
    expect(tokens["color"]?.["background"]?.$value).toBe("{neutral.900}");
    expect(tokens["color"]?.["foreground"]?.$value).toBe("{neutral.50}");
    expect(tokens["color"]?.["card"]?.$value).toBe("{neutral.800}");
  });

  it("produces spacing ladder with 11 steps", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    const spaceKeys = Object.keys(tokens["space"] ?? {}).filter((k) => !isNaN(Number(k)));
    expect(spaceKeys).toHaveLength(11);
  });

  it("produces 8 font-size stops", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(Object.keys(tokens["font-size"] ?? {})).toHaveLength(8);
  });

  it("the full token graph resolves without errors", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(() => {
      parseTokenFile(tokens as unknown);
      resolveTokens(tokens);
    }).not.toThrow();
  });

  it("registry is always empty after expand", () => {
    const persona = liquidGlass();
    const { registry } = expandPersona({ persona, intent: "test" });
    expect(registry.components).toHaveLength(0);
  });
});

// ─── brandHex override ────────────────────────────────────────────────────────

describe("expandPersona — brandHex override", () => {
  it("overrides the primary palette when --brand-hex is supplied", () => {
    const persona = liquidGlass();
    const { tokens: withOverride } = expandPersona({
      persona,
      intent: "test",
      brandHex: "#FF0066",
    });
    const { tokens: withDefault } = expandPersona({ persona, intent: "test" });
    // The 500-stop hex will differ because the palette is generated from a different base
    expect(withOverride["primary"]?.["500"]?.$value).not.toBe(
      withDefault["primary"]?.["500"]?.$value,
    );
  });

  it("throws BAD_BRAND_HEX for an invalid hex", () => {
    const persona = liquidGlass();
    expect(() =>
      expandPersona({ persona, intent: "test", brandHex: "#GGG" }),
    ).toThrow(ExpandError);
    try {
      expandPersona({ persona, intent: "test", brandHex: "#1" });
    } catch (e) {
      expect(e instanceof ExpandError && e.code).toBe("BAD_BRAND_HEX");
    }
  });
});

// ─── Shadow tinting (regression: no pure-black shadows) ───────────────────────

describe("expandPersona — shadows are tinted, never pure black", () => {
  it("no persona emits a pure-black (#000000) shadow color", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    for (const persona of records) {
      const { tokens } = expandPersona({ persona, intent: "test" });
      const shadow = tokens["shadow"] as unknown as Record<string, { $value: { color: string } }>;
      for (const step of ["sm", "md", "lg"]) {
        const color = shadow[step]?.$value.color.toLowerCase();
        // Rubric: "tinted toward the background hue, not pure black."
        // taste-lint flags #000/#000000 — the engine must not emit them.
        expect(color, `${persona.slug} shadow.${step}`).not.toBe("#000000");
        expect(color, `${persona.slug} shadow.${step}`).not.toBe("#000");
      }
    }
  });

  it("derives shadow hue from the persona neutral (deterministic)", () => {
    const persona = liquidGlass();
    const a = expandPersona({ persona, intent: "x" }).tokens["shadow"] as unknown as Record<string, { $value: { color: string } }>;
    const b = expandPersona({ persona, intent: "x" }).tokens["shadow"] as unknown as Record<string, { $value: { color: string } }>;
    expect(a["md"]?.$value.color).toBe(b["md"]?.$value.color); // same in → same out
    expect(a["md"]?.$value.color).toMatch(/^#[0-9a-fA-F]{6}$/);  // schema-valid hex
  });
});
