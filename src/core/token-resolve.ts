/**
 * DTCG alias resolver: flattens a TokenTree into a ResolvedMap.
 *
 * Resolution algorithm (per token-taxonomy.md):
 *   1. Flatten tree to ordered (path, Token) pairs.
 *   2. For each token, walk the alias chain until a literal is found.
 *   3. Detect cycles via a per-resolution visited set.
 *   4. Detect dangling refs (alias target not in the tree).
 *   5. Enforce type compatibility (alias must point to same $type).
 *   6. Composite tokens (typography/shadow): each member is validated against
 *      the required $type for that member slot, not the parent composite's type.
 */
import {
  isAlias,
  TokenError,
} from "./token-model.js";
import type { Token, TokenTree, ResolvedMap, ResolvedToken, TokenType } from "./token-model.js";

// ─── Composite member type requirements ──────────────────────────────────────

/**
 * For each composite $type, maps member key names to the $type that member's
 * alias target must have. An alias pointing at a token of the wrong type for
 * that slot is a TYPE_MISMATCH regardless of the alias target's own self-declared
 * type (the slot requirement is what the schema enforces, not the target).
 *
 * Derived from token-taxonomy.md §"What a design token is" and the schema's
 * shadowObject / typographyObject definitions.
 */
const COMPOSITE_MEMBER_TYPES: Record<string, Record<string, TokenType>> = {
  typography: {
    fontFamily:    "fontFamily",
    fontSize:      "dimension",
    fontWeight:    "fontWeight",
    lineHeight:    "number",
    letterSpacing: "dimension",
  },
  shadow: {
    offsetX: "dimension",
    offsetY: "dimension",
    blur:    "dimension",
    spread:  "dimension",
    color:   "color",
  },
};

// ─── Flat index ───────────────────────────────────────────────────────────────

/** Build a flat path→Token lookup from a TokenTree (preserves insertion order). */
function buildIndex(tree: TokenTree): Map<string, Token> {
  const index = new Map<string, Token>();
  for (const [category, group] of Object.entries(tree)) {
    for (const [name, token] of Object.entries(group)) {
      index.set(`${category}.${name}`, token);
    }
  }
  return index;
}

/** Extract the dotted path from an alias string like "{blue.500}" → "blue.500". */
function aliasPath(alias: string): string {
  return alias.slice(1, -1); // strip { }
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a single token's $value to a literal.
 * `startPath` is the original token being resolved (used in error messages).
 * `visited` accumulates the chain to detect cycles.
 */
function resolveValue(
  currentPath: string,
  token: Token,
  index: Map<string, Token>,
  visited: Set<string>,
  startType: TokenType,
): Token["$value"] {
  const v = token.$value;

  // Composite token: resolve each member independently.
  // Each member's alias target must match the required $type for that member
  // slot (e.g. typography.fontSize must alias a dimension token, not a color).
  // The required types come from COMPOSITE_MEMBER_TYPES keyed by the parent
  // composite's $type and the member key name.
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const memberTypeMap = COMPOSITE_MEMBER_TYPES[token.$type] ?? {};
    const resolved: Record<string, unknown> = {};
    for (const [memberKey, memberVal] of Object.entries(v)) {
      if (isAlias(memberVal)) {
        const targetPath = memberVal.slice(1, -1);
        const targetToken = index.get(targetPath);
        if (targetToken === undefined) {
          throw new TokenError(
            "DANGLING_ALIAS",
            `dangling alias: '${memberVal}' in composite member '${currentPath}.${memberKey}' — '${targetPath}' not found`,
          );
        }
        // Validate the alias target's type against the required type for this
        // member slot. If no requirement is defined for this slot, fall back to
        // the target's own type (permissive) so unknown/future composite types
        // don't hard-fail.
        const requiredType: TokenType = memberTypeMap[memberKey] ?? targetToken.$type;
        if (targetToken.$type !== requiredType) {
          throw new TokenError(
            "TYPE_MISMATCH",
            `type mismatch in composite '${currentPath}': member '${memberKey}' requires $type=${requiredType} but '${targetPath}' has $type=${targetToken.$type}`,
          );
        }
        const memberValue = resolveAlias(
          `${currentPath}.${memberKey}`,
          memberVal,
          index,
          new Set(visited),
          requiredType,
        );
        resolved[memberKey] = memberValue;
      } else {
        resolved[memberKey] = memberVal;
      }
    }
    return resolved as Token["$value"];
  }

  // Literal value
  if (!isAlias(v)) return v;

  // Alias: follow the chain
  return resolveAlias(currentPath, v, index, visited, startType);
}

function resolveAlias(
  originPath: string,
  alias: string,
  index: Map<string, Token>,
  visited: Set<string>,
  expectedType: TokenType,
): Token["$value"] {
  const targetPath = aliasPath(alias);

  if (visited.has(targetPath)) {
    throw new TokenError(
      "ALIAS_CYCLE",
      `alias cycle detected: ${originPath} → ${targetPath} (already visited: ${[...visited].join(" → ")})`,
    );
  }

  const target = index.get(targetPath);
  if (target === undefined) {
    throw new TokenError(
      "DANGLING_ALIAS",
      `dangling alias: '${alias}' in token '${originPath}' — '${targetPath}' not found`,
    );
  }

  if (target.$type !== expectedType) {
    throw new TokenError(
      "TYPE_MISMATCH",
      `type mismatch: '${originPath}' ($type=${expectedType}) aliases '${targetPath}' ($type=${target.$type})`,
    );
  }

  const nextVisited = new Set(visited);
  nextVisited.add(targetPath);

  return resolveValue(targetPath, target, index, nextVisited, expectedType);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve all tokens in a TokenTree to literal values.
 *
 * Returns a ResolvedMap: an ordered array of { path, type, value } where
 * value is always a literal (never an alias string).
 *
 * Throws TokenError (ALIAS_CYCLE | DANGLING_ALIAS | TYPE_MISMATCH) on
 * invalid alias graphs.
 */
export function resolveTokens(tree: TokenTree): ResolvedMap {
  const index = buildIndex(tree);
  const result: ResolvedMap = [];

  for (const [category, group] of Object.entries(tree)) {
    for (const [name, token] of Object.entries(group)) {
      const path = `${category}.${name}`;
      const visited = new Set<string>([path]);
      const value = resolveValue(path, token, index, visited, token.$type);
      const resolved: ResolvedToken = { path, type: token.$type, value };
      result.push(resolved);
    }
  }

  return result;
}
