import { describe, expect, it } from "vitest";
import { recognizeRoles } from "../src/core/role-recognition.js";
import type { TokenTree } from "../src/core/token-model.js";

function tree(color: Record<string, { $value: string; $extensions?: Record<string, unknown> }>): TokenTree {
  const group: Record<string, { $value: string; $type: "color"; $extensions?: Record<string, unknown> }> = {};
  for (const [name, t] of Object.entries(color)) {
    group[name] = { $value: t.$value, $type: "color", ...(t.$extensions ? { $extensions: t.$extensions } : {}) };
  }
  return { color: group };
}

/** Like `tree`, but each leaf carries an explicit `$type` — for fix 3b (color-type scoping). */
function treeTyped(
  category: string,
  leaves: Record<string, { $value: string; $type: "color" | "dimension" | "fontFamily" | "fontWeight" | "number" }>,
): TokenTree {
  return { [category]: leaves };
}

describe("recognizeRoles — Phase 1 contract", () => {
  it("a hue-scale name gets no role, literal or alias (blue-100, color-blue-100)", () => {
    const result = recognizeRoles(
      tree({ "blue-100": { $value: "#DBEAFE" }, "color-blue-100": { $value: "{color.blue-100}" } }),
    );
    expect(result.annotated.color?.["blue-100"]?.$extensions).toBeUndefined();
    expect(result.annotated.color?.["color-blue-100"]?.$extensions).toBeUndefined();
    expect(result.recognized).toBe(0);
    expect(result.unrecognized).toEqual(["color.blue-100", "color.color-blue-100"]);
  });

  it("recognizes by NAME regardless of $value shape — a literal-valued semantic token still gets its role (coordinator fix 1)", () => {
    const result = recognizeRoles(tree({ "badge-danger-text": { $value: "#FFFFFF" } }));
    expect(result.annotated.color?.["badge-danger-text"]?.$extensions).toEqual({
      "design-os.role": "destructive",
      "design-os.role-position": "fg",
    });
    expect(result.recognized).toBe(1);
  });

  it("a semantic token is annotated with its family role (surface-content → background)", () => {
    const result = recognizeRoles(tree({ "surface-content": { $value: "{color.gray-25}" } }));
    expect(result.annotated.color?.["surface-content"]?.$extensions).toEqual({
      "design-os.role": "background",
    });
    expect(result.recognized).toBe(1);
  });

  it("a compound token carries family and position (badge-danger-bg → destructive+bg)", () => {
    const result = recognizeRoles(tree({ "badge-danger-bg": { $value: "{color.error-700}" } }));
    expect(result.annotated.color?.["badge-danger-bg"]?.$extensions).toEqual({
      "design-os.role": "destructive",
      "design-os.role-position": "bg",
    });
  });

  it("an unrecognized semantic is listed, not forced (made-up zorp-glimble alias)", () => {
    const result = recognizeRoles(tree({ "zorp-glimble": { $value: "{color.gray-500}" } }));
    expect(result.annotated.color?.["zorp-glimble"]?.$extensions).toBeUndefined();
    expect(result.unrecognized).toEqual(["color.zorp-glimble"]);
    expect(result.recognized).toBe(0);
  });

  it("names and values are byte-identical after recognition (lossless)", () => {
    const input = tree({
      "blue-100": { $value: "#DBEAFE" },
      "badge-danger-bg": { $value: "{color.error-700}" },
      "zorp-glimble": { $value: "{color.gray-500}" },
    });
    const result = recognizeRoles(input);
    const inNames = Object.keys(input.color ?? {}).sort();
    const outNames = Object.keys(result.annotated.color ?? {}).sort();
    expect(outNames).toEqual(inNames);
    for (const name of inNames) {
      expect(result.annotated.color?.[name]?.$value).toBe(input.color?.[name]?.$value);
    }
  });

  it("is idempotent on a shadcn-native name (background → background)", () => {
    const result = recognizeRoles(tree({ background: { $value: "{color.white}" } }));
    expect(result.annotated.color?.["background"]?.$extensions).toEqual({ "design-os.role": "background" });
  });

  it("preserves existing $extensions (mode.*) — merges, never overwrites", () => {
    const result = recognizeRoles(
      tree({
        "badge-light-border": {
          $value: "{color.gray-300}",
          $extensions: { "mode.dark": { $value: "{color.gray-600}" } },
        },
      }),
    );
    expect(result.annotated.color?.["badge-light-border"]?.$extensions).toEqual({
      "mode.dark": { $value: "{color.gray-600}" },
      "design-os.role": "border",
    });
  });

  it("the SCRIM TRAP: overlay/scrim never auto-maps to popover or any family", () => {
    const result = recognizeRoles(tree({ "surface-overlay": { $value: "{color.gray-950}" } }));
    expect(result.annotated.color?.["surface-overlay"]?.$extensions).toBeUndefined();
    expect(result.unrecognized).toEqual(["color.surface-overlay"]);
  });

  it("focus overrides border → ring (dictionary consequence #4: border-focus is a focus ring)", () => {
    const result = recognizeRoles(tree({ "border-focus": { $value: "{color.blue-500}" } }));
    expect(result.annotated.color?.["border-focus"]?.$extensions).toEqual({ "design-os.role": "ring" });
  });

  it("a domain-prefixed bare -bg/-border with no family keyword stays unrecognized (citation-bg, the dictionary's own cited example)", () => {
    const result = recognizeRoles(tree({ "citation-bg": { $value: "{color.surface-content-hover}" } }));
    expect(result.annotated.color?.["citation-bg"]?.$extensions).toBeUndefined();
    expect(result.unrecognized).toEqual(["color.citation-bg"]);
  });

  it("gaps = canonical roles with zero recognized tokens", () => {
    const result = recognizeRoles(tree({ "badge-danger-bg": { $value: "{color.error-700}" } }));
    expect(result.gaps).toContain("card");
    expect(result.gaps).toContain("popover");
    expect(result.gaps).not.toContain("destructive");
  });

  // ─── FIX 2: leading-prefix priority (coordinator correction) ─────────────────

  it("a leading surface-/bg- prefix wins background regardless of what follows (surface-content, surface-chrome)", () => {
    const result = recognizeRoles(
      tree({
        "surface-content": { $value: "{color.gray-25}" },
        "surface-chrome": { $value: "{color.gray-900}" },
        "bg-danger": { $value: "{color.error-700}" },
      }),
    );
    expect(result.annotated.color?.["surface-content"]?.$extensions).toEqual({ "design-os.role": "background" });
    expect(result.annotated.color?.["surface-chrome"]?.$extensions).toEqual({ "design-os.role": "background" });
    expect(result.annotated.color?.["bg-danger"]?.$extensions).toEqual({ "design-os.role": "background" });
  });

  it("a leading text-/fg-/on- prefix wins foreground regardless of what follows (text-primary, Material's on-surface)", () => {
    const result = recognizeRoles(
      tree({
        "text-primary": { $value: "{color.brand-600}" },
        "on-surface": { $value: "{color.gray-950}" },
        "fg-danger": { $value: "{color.error-700}" },
      }),
    );
    expect(result.annotated.color?.["text-primary"]?.$extensions).toEqual({ "design-os.role": "foreground" });
    expect(result.annotated.color?.["on-surface"]?.$extensions).toEqual({ "design-os.role": "foreground" });
    expect(result.annotated.color?.["fg-danger"]?.$extensions).toEqual({ "design-os.role": "foreground" });
  });

  it("the leading-prefix rule does not fire mid-name — badge-danger-bg still gets destructive+bg, not background", () => {
    const result = recognizeRoles(tree({ "badge-danger-bg": { $value: "{color.error-700}" } }));
    expect(result.annotated.color?.["badge-danger-bg"]?.$extensions).toEqual({
      "design-os.role": "destructive",
      "design-os.role-position": "bg",
    });
  });

  // ─── FIX 2: genuine ties are flagged ambiguous, never guessed ────────────────

  it("a genuine tie between two self-named families lands in `ambiguous`, not a guessed role (border-success)", () => {
    const result = recognizeRoles(tree({ "border-success": { $value: "{color.success-500}" } }));
    expect(result.annotated.color?.["border-success"]?.$extensions).toBeUndefined();
    expect(result.ambiguous).toEqual(["color.border-success"]);
    expect(result.unrecognized).toEqual([]);
    expect(result.recognized).toBe(0);
  });

  it("an unambiguous weight difference still resolves cleanly, not ambiguous (border-error: border self-name beats error synonym)", () => {
    const result = recognizeRoles(tree({ "border-error": { $value: "{color.error-500}" } }));
    expect(result.annotated.color?.["border-error"]?.$extensions).toEqual({ "design-os.role": "border" });
    expect(result.ambiguous).toEqual([]);
  });

  // ─── FIX 3: a numbered SCALE STEP is not a role, even when the word matches one ──

  it("a {word}-{lightness} leaf is a scale step, not a role, even when the word is a role synonym (color-brand-500, brand-25, accent-600)", () => {
    const result = recognizeRoles(
      tree({
        "color-brand-500": { $value: "#14b8a6" },
        "brand-25": { $value: "{color.teal-25}" },
        "accent-600": { $value: "#b8923f" },
      }),
    );
    expect(result.annotated.color?.["color-brand-500"]?.$extensions).toBeUndefined();
    expect(result.annotated.color?.["brand-25"]?.$extensions).toBeUndefined();
    expect(result.annotated.color?.["accent-600"]?.$extensions).toBeUndefined();
    expect(result.recognized).toBe(0);
    expect(result.unrecognized).toEqual(["color.color-brand-500", "color.brand-25", "color.accent-600"]);
  });

  it("Carbon/Primer 2-digit tiers still recognize — layer-01, field-01 are ROLES with a number, not scale steps", () => {
    const result = recognizeRoles(
      tree({ "layer-01": { $value: "{color.gray-50}" }, "field-01": { $value: "{color.gray-100}" } }),
    );
    expect(result.annotated.color?.["layer-01"]?.$extensions).toEqual({ "design-os.role": "card" });
    expect(result.annotated.color?.["field-01"]?.$extensions).toEqual({ "design-os.role": "input" });
  });

  it("Radix's 1-12 step scale still recognizes — accent-9 is a ROLE with a number, not a scale step", () => {
    const result = recognizeRoles(tree({ "accent-9": { $value: "#14b8a6" } }));
    expect(result.annotated.color?.["accent-9"]?.$extensions).toEqual({ "design-os.role": "accent" });
  });

  // ─── FIX 3b: color roles only — non-color tokens are out of scope ────────────

  it("non-color tokens are left untouched and out of scope — radius.button and font-size.md never enter recognition", () => {
    const result = recognizeRoles(
      treeTyped("dimension", {
        "radius-button": { $value: "4px", $type: "dimension" },
        "space-4": { $value: "16px", $type: "dimension" },
      }),
    );
    expect(result.annotated.dimension?.["radius-button"]?.$extensions).toBeUndefined();
    expect(result.annotated.dimension?.["space-4"]?.$extensions).toBeUndefined();
    expect(result.recognized).toBe(0);
    expect(result.unrecognized).toEqual([]); // out of scope, not "unrecognized"
    expect(result.ambiguous).toEqual([]);
  });

  it("a mixed tree recognizes color tokens and leaves non-color tokens alone, both verbatim (lossless across types)", () => {
    const mixed: TokenTree = {
      color: { primary: { $value: "{color.brand-600}", $type: "color" } },
      dimension: { "radius-lg": { $value: "8px", $type: "dimension" } },
    };
    const result = recognizeRoles(mixed);
    expect(result.annotated.color?.["primary"]?.$extensions).toEqual({ "design-os.role": "primary" });
    expect(result.annotated.dimension?.["radius-lg"]).toEqual(mixed.dimension?.["radius-lg"]);
    expect(result.recognized).toBe(1);
  });
});

