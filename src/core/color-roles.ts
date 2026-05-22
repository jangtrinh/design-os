/**
 * Semantic role classification and palette generation.
 *
 * Classifies color token names into design roles (primary, danger, neutral …)
 * via keyword heuristics, then generates an 11-stop OKLCH scale per role.
 * Deduplicates: first color per role wins. Output is sorted in canonical role order.
 */
import { hexToOKLCH } from "./color-convert.js";
import { generatePalette } from "./color-scale.js";
import type { ColorScale } from "./color-scale.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SemanticRole =
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export interface SemanticPaletteEntry {
  role: SemanticRole;
  baseName: string;
  baseHex: string;
  scale: ColorScale;
}

export interface SemanticPalette {
  entries: SemanticPaletteEntry[];
}

// ─── Role classification ──────────────────────────────────────────────────────

const ROLE_KEYWORDS: [SemanticRole, RegExp][] = [
  ["primary",   /primary|brand|main|base(?!line)/i],
  ["secondary", /secondary|second|sub|muted/i],
  ["accent",    /accent|highlight|cta|action/i],
  ["success",   /success|green|positive|valid|complete/i],
  ["warning",   /warning|warn|amber|caution|yellow|orange/i],
  ["danger",    /danger|error|red|destructive|critical|alert/i],
  ["info",      /info|blue|link|focus|notice/i],
  ["neutral",   /neutral|gray|grey|zinc|slate|bg|background|text|border|surface|foreground/i],
];

const ROLE_ORDER: SemanticRole[] = [
  "primary", "secondary", "accent", "success", "warning", "danger", "info", "neutral",
];

/** Classify a color token name into a semantic role via keyword heuristics. */
export function classifyRole(name: string): SemanticRole | null {
  const lower = name.toLowerCase();
  for (const [role, pattern] of ROLE_KEYWORDS) {
    if (pattern.test(lower)) return role;
  }
  return null;
}

// ─── Palette generators ───────────────────────────────────────────────────────

/**
 * Generate a semantic palette from an array of named hex colors.
 *
 * - Skips non-hex values (rgba, named colors).
 * - Classifies each name → role; skips unclassified.
 * - Deduplicates: first color per role is used.
 * - Sorts entries in canonical role order.
 */
export function generateSemanticPalette(
  colors: { name: string; value: string }[],
): SemanticPalette {
  const entries: SemanticPaletteEntry[] = [];
  const usedRoles = new Set<SemanticRole>();

  for (const color of colors) {
    if (!color.value.startsWith("#")) continue;
    const role = classifyRole(color.name);
    if (role === null || usedRoles.has(role)) continue;
    usedRoles.add(role);

    const scale = generatePalette(color.value);
    scale.baseName = role;

    entries.push({
      role,
      baseName: color.name,
      baseHex: color.value.toUpperCase(),
      scale,
    });
  }

  entries.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return { entries };
}

/**
 * Batch-generate raw color scales from a list of named hex colors.
 *
 * - Skips non-hex values and achromatic colors (chroma < 0.01).
 * - Deduplicates by normalised hex value.
 * - Sets scale.baseName to the token name.
 */
export function generateScalesFromTokens(
  colors: { name: string; value: string }[],
): ColorScale[] {
  const scales: ColorScale[] = [];
  const seen = new Set<string>();

  for (const color of colors) {
    if (!color.value.startsWith("#")) continue;
    const normalized = color.value.toUpperCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const oklch = hexToOKLCH(color.value);
    if (oklch.c < 0.01) continue; // achromatic — skip

    const scale = generatePalette(color.value);
    scale.baseName = color.name;
    scales.push(scale);
  }

  return scales;
}
