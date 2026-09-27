/**
 * DTCG token file types, parse/validation, and predicate helpers.
 *
 * Accepts a two-tier token file (primitives + semantics in one JSON object)
 * AS ITS PUBLIC SHAPE — every consumer of `TokenTree`/`TokenGroup` outside
 * this module still sees category → { tokenName: Token }. Underneath, the
 * parser now walks a GROUP to any depth (PR-FU3-r2 A6: persona
 * `starting_tokens` nest a category into sub-groups, e.g. `font.family.body`,
 * and mix a leaf and a group at the same level, e.g. `color.accent` beside
 * `color.surface`) and FLATTENS every level below the category into one
 * tokenName, joining segments with "-" (`family.body` → `family-body`) — the
 * same separator `token-emit.ts` already uses to turn a dotted path into a
 * CSS custom-property name, so the emitted variable name is unaffected by
 * how many levels the source JSON nested. Validates that every leaf has a
 * known $type and a $value; does NOT resolve aliases — that is
 * token-resolve.ts's job.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "number"
  | "duration"
  | "shadow"
  | "typography"
  // A literal string leaf that is not a design-value type — e.g. families.json's
  // `elevation.shadow: "none"` (PR-FU3-r2 A6). Passed through verbatim, never
  // resolved as an alias target for a typed slot.
  | "string";

const KNOWN_TYPES: ReadonlySet<string> = new Set<TokenType>([
  "color", "dimension", "fontFamily", "fontWeight", "number", "duration", "shadow", "typography", "string",
]);

export interface Token {
  /** A fontFamily token's $value may be an array (font stack); every other
   * type is a scalar or a composite (shadow/typography) plain object. */
  $value: string | number | Record<string, unknown> | string[];
  $type: TokenType;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

/** A category group: one level of nesting under the top-level category key.
 * Any deeper nesting in the source JSON is flattened into this level by the
 * parser (PR-FU3-r2 A6) — this type stays two-tier for every consumer. */
export type TokenGroup = Record<string, Token>;

/** The top-level token file: category → group of token leaves. */
export type TokenTree = Record<string, TokenGroup>;

export interface ResolvedToken {
  /** Dotted path, e.g. "color.primary" */
  path: string;
  type: TokenType;
  /** Literal value after alias resolution. A fontFamily token's value may be
   * an array (font stack, PR-FU3-r2 A6). */
  value: string | number | Record<string, unknown> | string[];
}

/** Ordered flat list produced by resolveTokens. */
export type ResolvedMap = ResolvedToken[];

// ─── Error ────────────────────────────────────────────────────────────────────

export class TokenError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

// ─── Mode convention — the shared home (D3, spec 009 P3) ──────────────────────
//
// figma-ds-tokens.ts encodes `$extensions["mode.<name>"] = { $value }` locally
// ("kept local to avoid a cycle" — figma-ds-tokens.ts:29) because it predates
// this shared home. css-token-ingest.ts is the convention's SECOND emitter
// (Art II: a convention with two emitters needs one shared definition and a
// check — tests/mode-convention.test.ts is that check, driving both emitters
// to equivalent input and asserting byte-identical `$extensions` shape).

/** Lowercase, collapse to the alias-safe [a-z0-9-] alphabet. Never empty.
 * Mirrors figma-ds-tokens.ts's sanitizeSeg exactly (mode-convention.test.ts pins this). */
export function sanitizeModeName(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out.length > 0 ? out : "x";
}

/** The `$extensions` key for a non-base mode, e.g. "dark" → "mode.dark". */
export function modeExtensionKey(modeName: string): string {
  return `mode.${sanitizeModeName(modeName)}`;
}

// ─── Predicates ───────────────────────────────────────────────────────────────

const ALIAS_RE = /^\{[a-z0-9.-]+\}$/;

/** Returns true if v is a DTCG alias string like "{blue.500}". */
export function isAlias(v: unknown): v is string {
  return typeof v === "string" && ALIAS_RE.test(v);
}

/**
 * Returns true if obj looks like a token leaf (has $value and $type) rather
 * than a nested group. The discriminator between "recurse into this object"
 * and "validate this object as a Token" throughout the parser.
 */
