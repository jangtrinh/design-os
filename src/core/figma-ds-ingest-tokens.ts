/**
 * The token side of the ingest, in the order the questions depend on each other: which collections stay, then which
 * variable keeps a token path two of them map to, then what happens to the variables that cannot become tokens. A
 * question is only raised once the one before it is ruled; the tree is built once all three are.
 */
import { isAliasValue } from "./figma-ds-token-values.js";
import { buildTokensTree } from "./figma-ds-tokens.js";
import type { DsVariable, SkipDetail, TokenBuildResult } from "./figma-ds-tokens.js";
import { withOutcome } from "./figma-ds-ingest-rulings.js";
import type { RulingView } from "./figma-ds-ingest-rulings.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import { figmaCollectionsEmitter } from "./owner-rulings/kind-figma-collections.js";
import type { CollectionsInput } from "./owner-rulings/kind-figma-collections.js";
import { collisionDetections, collisionMember, collisionWinner } from "./owner-rulings/kind-token-path-collision.js";
import { untypeableTokensEmitter } from "./owner-rulings/kind-untypeable-tokens.js";

export interface TokenStage {
  detections: KindDetection[];
  /** The collections that are built. */
  kept: ReadonlySet<string>;
  /** Set only when every question of this side is ruled. */
  built: TokenBuildResult | null;
}

/** Every alias of a variable (any mode), as a target id. */
function aliasTargets(v: DsVariable): string[] {
  const values = v.valuesByMode !== undefined ? Object.values(v.valuesByMode) : [v.value];
  return values.filter(isAliasValue).map((a) => a.id);
}

/** What the collections question reads: counts, collisions between collections, and aliases between them. */
export function collectionsInput(variables: DsVariable[], all: TokenBuildResult): CollectionsInput {
  const names = [...new Set(variables.map((v) => v.collection ?? ""))];
  const byId = new Map(variables.map((v) => [v.id, v]));
  const pairs = new Map<string, { a: string; b: string; paths: number }>();
  for (const c of all.collisions) {
    const cols = [...new Set(c.variables.map((v) => v.collection))].sort();
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      const key = `${cols[i]}\u0000${cols[j]}`;
      const p = pairs.get(key) ?? { a: cols[i] as string, b: cols[j] as string, paths: 0 };
      p.paths++;
      pairs.set(key, p);
    }
  }
  const edges = new Map<string, { from: string; to: string; count: number }>();
  for (const v of variables) for (const id of aliasTargets(v)) {
    const target = byId.get(id);
    const from = v.collection ?? "";
    const to = target?.collection ?? "";
    if (target === undefined || from === to) continue;
    const e = edges.get(`${from}\u0000${to}`) ?? { from, to, count: 0 };
    e.count++;
    edges.set(`${from}\u0000${to}`, e);
  }
  return {
    collections: names.map((name) => ({ name, count: variables.filter((v) => (v.collection ?? "") === name).length })),
    collisions: [...pairs.values()], aliases: [...edges.values()],
  };
}

export function tokenStage(variables: DsVariable[], view: RulingView): TokenStage {
  const detections: KindDetection[] = [];
  const names = [...new Set(variables.map((v) => v.collection ?? ""))];
  let kept: ReadonlySet<string> = new Set(names);
  if (names.length > 1) {
    const det = figmaCollectionsEmitter.detect(collectionsInput(variables, buildTokensTree(variables)));
    if (det !== null) {
      detections.push(det);
      if (!view.ruled(det)) return { detections, kept, built: null };
      kept = new Set(names.filter((n) => view.outcome("figma-collections", n) !== "drop"));
    }
  }
  const among = buildTokensTree(variables, { collections: kept });
  const aliasedBy: Record<string, number> = {};
  for (const v of variables) if (kept.has(v.collection ?? "")) for (const id of aliasTargets(v)) aliasedBy[id] = (aliasedBy[id] ?? 0) + 1;
  const collisions = collisionDetections({ collisions: among.collisions, aliasedBy });
  detections.push(...collisions);
  if (!collisions.every((d) => view.ruled(d))) return { detections, kept, built: null };
  // The ruling names the variable that keeps a path (or none); it never names a collection or a position.
  const winners = new Map<string, string>();
  for (const c of among.collisions) winners.set(c.path, collisionWinner(view.outcome("token-path-collision", collisionMember(c.path, c.variables)) ?? ""));

  const trial = buildTokensTree(variables, { collections: kept, winners });
  const items = variables.filter((v) => trial.skipDetail.has(v.id)).map((v) => {
    const d = trial.skipDetail.get(v.id) as SkipDetail;
    return { id: v.id, name: v.name, reason: d.reason, keepable: d.keepable, ...(d.mode === undefined ? {} : { mode: d.mode }) };
  });
  const untypeable = untypeableTokensEmitter.detect({ items });
  if (untypeable !== null && untypeable.members.length > 0) {
    detections.push(untypeable);
    if (!view.ruled(untypeable)) return { detections, kept, built: null };
  }
  const keepRaw = withOutcome(view, "untypeable-tokens", items.filter((i) => i.keepable).map((i) => i.id), "keep-raw");
  return { detections, kept, built: buildTokensTree(variables, { collections: kept, winners, keepRaw }) };
}
