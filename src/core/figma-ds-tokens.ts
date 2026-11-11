/**
 * Figma design-system scan → DTCG token tree (deterministic, zero-network).
 *
 * The conversion helpers live in figma-ds-token-values.ts and the per-variable rules in figma-ds-token-leaves.ts;
 * both are re-exported here. This module builds the tree and says, for every variable that is not in it, why:
 * nothing is dropped without a reason.
 *
 * A token path that two variables map to is a collision. It is never resolved here: the caller passes the owner's
 * ruling (`winners`, the id of the variable that keeps the path), and a collision with no ruling leaves every
 * variable of it out of the tree and listed in `collisions`, so a caller that never asks cannot silently keep one.
 *
 * An alias is written only against a variable that is itself written. Variables whose values cannot be written are
 * removed one round at a time until nothing changes, so a chain of aliases never ends in an absent path.
 *
 * This module never touches the filesystem; it is a pure transform.
 */
import { SKIP_REASONS, buildLeaf, failureOf, firstValue, isKeepable, rawLeaf, resolveType, shortValue, typeSkipReason } from "./figma-ds-token-leaves.js";
import type { SkipDetail, SkipReason } from "./figma-ds-token-leaves.js";
import { isAliasValue, pathOf, rawPathOf } from "./figma-ds-token-values.js";
import type { DsVariable, DtcgLeaf, DtcgTree, DtcgType } from "./figma-ds-token-values.js";

export * from "./figma-ds-token-values.js";
export { ALIAS_REASONS, SKIP_REASONS } from "./figma-ds-token-leaves.js";
export type { SkipDetail, SkipReason } from "./figma-ds-token-leaves.js";

export interface PathCollision {
  /** `category.token`. */
  path: string;
  /** The variables that map to it, in scan order. `value` is a short display of the base value, when one fits. */
  variables: { id: string; name: string; collection: string; value: string; aliasOf?: { id: string; name: string; collection: string } }[];
}

export interface BuildOptions {
  /** The collections that are built (default: all). A variable of any other collection is excluded and counted. */
  collections?: ReadonlySet<string>;
  /** Per colliding path, the id of the variable that keeps it; "" keeps none. A path with no entry is unresolved. */
  winners?: ReadonlyMap<string, string>;
  /** Variables the owner chose to keep as raw string tokens although they cannot be typed. */
  keepRaw?: ReadonlySet<string>;
}

export interface TokenBuildResult {
  tree: DtcgTree;
  primitives: number;
  semantics: number;
  /** Variables of the built collections that are not in the tree, for any reason (kept for older callers). */
  skipped: number;
  /** Collisions among the built collections. Empty means nothing collides. */
  collisions: PathCollision[];
  excluded: {
    /** Variables of collections that were not built, per collection, in scan order of first appearance. */
    collections: { name: string; count: number }[];
    /** Variables that lost a collision the owner ruled on. */
    collisionLosers: string[];
    /** Variables of a collision nobody has ruled on yet. */
    collisionUnresolved: string[];
    skipped: Record<SkipReason, string[]>;
  };
  /** Why each variable of a built collection is not a typed token (kept raw ones included), by variable id. */
  skipDetail: Map<string, SkipDetail>;
  /** Variables kept as raw string tokens by the owner's choice. */
  rawKept: string[];
  /** Variable id → `category.token` of the token written for it, for every variable in the tree. */
  pathById: Map<string, string>;
}

/** Removes failing variables one round at a time (every failure judged against the same snapshot) until none fails. */
function settle(candidates: DsVariable[], types: Map<string, DtcgType | null>, detail: Map<string, SkipDetail>): Set<string> {
  const alive = new Set(candidates.map((v) => v.id));
  for (let changed = true; changed;) {
    changed = false;
    const failing: Array<[DsVariable, SkipDetail]> = [];
    for (const v of candidates) {
      if (!alive.has(v.id)) continue;
      const f = failureOf(v, types.get(v.id) as DtcgType, alive);
      if (f !== null) failing.push([v, { reason: f.reason, ...(f.mode === undefined ? {} : { mode: f.mode }), keepable: isKeepable(f.reason, v, f.mode) }]);
    }
    for (const [v, d] of failing) { alive.delete(v.id); detail.set(v.id, d); changed = true; }
  }
  return alive;
}

