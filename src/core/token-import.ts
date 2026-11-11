/**
 * Flat-token importer (DESIGN-OS dogfood G1) — convert a common flat design-token
 * file `{ category: { name: value } }` (e.g. a Figma-reconciled tokens.json) into
 * the DTCG shape the `ui ds *` store expects `{ category: { name: { $value, $type } } }`.
 * Pure: no IO. Type is inferred from the value + category/name; anything that can't be
 * typed to a KNOWN DTCG type is SKIPPED and reported (honest — never emit a bad $type).
 * Nested groups (e.g. typography.sizes) are hoisted into their own `<cat>-<sub>` category
 * since DTCG is two levels deep.
 */

import { isAlias, isTokenLeaf } from "./token-model.js";
import { sanitizeSeg } from "./figma-ds-tokens.js";

export type ImportedType = "color" | "dimension" | "number" | "fontFamily" | "fontWeight" | "duration";

export interface ImportStats {
  imported: number;
  skipped: number;
  byType: Record<string, number>;
  /** `category.name` of each skipped token + why. */
  skippedKeys: { key: string; reason: string }[];
}
/** One key of the source file that becomes a token: its JSON pointer (the stable id) and its dotted path (what a person reads). */
export interface SourceKey { id: string; name: string }

export interface ImportResult {
  /** DTCG token tree ready for parseTokenFile. `$extensions` survives an already-DTCG
   * leaf pass-through (F2/D5) — e.g. a mode carried by ingest-css-ds/ingest-figma-ds. */
  dtcg: Record<string, Record<string, { $value: string | number; $type: ImportedType; $extensions?: Record<string, unknown> }>>;
  stats: ImportStats;
  /** Every written path that two or more source keys map to (a case difference, or a hoisted group beside a flat one), keys in file order. */
  collisions: { path: string; keys: SourceKey[] }[];
  /** The keys that lost a collision: every key but the winner, or every key when the owner kept none. Never written. */
  losers: SourceKey[];
  /** Aliases (by written path) whose target is a source key that is not written: dangling, even if the target's text names another token's path. */
  unreachableAliases: Set<string>;
  /** How many written aliases name each source key (by dotted source path): what a collision question says is at stake. */
  aliasesNaming: Map<string, number>;
}