// ─── LIVE (Art III) — opt in with a real design.tokens.json ───────────────────
// This block used to gate on a hard-coded scratchpad path from one session. That
// path expired, so the block skipped on every machine including the one it was
// written on — committed coverage that silently stopped running while the suite
// stayed green (issue #127).
//
// The intent was right: a real-data check should not hard-fail CI on a machine
// without the fixture. The mechanism was wrong, because a session-scoped temp
// path cannot outlive its session. Now it is an explicit opt-in:
//
//   ROLE_RECOGNITION_LIVE=/path/to/design.tokens.json npm test
//
// Skipped means NOT CONFIGURED — the test title says so, so a skipped run cannot
// be misread as a passing one. Point it at a file with no `surface-*` colours and
// the prefix case FAILS rather than passing vacuously: an unsuitable file is a
// different answer from an absent one.

import { readFileSync, existsSync } from "node:fs";
import { parseTokenFile } from "../src/core/token-model.js";

const LIVE_TOKENS = process.env["ROLE_RECOGNITION_LIVE"] ?? "";
const liveReady = LIVE_TOKENS !== "" && existsSync(LIVE_TOKENS);

describe.skipIf(!liveReady)("recognizeRoles — LIVE on a real token file (set ROLE_RECOGNITION_LIVE)", () => {
  const load = (): ReturnType<typeof parseTokenFile> =>
    parseTokenFile(JSON.parse(readFileSync(LIVE_TOKENS, "utf-8")));

  it("is lossless — every input token survives with a byte-identical $value", () => {
    const parsedTree = load();
    const result = recognizeRoles(parsedTree);
    for (const [cat, group] of Object.entries(parsedTree)) {
      for (const [name, token] of Object.entries(group)) {
        expect(result.annotated[cat]?.[name]?.$value).toBe(token.$value);
      }
    }
  });

  it("recognises a real share of the file without claiming to recognise all of it", () => {
    const result = recognizeRoles(load());
    // A real design system always yields both: recognition that is not trivial,
    // and a remainder the dictionary does not cover. Either extreme means the
    // recogniser is lying — matching nothing, or matching everything by accident.
    expect(result.recognized).toBeGreaterThan(0);
    expect(result.unrecognized.length).toBeGreaterThan(0);
  });

  it("resolves every `surface-*` colour to background, literal or alias alike", () => {
    const parsedTree = load();
    const surfaces = Object.keys(parsedTree.color ?? {}).filter((n) => n.startsWith("surface-"));
    // Not a vacuous pass: a file without surface- colours cannot exercise the
    // leading-prefix rule, and saying so beats reporting green.
    expect(surfaces.length, `${LIVE_TOKENS} has no surface-* colours, so it cannot exercise the prefix rule`)
      .toBeGreaterThan(0);

    const result = recognizeRoles(parsedTree);
    for (const name of surfaces) {
      expect(result.annotated.color?.[name]?.$extensions, `surface token '${name}'`)
        .toMatchObject({ "design-os.role": "background" });
    }
  });
});