/** Build the DTCG token tree from ds.json variables. Deterministic; sorted keys. */
export function buildTokensTree(variables: DsVariable[], opts: BuildOptions = {}): TokenBuildResult {
  const byId = new Map(variables.map((v) => [v.id, v]));
  const types = new Map<string, DtcgType | null>();
  for (const v of variables) resolveType(v, byId, types, new Set());

  const outOfScope = new Map<string, number>();
  const scoped: DsVariable[] = [];
  for (const v of variables) {
    if (opts.collections === undefined || opts.collections.has(v.collection ?? "")) scoped.push(v);
    else outOfScope.set(v.collection ?? "", (outOfScope.get(v.collection ?? "") ?? 0) + 1);
  }

  const detail = new Map<string, SkipDetail>();
  const pathOfId = new Map<string, string>();
  const groups = new Map<string, DsVariable[]>();
  for (const v of scoped) {
    const type = types.get(v.id) ?? null;
    if (type === null) {
      const reason = typeSkipReason(v, byId);
      detail.set(v.id, { reason, keepable: isKeepable(reason, v) });
      continue;
    }
    const p = pathOf(v.name, type);
    const dotted = `${p.category}.${p.token}`;
    pathOfId.set(v.id, dotted);
    (groups.get(dotted) ?? groups.set(dotted, []).get(dotted)!).push(v);
  }
  const collisions: PathCollision[] = [...groups].filter(([, vs]) => vs.length > 1)
    .map(([path, vs]) => ({ path, variables: vs.map((v) => {
      // A variable that aliases another variable on its own path has no value of its own there: it cannot keep the path.
      const raw = firstValue(v);
      const target = isAliasValue(raw) && pathOfId.get(raw.id) === path ? byId.get(raw.id) : undefined;
      return { id: v.id, name: v.name, collection: v.collection ?? "", value: shortValue(v), ...(target === undefined ? {} : { aliasOf: { id: target.id, name: target.name, collection: target.collection ?? "" } }) };
    }) }));
  const loserIds = new Set<string>();
  const unresolvedIds = new Set<string>();
  for (const c of collisions) {
    const winner = opts.winners?.get(c.path);
    for (const m of c.variables) {
      if (winner === undefined) unresolvedIds.add(m.id);
      else if (m.id !== winner) loserIds.add(m.id);
    }
  }

  const candidates = scoped.filter((v) => types.get(v.id) !== null && !loserIds.has(v.id) && !unresolvedIds.has(v.id));
  const alive = settle(candidates, types, detail);

  const tree: DtcgTree = {};
  const written = new Map<string, string>();
  const skipped = Object.fromEntries(SKIP_REASONS.map((r) => [r, [] as string[]])) as Record<SkipReason, string[]>;
  const rawKept: string[] = [];
  let primitives = 0;
  let semantics = 0;
  const put = (category: string, token: string, leaf: DtcgLeaf, id: string): void => {
    (tree[category] ??= {})[token] = leaf;
    written.set(id, `${category}.${token}`);
    if (typeof leaf.$value === "string" && /^\{.+\}$/.test(leaf.$value)) semantics++;
    else primitives++;
  };
  // Aliases point only at the typed tokens written below, never at a raw token and never at a variable left out.
  const dottedOf = (id: string): string | undefined => (alive.has(id) ? pathOfId.get(id) : undefined);
  for (const v of scoped) {
    if (alive.has(v.id)) {
      const p = pathOfId.get(v.id) as string;
      const dot = p.indexOf(".");
      put(p.slice(0, dot), p.slice(dot + 1), buildLeaf(v, types.get(v.id) as DtcgType, dottedOf), v.id);
      continue;
    }
    const d = detail.get(v.id);
    if (d === undefined) continue; // a collision loser or an unresolved collision: counted below
    if (d.keepable && opts.keepRaw?.has(v.id) === true) {
      const rp = rawPathOf(v.name, v.id);
      put(rp.category, rp.token, rawLeaf(v), v.id);
      rawKept.push(v.id);
    } else skipped[d.reason].push(v.id);
  }

  const skippedCount = SKIP_REASONS.reduce((n, r) => n + skipped[r].length, 0) + loserIds.size + unresolvedIds.size;
  return {
    tree: sortTree(tree), primitives, semantics, skipped: skippedCount, collisions,
    excluded: { collections: [...outOfScope].map(([name, count]) => ({ name, count })), collisionLosers: [...loserIds], collisionUnresolved: [...unresolvedIds], skipped },
    skipDetail: detail, rawKept, pathById: written,
  };
}

/** Return a copy with category + token keys sorted, for byte-stable output. */
function sortTree(tree: DtcgTree): DtcgTree {
  const out: DtcgTree = {};
  for (const cat of Object.keys(tree).sort()) {
    const group = tree[cat] as Record<string, DtcgLeaf>;
    const sorted: Record<string, DtcgLeaf> = {};
    for (const tok of Object.keys(group).sort()) sorted[tok] = group[tok] as DtcgLeaf;
    out[cat] = sorted;
  }
  return out;
}
