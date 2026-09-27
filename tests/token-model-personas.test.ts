import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { emitCss } from "../src/core/token-emit.js";

// PR-FU3-r2 A6: the kernel must consume the persona library it ships. Real
// starting_tokens nest a category into sub-groups (font.family.body), mix a
// leaf with a group at the same level (color.accent beside color.surface),
// use $type "string" for a non-design-value leaf (elevation.shadow: "none"),
// and give fontFamily a font-stack array $value — none of that compiled
// before this PR.

const ROOT = process.cwd();
const FAMILIES_PATH = join(ROOT, "knowledge", "personas", "families.json");
const FAMILIES = JSON.parse(readFileSync(FAMILIES_PATH, "utf8")) as {
  families: Array<{ slug: string; platform: string; starting_tokens: { tokens: Record<string, unknown> } }>;
};

describe("PR-FU3-r2 A6 — five web starting_tokens compile with no error", () => {
  const web = FAMILIES.families.filter((f) => f.platform === "web");

  it("families.json has exactly five web families", () => {
    expect(web.length).toBe(5);
  });

  for (const f of web) {
    it(`compiles ${f.slug}`, () => {
      const tree = parseTokenFile(f.starting_tokens.tokens);
      const resolved = resolveTokens(tree);
      expect(resolved.length).toBeGreaterThan(0);
      const css = emitCss(resolved);
      // A fontFamily array must become ONE stack, never split -0/-1/-2.
      expect(css).not.toMatch(/--font-family-body-0:/);
    });
  }
});

describe("PR-FU3-r2 A6 — nested groups, $type: 'string', and fontFamily arrays", () => {
  it("flattens a category with a leaf beside a nested group, joining names with '-'", () => {
    const tree = parseTokenFile({
      font: {
        family: { body: { $type: "fontFamily", $value: ["Inter", "sans-serif"] } },
        "scale-ratio": { $type: "number", $value: 1.25 },
      },
      color: {
        accent: { $type: "color", $value: "#111111" },
        surface: {
          base: { $type: "color", $value: "#ffffff" },
          raised: { $type: "color", $value: "#f5f5f5" },
        },
      },
    });
    expect(tree.font?.["family-body"]?.$type).toBe("fontFamily");
    expect(tree.font?.["scale-ratio"]?.$value).toBe(1.25);
    expect(tree.color?.["accent"]?.$value).toBe("#111111");
    expect(tree.color?.["surface-base"]?.$value).toBe("#ffffff");
    expect(tree.color?.["surface-raised"]?.$value).toBe("#f5f5f5");
  });

  it("accepts $type: 'string' and passes its value through verbatim", () => {
    const tree = parseTokenFile({
      elevation: { shadow: { $type: "string", $value: "none" } },
    });
    const resolved = resolveTokens(tree);
    expect(resolved).toEqual([{ path: "elevation.shadow", type: "string", value: "none" }]);
  });

  it("emits a fontFamily array as one comma-separated CSS value, not -0/-1/-2 vars", () => {
    const tree = parseTokenFile({
      font: { family: { body: { $type: "fontFamily", $value: ["Helvetica Neue", "Arial", "sans-serif"] } } },
    });
    const css = emitCss(resolveTokens(tree));
    expect(css).toContain('--font-family-body: "Helvetica Neue", Arial, sans-serif;');
    expect(css).not.toContain("--font-family-body-0");
  });

  it("emits a shadow composite's color member as a known hex, never a raw alias-less value", () => {
    const tree = parseTokenFile({
      elevation: {
        shadow: {
          $type: "shadow",
          $value: { color: "#0000001f", offsetX: "0px", offsetY: "2px", blur: "8px", spread: "0px" },
        },
      },
    });
    const css = emitCss(resolveTokens(tree));
    expect(css).toContain("--elevation-shadow-color: #0000001f;");
  });
});
