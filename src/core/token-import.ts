/**
 * Flat-token importer (DESIGN-OS dogfood G1) — convert a common flat design-token
 * file `{ category: { name: value } }` (e.g. a Figma-reconciled tokens.json) into
 * the DTCG shape the `ui ds *` store expects `{ category: { name: { $value, $type } } }`.
 * Pure: no IO. Type is inferred from the value + category/name; anything that can't be
 * typed to a KNOWN DTCG type is SKIPPED and reported (honest — never emit a bad $type).
 * Nested groups (e.g. typography.sizes) are hoisted into their own `<cat>-<sub>` category
 * since DTCG is two levels deep.
 */

export type ImportedType = "color" | "dimension" | "number" | "fontFamily" | "fontWeight" | "duration";

export interface ImportStats {
  imported: number;
  skipped: number;
  byType: Record<string, number>;
  /** `category.name` of each skipped token + why. */
  skippedKeys: { key: string; reason: string }[];
}
export interface ImportResult {
  /** DTCG token tree ready for parseTokenFile. */
  dtcg: Record<string, Record<string, { $value: string | number; $type: ImportedType }>>;
  stats: ImportStats;
}

const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const COLOR_FN_RE = /^(?:rgb|rgba|hsl|hsla|oklch|oklab|color)\(/i;
const DIM_RE = /^-?\d*\.?\d+(?:px|rem|em|%|vh|vw|vmin|vmax)$/i;
const DIM_CAT_RE = /(?:spac|radi|size|width|height|layout|gap|inset|offset|topbar|rail|track|leading|height)/i;
const FAMILY_RE = /font-?family|family/i;
const WEIGHT_RE = /weight/i;
const DURATION_CAT_RE = /motion|duration|transition|delay/i;

/** Infer a DTCG {$value,$type} for one leaf, or null to skip (with a reason). */
export function inferToken(category: string, name: string, value: unknown): { $value: string | number; $type: ImportedType } | { skip: string } {
  const ctx = `${category} ${name}`;
  if (typeof value === "string") {
    const v = value.trim();
    if (COLOR_RE.test(v) || COLOR_FN_RE.test(v)) return { $value: v, $type: "color" };
    if (DIM_RE.test(v)) return { $value: v, $type: "dimension" };
    if (FAMILY_RE.test(ctx)) return { $value: v, $type: "fontFamily" };
    if (DURATION_CAT_RE.test(ctx) && /^\d+m?s$/i.test(v)) return { $value: v, $type: "duration" };
    // numeric-looking string
    if (/^-?\d*\.?\d+$/.test(v)) return numeric(category, name, Number(v));
    return { skip: `unmappable string value "${v.slice(0, 24)}"` };
  }
  if (typeof value === "number") return numeric(category, name, value);
  return { skip: `unsupported value type ${typeof value}` };
}

/** A bare number becomes a px dimension in a dimension-ish category, a fontWeight under weight, else a number. */
function numeric(category: string, name: string, n: number): { $value: string | number; $type: ImportedType } {
  const ctx = `${category} ${name}`;
  if (WEIGHT_RE.test(ctx)) return { $value: n, $type: "fontWeight" };
  if (DURATION_CAT_RE.test(ctx) && /ms\b/i.test(name)) return { $value: `${n}ms`, $type: "duration" };
  if (DIM_CAT_RE.test(ctx)) return { $value: `${n}px`, $type: "dimension" };
  return { $value: n, $type: "number" };
}

/** Convert a flat token object to DTCG + import stats. `_`-prefixed top keys (metadata) are ignored. */
export function importFlatTokens(flat: unknown): ImportResult {
  if (typeof flat !== "object" || flat === null || Array.isArray(flat)) {
    throw new Error("token file must be a JSON object");
  }
  const dtcg: ImportResult["dtcg"] = {};
  const stats: ImportStats = { imported: 0, skipped: 0, byType: {}, skippedKeys: [] };

  const putCategory = (cat: string, entries: [string, unknown][]): void => {
    for (const [name, value] of entries) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // nested group → hoist into its own category `<cat>-<name>`
        putCategory(`${cat}-${name}`, Object.entries(value as Record<string, unknown>));
        continue;
      }
      const r = inferToken(cat, name, value);
      if ("skip" in r) {
        stats.skipped++;
        stats.skippedKeys.push({ key: `${cat}.${name}`, reason: r.skip });
        continue;
      }
      (dtcg[cat] ??= {})[name] = r;
      stats.imported++;
      stats.byType[r.$type] = (stats.byType[r.$type] ?? 0) + 1;
    }
  };

  for (const [category, groupVal] of Object.entries(flat as Record<string, unknown>)) {
    if (category.startsWith("_")) continue; // metadata (_source, _provenance, …)
    if (typeof groupVal !== "object" || groupVal === null || Array.isArray(groupVal)) {
      stats.skipped++;
      stats.skippedKeys.push({ key: category, reason: "top-level value is not a token group" });
      continue;
    }
    putCategory(category, Object.entries(groupVal as Record<string, unknown>));
  }
  return { dtcg, stats };
}
