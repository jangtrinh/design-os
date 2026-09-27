/**
 * token-coverage-classify.ts — classifies one CSS declaration's value as
 * `token`, `derived`, or `raw` against the project's resolved token map, and
 * builds the literal-value index that classification checks against.
 *
 * `token`   var(--x) resolving to a project token, OR a literal equal to a
 *           resolved token value for that category (C1: "a literal equal to
 *           a token value counts as token").
 * `derived` calc(...), a percentage, or a relative unit (em/rem/vw/vh/vmin/
 *           vmax/ch/ex/fr) — a deliberate third bucket, never counted as raw:
 *           these are legitimate, lower-signal values a coverage floor should
 *           not punish (mirrors ds-usage-lint.ts's spacing/radius deferral).
 * `raw`     everything else — a hardcoded literal a token could have covered.
 */
import type { ResolvedMap } from "./token-model.js";
import { declaredCssVarNames } from "./token-emit.js";
import type { CoverageDeclaration, TokenCoverageCategory } from "./token-coverage-extract.js";

export type TokenCoverageClass = "token" | "derived" | "raw";

export interface TokenValueIndex {
  declaredVars: ReadonlySet<string>;
  color: ReadonlySet<string>;
  fontFamily: ReadonlySet<string>;
  dimension: ReadonlySet<string>;
  /** Assembled "offsetX offsetY blur spread color" shorthand per shadow-type composite token. */
  shadowShorthand: ReadonlySet<string>;
}

const VAR_RE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[^)]*)?\)/g;
// calc(), a percentage, or a number immediately followed by a relative unit.
const DERIVED_RE = /calc\(|%|(?<![a-z0-9_-])[+-]?[\d.]+(?:em|rem|vw|vh|vmin|vmax|ch|ex|fr)\b/i;
// Categories where a relative unit is a meaningful "derived" signal — excludes
// color (hsl()/rgba() legitimately use "%" for saturation/lightness/alpha,
// which is not what "derived" means here) and font-family (no units at all).
const DIMENSION_CATEGORIES: ReadonlySet<TokenCoverageCategory> = new Set(["font-size", "spacing", "radius", "shadow"]);

function scalar(v: unknown): string {
  return typeof v === "number" ? String(v) : typeof v === "string" ? v : String(v);
}

function normalize(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Build the literal-value index from a resolved token map (composite shadow/typography tokens expanded). */
export function buildTokenValueIndex(map: ResolvedMap): TokenValueIndex {
  const color = new Set<string>();
  const fontFamily = new Set<string>();
  const dimension = new Set<string>();
  const shadowShorthand = new Set<string>();

  for (const t of map) {
    if (typeof t.value === "object" && t.value !== null) {
      const v = t.value as Record<string, unknown>;
      if (t.type === "shadow") {
        const dims = ["offsetX", "offsetY", "blur", "spread"].map((k) => scalar(v[k]));
        const colorPart = scalar(v["color"]);
        for (const d of dims) dimension.add(d);
        color.add(colorPart);
        shadowShorthand.add(normalize(`${dims.join(" ")} ${colorPart}`));
      } else if (t.type === "typography") {
        if (typeof v["fontFamily"] === "string") fontFamily.add(v["fontFamily"] as string);
        if (v["fontSize"] !== undefined) dimension.add(scalar(v["fontSize"]));
        if (v["letterSpacing"] !== undefined) dimension.add(scalar(v["letterSpacing"]));
      }
      continue;
    }
    const val = scalar(t.value);
    if (t.type === "color") color.add(val);
    else if (t.type === "fontFamily") fontFamily.add(val);
    else if (t.type === "dimension") dimension.add(val);
  }

  return { declaredVars: declaredCssVarNames(map), color, fontFamily, dimension, shadowShorthand };
}

function hasDeclaredVar(value: string, declaredVars: ReadonlySet<string>): boolean {
  for (const m of value.matchAll(VAR_RE)) {
    if (declaredVars.has(m[1] as string)) return true;
  }
  return false;
}

function literalSetFor(category: TokenCoverageCategory, idx: TokenValueIndex): ReadonlySet<string> | undefined {
  switch (category) {
    case "color": return idx.color;
    case "font-family": return idx.fontFamily;
    case "font-size":
    case "spacing":
    case "radius": return idx.dimension;
    case "shadow": return idx.shadowShorthand;
    default: return undefined;
  }
}

export function classifyDeclaration(decl: CoverageDeclaration, idx: TokenValueIndex): TokenCoverageClass {
  const value = decl.value.trim();
  if (DIMENSION_CATEGORIES.has(decl.category) && DERIVED_RE.test(value)) return "derived";
  if (hasDeclaredVar(value, idx.declaredVars)) return "token";
  const literals = literalSetFor(decl.category, idx);
  if (literals !== undefined) {
    const norm = normalize(value);
    for (const lit of literals) if (normalize(lit) === norm) return "token";
  }
  return "raw";
}