/** The JSON pointer of a key path: the stable id of a source member (a rename changes it, a reorder does not). */
export const pointerOf = (ptr: readonly string[]): string => `/${ptr.map((seg) => seg.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;

/**
 * What an alias looks like in the file being imported: any `{...}` without a brace or a space inside, whatever its case.
 * The strict form (`isAlias`) is what the store accepts; a source alias is rewritten to it when it names a source key
 * that is written, and is a dangling alias when it does not.
 */
const ALIAS_SHAPE_RE = /^\{[^{}\s]+\}$/;
const isAliasShape = (v: unknown): v is string => typeof v === "string" && ALIAS_SHAPE_RE.test(v);

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
    // F2 (spec 009 P3): an alias front-door refusal drops the entire semantic tier
    // (token-taxonomy.md:110) — ALIAS_RE already exists (token-model.ts), change-token
    // already accepts aliases; only this front door refused. No literal to type from, so
    // fall back to a category/name hint (color dominates the real alias layer).
    if (isAliasShape(v)) return { $value: v, $type: aliasTypeHint(ctx) };
    return { skip: `unmappable string value "${String(value).slice(0, 24)}"` };
  }
  if (typeof value === "number") return numeric(category, name, value);
  return { skip: `unsupported value type ${typeof value}` };
}

/** No literal value to test (the leaf is alias-only) — infer $type from category+name hints. */
function aliasTypeHint(ctx: string): ImportedType {
  if (FAMILY_RE.test(ctx)) return "fontFamily";
  if (WEIGHT_RE.test(ctx)) return "fontWeight";
  if (DURATION_CAT_RE.test(ctx)) return "duration";
  if (DIM_CAT_RE.test(ctx)) return "dimension";
  return "color";
}

/** A bare number becomes a px dimension in a dimension-ish category, a fontWeight under weight, else a number. */
function numeric(category: string, name: string, n: number): { $value: string | number; $type: ImportedType } {
  const ctx = `${category} ${name}`;
  if (WEIGHT_RE.test(ctx)) return { $value: n, $type: "fontWeight" };
  if (DURATION_CAT_RE.test(ctx) && /ms\b/i.test(name)) return { $value: `${n}ms`, $type: "duration" };
  if (DIM_CAT_RE.test(ctx)) return { $value: `${n}px`, $type: "dimension" };
  return { $value: n, $type: "number" };
}

type DtcgToken = ImportResult["dtcg"][string][string];
interface Candidate { path: string; cat: string; name: string; token: DtcgToken; key: SourceKey; /** The alias's $type is a guess from its own name until it is taken from the token it resolves to. */ hinted?: boolean }

/**
 * Convert a flat token object to DTCG + import stats. `_`-prefixed top keys (metadata) are ignored.
 *
 * Two source keys that map to one written path are a collision: `winners` maps that path to the id of the key the
 * owner kept ("" keeps none). With no entry for a path (the owner has not ruled yet) the first key in file order
 * stands in, so the rest of the plan can be computed; a caller that writes must have ruled every collision first.
 * An alias is written pointing at the written path of the token it names by its source path, and is reported
 * unreachable when that token is not written.
 */
export function importFlatTokens(flat: unknown, winners: ReadonlyMap<string, string> = new Map()): ImportResult {
  if (typeof flat !== "object" || flat === null || Array.isArray(flat)) {
    throw new Error("token file must be a JSON object");
  }
  const candidates: Candidate[] = [];
  const stats: ImportStats = { imported: 0, skipped: 0, byType: {}, skippedKeys: [] };

  const putCategory = (cat: string, entries: [string, unknown][], ptr: string[]): void => {
    for (const [name, value] of entries) {
      const at = [...ptr, name];
      const key: SourceKey = { id: pointerOf(at), name: at.join(".") };
      // F2/D5: an already-DTCG leaf (e.g. from ingest-css-ds/ingest-figma-ds, which both
      // seal via 'ds import') is passed through as-is, $extensions included — recursing
      // into its $value/$type as if they were child token names (the old behaviour)
      // silently corrupted every such import into bogus "<cat>.$value" tokens.
      if (isTokenLeaf(value) && (typeof value.$value === "string" || typeof value.$value === "number")) {
        const catSan = sanitizeSeg(cat);
        const nameSan = sanitizeSeg(name);
        candidates.push({ path: `${catSan}.${nameSan}`, cat: catSan, name: nameSan, key, token: {
          $value: value.$value,
          $type: value.$type as ImportedType,
          ...(value.$extensions !== undefined ? { $extensions: value.$extensions } : {}),
        } });
        continue;
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // nested group → hoist into its own category `<cat>-<name>`
        putCategory(`${cat}-${name}`, Object.entries(value as Record<string, unknown>), at);
        continue;
      }
      const r = inferToken(cat, name, value);
      if ("skip" in r) {
        stats.skipped++;
        stats.skippedKeys.push({ key: `${cat}.${name}`, reason: r.skip });
        continue;
      }
      // F6 (spec 009 P3): 'ds init' writes kebab-case; TOKEN_PATTERN (registry-store.ts)
      // forbids uppercase — a camelCase source group ("fontSize") used to pass through
      // verbatim and become unreferencable from any component. Sanitize on the way in.
      const catSan = sanitizeSeg(cat);
      const nameSan = sanitizeSeg(name);
      candidates.push({ path: `${catSan}.${nameSan}`, cat: catSan, name: nameSan, key, token: r, ...(isAliasShape(r.$value) ? { hinted: true } : {}) });
    }
  };

  for (const [category, groupVal] of Object.entries(flat as Record<string, unknown>)) {
    if (category.startsWith("_")) continue; // metadata (_source, _provenance, …)
    if (typeof groupVal !== "object" || groupVal === null || Array.isArray(groupVal)) {
      stats.skipped++;
      stats.skippedKeys.push({ key: category, reason: "top-level value is not a token group" });
      continue;
    }
    putCategory(category, Object.entries(groupVal as Record<string, unknown>), [category]);
  }

  // Collisions: the keys that share a written path, and which of them stands.
  const byPath = new Map<string, Candidate[]>();
  for (const c of candidates) byPath.set(c.path, [...(byPath.get(c.path) ?? []), c]);
  const collisions: ImportResult["collisions"] = [];
  const standing = new Set<Candidate>();
  const losers: SourceKey[] = [];
  for (const [path, group] of byPath) {
    if (group.length === 1) { standing.add(group[0] as Candidate); continue; }
    collisions.push({ path, keys: group.map((g) => g.key) });
    const winnerId = winners.get(path) ?? (group[0] as Candidate).key.id;
    for (const g of group) { if (g.key.id === winnerId) standing.add(g); else losers.push(g.key); }
  }

  const dtcg: ImportResult["dtcg"] = {};
  for (const c of candidates) {
    if (!standing.has(c)) continue;
    (dtcg[c.cat] ??= {})[c.name] = c.token;
    stats.imported++;
    stats.byType[c.token.$type] = (stats.byType[c.token.$type] ?? 0) + 1;
  }

  // An alias names a source key; it is written pointing at the written path of that same token. When that token is
  // not written the alias is unreachable, and is never pointed at a different token that happens to share the text.
  const bySourceName = new Map<string, Candidate[]>();
  for (const c of candidates) bySourceName.set(c.key.name, [...(bySourceName.get(c.key.name) ?? []), c]);
  const unreachableAliases = new Set<string>();
  const aliasesNaming = new Map<string, number>();
  for (const c of candidates) {
    if (!standing.has(c) || !isAliasShape(c.token.$value)) continue;
    const target = c.token.$value.slice(1, -1);
    const named = bySourceName.get(target);
    if (named === undefined) { // names no source key: it may still name a written path, as it always could, if it is a path
      if (!isAlias(c.token.$value)) unreachableAliases.add(c.path);
      continue;
    }
    aliasesNaming.set(target, (aliasesNaming.get(target) ?? 0) + 1);
    const writtenPaths = [...new Set(named.filter((n) => standing.has(n)).map((n) => n.path))];
    if (writtenPaths.length === 1) c.token.$value = `{${writtenPaths[0]}}`;
    else unreachableAliases.add(c.path);
  }
  // A written alias has the $type of the token it resolves to, through a chain, from the terminal token.
  const written = new Map<string, Candidate>();
  for (const c of candidates) if (standing.has(c)) written.set(c.path, c);
  for (const c of candidates) {
    if (!standing.has(c) || c.hinted !== true || unreachableAliases.has(c.path)) continue;
    const seen = new Set<string>([c.path]);
    let at: Candidate | undefined = c;
    while (at !== undefined && isAlias(at.token.$value) && !unreachableAliases.has(at.path)) {
      const next: Candidate | undefined = written.get((at.token.$value as string).slice(1, -1));
      if (next === undefined || seen.has(next.path)) { at = undefined; break; }
      seen.add(next.path);
      at = next;
    }
    if (at !== undefined && !isAlias(at.token.$value)) {
      if (c.token.$type !== at.token.$type) {
        if ((stats.byType[c.token.$type] = (stats.byType[c.token.$type] ?? 1) - 1) === 0) delete stats.byType[c.token.$type];
        c.token.$type = at.token.$type;
        stats.byType[c.token.$type] = (stats.byType[c.token.$type] ?? 0) + 1;
      }
    }
  }
  return { dtcg, stats, collisions, losers, unreachableAliases, aliasesNaming };
}
