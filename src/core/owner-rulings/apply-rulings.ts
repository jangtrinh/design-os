/**
 * Applies stored rulings to freshly detected clusters (FR-006).
 *
 * A member is "ruled" when some ruling of the same kind lists it in `covers`. A cluster whose members are all
 * ruled is resolved; one that is partly ruled shrinks to a delta cluster holding only the new members; one that
 * is not ruled at all stays as it is. A ruling is reported `stale` (never deleted) when its kind was checked in
 * this run and none of the members it covered exist any more.
 */
import { reshapeCluster } from "./cluster.js";
import type { Cluster } from "./cluster.js";
import type { ClusterKind } from "./cluster-kinds.js";
import type { Ruling } from "./ruling-store.js";

export interface ApplyOptions {
  /** Kinds whose detection ran in this call; staleness is only judged for these. */
  checkedKinds: readonly ClusterKind[];
  /** Rebuilds a cluster over fewer members; defaults to keeping the options as they are. */
  reshape?: (cluster: Cluster, members: string[]) => Cluster;
}

export interface ApplyResult {
  resolved: { cluster: Cluster; rulings: Ruling[] }[];
  pending: Cluster[];
  stale: Ruling[];
}

export function applyRulings(clusters: readonly Cluster[], rulings: readonly Ruling[], options: ApplyOptions): ApplyResult {
  const reshape = options.reshape ?? reshapeCluster;
  const resolved: ApplyResult["resolved"] = [];
  const pending: Cluster[] = [];

  for (const cluster of clusters) {
    const same = rulings.filter((r) => r.kind === cluster.kind);
    const ruled = new Set(same.flatMap((r) => r.covers));
    const fresh = cluster.members.filter((m) => !ruled.has(m));
    if (fresh.length === cluster.members.length) pending.push(cluster);
    else if (fresh.length > 0) pending.push(reshape(cluster, fresh));
    else resolved.push({ cluster, rulings: same.filter((r) => r.covers.some((m) => cluster.members.includes(m))) });
  }

  const stale = rulings.filter((r) => {
    if (!options.checkedKinds.includes(r.kind) || r.covers.length === 0) return false;
    const present = new Set(clusters.filter((c) => c.kind === r.kind).flatMap((c) => c.members));
    return !r.covers.some((m) => present.has(m));
  });
  return { resolved, pending, stale };
}
