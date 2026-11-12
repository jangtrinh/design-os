/**
 * Where a CSS custom property lands in the token tree, and what its value becomes (split out of
 * css-token-ingest.ts to keep that file small). Pure, deterministic.
 *
 * The leaf is the custom-property name minus `--`, VERBATIM — no prefix
 * stripping. `--gray-900` and `--color-gray-900` are two DIFFERENT declared properties (dana: the latter is a
 * Tailwind `@theme` re-export of the former, `var(--gray-900)`, not a duplicate) and land at two different paths:
 * `color.gray-900` and `color.color-gray-900`. An earlier rule stripped a category-matching prefix, silently merging
 * the two and collapsing the two-tier structure `token-taxonomy.md:110` mandates. The (uglier) verbatim name is the
 * source's own name, recorded as declared (SOURCE-grade, `learn.md` §3c) — not rewritten to look nicer.
 */
import { inferToken } from "./token-import.js";
import type { ImportedType } from "./token-import.js";
import { sanitizeSeg } from "./figma-ds-tokens.js";
import type { CustomPropertyObservation } from "./designmd-token-extractor.js";

export interface PathInfo { category: string; leaf: string; type: ImportedType }

function categoryForType(type: ImportedType): string {
  switch (type) {
    case "color": return "color";
    case "fontFamily":
    case "fontWeight": return "font";
    case "dimension": return "dimension";
    case "duration": return "duration";
    case "number": return "number";
  }
}

/** The type of a property that has no literal to test — a name-hint fallback for properties that are ALWAYS
 * alias-valued and whose target is not in the input. Insight 1: overwhelmingly color. */
function typeFromNameHint(leafRaw: string): ImportedType {
  if (/font-?family|family/i.test(leafRaw)) return "fontFamily";
  if (/weight/i.test(leafRaw)) return "fontWeight";
  if (/motion|duration|transition|delay/i.test(leafRaw)) return "duration";
  if (/spac|radi|size|width|height|layout|gap|inset|offset/i.test(leafRaw)) return "dimension";
  return "color";
}

export function parseVarRef(value: string): string | null {
  const m = /^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/.exec(value.trim());
  return m ? (m[1] as string) : null;
}

/** The type a property's value has: a literal's inferred type; an alias takes the type of the property it names
 * (through a chain), so `--font-sans: var(--ds-font-sans)` is a fontFamily, not a color by the look of its name.
 * `null` when the literal is unmappable; the name hint when the chain ends at a name that is not in the input. */
function typeOf(name: string, byName: ReadonlyMap<string, CustomPropertyObservation[]>, seen: Set<string>): ImportedType | null {
  const entries = byName.get(name) ?? [];
  const leafRaw = name.slice(2);
  const literal = entries.find((e) => parseVarRef(e.value) === null);
  if (literal !== undefined) {
    const r = inferToken("", leafRaw, literal.value);
    return "skip" in r ? null : r.$type;
  }
  seen.add(name);
  for (const e of entries) {
    const ref = parseVarRef(e.value);
    if (ref !== null && byName.has(ref) && !seen.has(ref)) return typeOf(ref, byName, seen);
  }
  return typeFromNameHint(leafRaw);
}

/** This custom property's own {category, leaf, $type} — independent of alias/base/mode. */
export function computeOwnPath(name: string, byName: ReadonlyMap<string, CustomPropertyObservation[]>): PathInfo | null {
  const type = typeOf(name, byName, new Set());
  if (type === null) return null;
  return { category: sanitizeSeg(categoryForType(type)), leaf: sanitizeSeg(name.slice(2)), type };
}

/** `leafRaw` supplies inferToken's category/name-hint context (WEIGHT_RE/DURATION_CAT_RE/
 * FAMILY_RE) — without it a value like "400ms" can't be recognised as a duration string
 * (only a bare number gets that treatment without a name hint). Measured live on hvs. */
export function resolveValue(value: string, leafRaw: string, pathByName: Map<string, PathInfo | null>): string | number | null {
  const ref = parseVarRef(value);
  if (ref !== null) {
    const target = pathByName.get(ref);
    if (target === null || target === undefined) return null; // dangling/unresolvable alias
    return `{${target.category}.${target.leaf}}`;
  }
  const inferred = inferToken("", leafRaw, value);
  return "skip" in inferred ? null : inferred.$value;
}