export function isTokenLeaf(obj: unknown): obj is Token {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const rec = obj as Record<string, unknown>;
  return "$value" in rec && "$type" in rec;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/** Validate and normalise one leaf object at `path` into a Token. */
function parseLeaf(path: string, leaf: Record<string, unknown>): Token {
  if (!("$value" in leaf)) throw new TokenError("BAD_TOKEN", `token '${path}' is missing '$value'`);
  if (!("$type" in leaf)) throw new TokenError("BAD_TOKEN", `token '${path}' is missing '$type'`);
  const $type = leaf["$type"];
  if (typeof $type !== "string" || !KNOWN_TYPES.has($type)) {
    throw new TokenError("BAD_TOKEN", `token '${path}' has unknown $type '${String($type)}'`);
  }
  const $value = leaf["$value"];
  if (Array.isArray($value) && !$value.every((v) => typeof v === "string")) {
    throw new TokenError("BAD_TOKEN", `token '${path}' has a non-string entry in its array $value`);
  }
  return {
    $value: $value as Token["$value"],
    $type: $type as TokenType,
    $description: typeof leaf["$description"] === "string" ? leaf["$description"] : undefined,
    $extensions:
      typeof leaf["$extensions"] === "object" && leaf["$extensions"] !== null && !Array.isArray(leaf["$extensions"])
        ? (leaf["$extensions"] as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Recursively walk a category's group to any depth, flattening every nested
 * group into `out` at the top tokenName level — segments below the first join
 * with "-" (PR-FU3-r2 A6). `namePrefix` is "" for a direct child of the
 * category and the joined ancestor chain otherwise; `pathPrefix` is only for
 * error messages (dotted, mirrors the source JSON shape).
 */
function flattenCategory(
  category: string,
  groupVal: Record<string, unknown>,
  namePrefix: string,
  pathPrefix: string,
  out: TokenGroup,
): void {
  for (const [key, val] of Object.entries(groupVal)) {
    const tokenName = namePrefix === "" ? key : `${namePrefix}-${key}`;
    const errorPath = `${pathPrefix}.${key}`;
    if (typeof val !== "object" || val === null || Array.isArray(val)) {
      throw new TokenError("BAD_TOKEN", `token '${errorPath}' must be an object`);
    }
    const rec = val as Record<string, unknown>;
    if ("$value" in rec || "$type" in rec) {
      if (tokenName in out) {
        throw new TokenError("BAD_TOKEN", `token '${category}.${tokenName}' collides with another flattened name from '${errorPath}'`);
      }
      out[tokenName] = parseLeaf(errorPath, rec);
    } else {
      // No $value/$type at this level: a nested group — flatten it into this
      // same category, joining names with "-" (font.family.body → family-body).
      flattenCategory(category, rec, tokenName, errorPath, out);
    }
  }
}

/**
 * Parse a raw JSON.parse result into a validated TokenTree.
 *
 * Validates:
 * - Top level is a non-array object.
 * - Each category value is a non-array object.
 * - Each leaf, at any depth under a category, has a known $type and a $value.
 *
 * A category may nest any depth of sub-groups (PR-FU3-r2 A6); every leaf
 * found is flattened into the category's TokenGroup with its ancestor chain
 * (below the category) joined by "-".
 *
 * Does NOT resolve aliases — call resolveTokens() for that.
 *
 * Throws TokenError with code BAD_JSON or BAD_TOKEN on invalid input.
 */
export function parseTokenFile(json: unknown): TokenTree {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new TokenError("BAD_JSON", "token file must be a JSON object");
  }

  const top = json as Record<string, unknown>;
  const tree: TokenTree = {};

  for (const [category, groupVal] of Object.entries(top)) {
    if (typeof groupVal !== "object" || groupVal === null || Array.isArray(groupVal)) {
      throw new TokenError("BAD_TOKEN", `category '${category}' must be an object`);
    }
    const tokenGroup: TokenGroup = {};
    flattenCategory(category, groupVal as Record<string, unknown>, "", category, tokenGroup);
    tree[category] = tokenGroup;
  }

  return tree;
}
