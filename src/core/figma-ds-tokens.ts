/**
 * Figma design-system scan → DTCG token tree (deterministic, zero-network).
 *
 * The conversion helpers live in figma-ds-token-values.ts and are re-exported here. This module builds the tree and
 * says, for every variable that is not in it, why: nothing is dropped without a reason.
 *
 * A token path that two variables map to is a collision. It is never resolved here: the caller passes the owner's
 * ruling (`winners`), and a collision with no ruling leaves every variable of it out of the tree and listed in
 * `collisions`, so a caller that never asks cannot silently keep one of them.
 *
 * This module never touches the filesystem; it is a pure transform.
 */
import { colorToHex, inferDtcgType, isAliasValue, literalValue, pathOf, pickBaseMode, rawPathOf, sanitizeSeg } from "./figma-ds-token-values.js";
import type { DsVariable, DtcgLeaf, DtcgTree, DtcgType } from "./figma-ds-token-values.js";

export * from "./figma-ds-token-values.js";

/** Why a variable is left out of the tree (a collision is its own thing: see `collisions`). */
export const SKIP_REASONS = ["unmappable-type", "null-leaf", "dangling-alias", "alias-cycle", "bad-colour"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface PathCollision {
  /** `category.token`. */
  path: string;
  /** The variables that map to it, in scan order. */
  variables: { id: string; collection: string }[];
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
  /** Variables kept as raw string tokens by the owner's choice. */
  rawKept: string[];
  /** Variable id → `category.token` of the token written for it, for every variable in the tree. */
  pathById: Map<string, string>;
}

/** The value used for tier/type detection: the base mode's value, else the flat `value`. */
function firstValue(v: DsVariable): unknown {
  if (v.valuesByMode !== undefined) {
    const base = pickBaseMode(Object.keys(v.valuesByMode));
    if (base !== undefined) return v.valuesByMode[base];
  }
  return v.value;
}

/** Resolve a variable's DTCG $type, following alias chains to the target's type. */
function resolveType(v: DsVariable, byId: Map<string, DsVariable>, memo: Map<string, DtcgType | null>, seen: Set<string>): DtcgType | null {
  if (memo.has(v.id)) return memo.get(v.id) ?? null;
  const direct = firstValue(v);
  if (isAliasValue(direct)) {
    if (seen.has(v.id)) return null; // cycle
    seen.add(v.id);
    const target = byId.get(direct.id);
    const t = target !== undefined ? resolveType(target, byId, memo, seen) : null;
    memo.set(v.id, t);
    return t;
  }
  const t = inferDtcgType(v.name, v.type);
  memo.set(v.id, t);
  return t;
}

/** Why a variable has no DTCG type: follow its alias chain to the end. */
function typeSkipReason(v: DsVariable, byId: Map<string, DsVariable>): SkipReason {
  const seen = new Set<string>();
  let cur = v;
  for (;;) {
    const val = firstValue(cur);
    if (!isAliasValue(val)) return "unmappable-type";
    if (seen.has(cur.id)) return "alias-cycle";
    seen.add(cur.id);
    const next = byId.get(val.id);
    if (next === undefined) return "dangling-alias";
    cur = next;
  }
}

type Leaf = { leaf: DtcgLeaf } | { reason: SkipReason };

/** Convert one variable (all its modes) into a DTCG leaf, or say why the base value is unusable. */
function buildLeaf(v: DsVariable, type: DtcgType, pathById: Map<string, string>, selfDotted: string): Leaf {
  let failure: SkipReason = "null-leaf";
  const toValue = (raw: unknown): string | number | null => {
    if (isAliasValue(raw)) {
      const target = pathById.get(raw.id);
      if (target === undefined) { failure = "dangling-alias"; return null; }
      // A self-referential alias (own id, or a distinct Figma var that collapsed to the same DTCG path) has no
      // resolvable value and would make the whole token file unresolvable ("alias cycle detected").
      if (target === selfDotted) { failure = "alias-cycle"; return null; }
      return `{${target}}`;
    }
    const lit = literalValue(type, raw);
    if (lit === null) failure = type === "color" && raw !== null && raw !== undefined && colorToHex(raw) === null ? "bad-colour" : "null-leaf";
    return lit;
  };

  const modeEntries: Array<[string, unknown]> = v.valuesByMode !== undefined ? Object.entries(v.valuesByMode) : [["", v.value]];
  const base = pickBaseMode(modeEntries.map(([m]) => m)) ?? "";
  const baseVal = toValue(modeEntries.find(([m]) => m === base)?.[1]);
  if (baseVal === null) return { reason: failure };

  const leaf: DtcgLeaf = { $value: baseVal, $type: type };
  const extensions: Record<string, unknown> = {};
  for (const [mode, raw] of modeEntries) {
    if (mode === base || mode === "") continue;
    const mv = toValue(raw);
    if (mv !== null) extensions[`mode.${sanitizeSeg(mode)}`] = { $value: mv };
  }
  if (Object.keys(extensions).length > 0) leaf.$extensions = extensions;
  return { leaf };
}

/** A raw string token for a variable the owner chose to keep although it cannot be typed. */
function rawLeaf(v: DsVariable): DtcgLeaf {
  const raw = firstValue(v);
  return { $value: typeof raw === "string" ? raw : JSON.stringify(raw ?? null), $type: "string", $description: `kept raw from Figma ${v.type}` };
}

/** Build the DTCG token tree from ds.json variables. Deterministic; sorted keys. */
export function buildTokensTree(variables: DsVariable[], opts: BuildOptions = {}): TokenBuildResult {
  const byId = new Map(variables.map((v) => [v.id, v]));
  const typeMemo = new Map<string, DtcgType | null>();
  for (const v of variables) resolveType(v, byId, typeMemo, new Set());

  const inScope = (v: DsVariable): boolean => opts.collections === undefined || opts.collections.has(v.collection ?? "");
  const outOfScope = new Map<string, number>();
  const scoped: DsVariable[] = [];
  for (const v of variables) {
    if (inScope(v)) scoped.push(v);
    else outOfScope.set(v.collection ?? "", (outOfScope.get(v.collection ?? "") ?? 0) + 1);
  }

  // Paths of every typed variable that is built; a collision is two of them on one path.
  const pathById = new Map<string, { category: string; token: string }>();
  for (const v of scoped) {
    const t = typeMemo.get(v.id) ?? null;
    if (t !== null) pathById.set(v.id, pathOf(v.name, t));
  }
  const dottedOf = (id: string): string | undefined => { const p = pathById.get(id); return p === undefined ? undefined : `${p.category}.${p.token}`; };
  // An alias whose target maps to its own path adds nothing (it would be `{itself}`): a cycle, not a collision.
  const selfAliasIds = new Set<string>();
  const groups = new Map<string, DsVariable[]>();
  for (const v of scoped) {
    const own = dottedOf(v.id);
    if (own === undefined) continue;
    const raw = firstValue(v);
    if (isAliasValue(raw) && dottedOf(raw.id) === own) { selfAliasIds.add(v.id); continue; }
    (groups.get(own) ?? groups.set(own, []).get(own)!).push(v);
  }
  const collisions: PathCollision[] = [...groups].filter(([, vs]) => vs.length > 1)
    .map(([path, vs]) => ({ path, variables: vs.map((v) => ({ id: v.id, collection: v.collection ?? "" })) }));
  const loserIds = new Set<string>();
  const unresolvedIds = new Set<string>();
  for (const c of collisions) {
    const winner = opts.winners?.get(c.path);
    for (const m of c.variables) {
      if (winner === undefined) unresolvedIds.add(m.id);
      else if (m.id !== winner) loserIds.add(m.id);
    }
  }

  const dottedById = new Map<string, string>();
  for (const [id, p] of pathById) dottedById.set(id, `${p.category}.${p.token}`);
  const tree: DtcgTree = {};
  const excludedSkipped = Object.fromEntries(SKIP_REASONS.map((r) => [r, [] as string[]])) as Record<SkipReason, string[]>;
  const writtenPath = new Map<string, string>();
  const rawKept: string[] = [];
  let primitives = 0;
  let semantics = 0;
  const put = (category: string, token: string, leaf: DtcgLeaf, id: string): void => {
    (tree[category] ??= {})[token] = leaf;
    writtenPath.set(id, `${category}.${token}`);
    if (typeof leaf.$value === "string" && /^\{.+\}$/.test(leaf.$value)) semantics++;
    else primitives++;
  };

  for (const v of scoped) {
    if (loserIds.has(v.id) || unresolvedIds.has(v.id)) continue;
    if (selfAliasIds.has(v.id)) {
      if (opts.keepRaw?.has(v.id) === true) { const rp = rawPathOf(v.name, v.id); put(rp.category, rp.token, rawLeaf(v), v.id); rawKept.push(v.id); }
      else excludedSkipped["alias-cycle"].push(v.id);
      continue;
    }
    const type = typeMemo.get(v.id) ?? null;
    const path = pathById.get(v.id);
    if (type === null || path === undefined) {
      if (opts.keepRaw?.has(v.id) === true) { const rp = rawPathOf(v.name, v.id); put(rp.category, rp.token, rawLeaf(v), v.id); rawKept.push(v.id); }
      else excludedSkipped[typeSkipReason(v, byId)].push(v.id);
      continue;
    }
    const built = buildLeaf(v, type, dottedById, `${path.category}.${path.token}`);
    if ("reason" in built) {
      if (opts.keepRaw?.has(v.id) === true) { const rp = rawPathOf(v.name, v.id); put(rp.category, rp.token, rawLeaf(v), v.id); rawKept.push(v.id); }
      else excludedSkipped[built.reason].push(v.id);
      continue;
    }
    put(path.category, path.token, built.leaf, v.id);
  }

  const skipped = SKIP_REASONS.reduce((n, r) => n + excludedSkipped[r].length, 0) + loserIds.size + unresolvedIds.size;
  return {
    tree: sortTree(tree), primitives, semantics, skipped, collisions,
    excluded: {
      collections: [...outOfScope].map(([name, count]) => ({ name, count })),
      collisionLosers: [...loserIds], collisionUnresolved: [...unresolvedIds], skipped: excludedSkipped,
    },
    rawKept, pathById: writtenPath,
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
