/**
 * Value and name helpers of the Figma variable → DTCG conversion (pure, zero-network). The tree itself is built in
 * figma-ds-tokens.ts, which re-exports everything here.
 *
 * Input: the `tokens` array from `figma-agent scan-design-system` (ds.json).
 * Each entry is a Figma Variable: { id, name, type, collection?, value?, valuesByMode? }.
 * Output: a two-tier DTCG TokenTree (token-model.ts shape) where
 *   - a variable holding a literal value → a PRIMITIVE token ($value is a literal),
 *   - a variable holding a VARIABLE_ALIAS → a SEMANTIC token ($value is "{path}").
 * That literal-vs-alias split IS the primitive/semantic tier distinction
 * (see knowledge/token-taxonomy.md — primitives are literals at the graph bottom,
 * semantics alias primitives).
 *
 * Figma Variable *modes* (e.g. Light / Dark) map to: the base/light mode → `$value`,
 * every other mode → `$extensions["mode.<name>"] = { $value }`. `ui tokens compile`
 * resolves `$value` and ignores `$extensions`, so the compiled output stays valid
 * while the dark layer is preserved and documented.
 *
 * This module never touches the filesystem; it is a pure transform.
 */

// ─── Input shape (subset of ds.json we consume) ───────────────────────────────

export interface DsVariable {
  id: string;
  name: string;
  type: string; // Figma resolvedType: COLOR | FLOAT | STRING | BOOLEAN
  collection?: string;
  value?: unknown;
  /** Optional richer form: mode-name → value (Light/Dark). Forward-compatible. */
  valuesByMode?: Record<string, unknown>;
}

// ─── DTCG leaf/tree (mirrors token-model.ts, kept local to avoid a cycle) ──────

/** `string` is only ever written for a variable the owner chose to keep raw: it has no DTCG type of its own. */
export type DtcgType = "color" | "dimension" | "fontFamily" | "fontWeight" | "number" | "string";

export interface DtcgLeaf {
  $value: string | number;
  $type: DtcgType;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export type DtcgTree = Record<string, Record<string, DtcgLeaf>>;

// ─── Name → 2-level path (category.token) ─────────────────────────────────────

/** Collection/tier labels stripped from a variable path (tier lives in literal-vs-alias, not the name). */
const TIER_PREFIXES = new Set([
  "primitives", "primitive", "core", "global", "base", "foundation",
  "semantic", "semantics", "tokens", "token", "alias", "aliases", "theme", "themes",
]);

const DIMENSION_HINTS = [
  "space", "spacing", "size", "radius", "radii", "gap", "padding", "margin",
  "inset", "width", "height", "border-width", "stroke", "elevation-size",
];
const WEIGHT_HINTS = ["weight", "font-weight"];
const FONT_HINTS = ["font-family", "family", "typeface", "font"];

/** Lowercase, collapse to the alias-safe [a-z0-9-] alphabet. Never empty. */
export function sanitizeSeg(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out.length > 0 ? out : "x";
}

/** Map a Figma resolvedType (+ name hints) to a DTCG $type, or null when unmappable. */
export function inferDtcgType(name: string, figmaType: string): DtcgType | null {
  const n = name.toLowerCase();
  const has = (hints: string[]): boolean => hints.some((h) => n.includes(h));
  switch (figmaType) {
    case "COLOR": return "color";
    case "FLOAT":
      if (has(WEIGHT_HINTS)) return "fontWeight";
      if (has(DIMENSION_HINTS)) return "dimension";
      return "number";
    case "STRING":
      return has(FONT_HINTS) ? "fontFamily" : null;
    default:
      return null; // BOOLEAN and anything else
  }
}

/** The category bucket for a single-segment (unpathed) variable, derived from its type. */
function categoryForType(type: DtcgType, name: string): string {
  switch (type) {
    case "color": return "color";
    case "fontFamily":
    case "fontWeight": return "font";
    case "dimension": {
      const n = name.toLowerCase();
      const hit = DIMENSION_HINTS.find((h) => n.includes(h));
      return hit !== undefined ? sanitizeSeg(hit) : "dimension";
    }
    default: return "number";
  }
}

/** Split a Figma variable name into a DTCG 2-level path (the token model is exactly category.token). */
export function pathOf(name: string, type: DtcgType): { category: string; token: string } {
  let segs = name.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segs.length > 1 && TIER_PREFIXES.has(sanitizeSeg(segs[0] ?? ""))) segs = segs.slice(1);
  const clean = segs.map(sanitizeSeg);
  if (clean.length <= 1) {
    return { category: categoryForType(type, name), token: clean[0] ?? "x" };
  }
  return { category: clean[0] as string, token: clean.slice(1).join("-") };
}

// ─── Value conversion ─────────────────────────────────────────────────────────

export function isAliasValue(v: unknown): v is { type: string; id: string } {
  return (
    typeof v === "object" && v !== null &&
    (v as Record<string, unknown>)["type"] === "VARIABLE_ALIAS" &&
    typeof (v as Record<string, unknown>)["id"] === "string"
  );
}

function chan(v: number): string {
  const h = Math.max(0, Math.min(255, Math.round(v * 255))).toString(16);
  return h.length === 1 ? "0" + h : h;
}

/** Figma color {r,g,b,a?} floats → #RRGGBB (or #RRGGBBAA when a < 1). Uppercase. */
export function colorToHex(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  if (typeof c["r"] !== "number" || typeof c["g"] !== "number" || typeof c["b"] !== "number") return null;
  const a = typeof c["a"] === "number" ? c["a"] : 1;
  const base = `#${chan(c["r"])}${chan(c["g"])}${chan(c["b"])}`.toUpperCase();
  return a >= 1 ? base : `${base}${chan(a)}`.toUpperCase();
}

/** Convert one literal Figma value to a DTCG $value for the given type, or null if unconvertible. */
export function literalValue(type: DtcgType, v: unknown): string | number | null {
  switch (type) {
    case "color": return colorToHex(v);
    case "dimension": return typeof v === "number" ? `${v}px` : null;
    case "fontWeight":
    case "number": return typeof v === "number" ? v : null;
    case "fontFamily":
    case "string": return typeof v === "string" ? v : null;
  }
}

/** A token path for a variable that has no DTCG type: always under the `raw` group, never merged with a typed token. */
export function rawPathOf(name: string, id: string): { category: string; token: string } {
  const segs = name.split("/").map((s) => s.trim()).filter((s) => s.length > 0).map(sanitizeSeg);
  return { category: "raw", token: `${segs.join("-") || "x"}-${sanitizeSeg(id)}` };
}

/** Prefer a Light/Default mode as the base $value; else the first declared mode. */
export function pickBaseMode(modes: string[]): string | undefined {
  const pref = modes.find((m) => /^(light|default|value|mode ?1|light ?mode)$/i.test(m.trim()));
  return pref ?? modes[0];
}
