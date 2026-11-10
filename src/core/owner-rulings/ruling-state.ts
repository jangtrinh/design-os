/**
 * The current ruling state of a project, computed in memory: detected project-level clusters, plus what blocked
 * commands left in pending.json, minus what the stored rulings already cover. Read-only — `ui onboard` and the
 * writers (`ui onboard questions`, a blocked command) all start from this one function.
 */
import { applyRulings } from "./apply-rulings.js";
import type { Cluster } from "./cluster.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { readPending, mergePending } from "./pending-store.js";
import { detectProjectClusters } from "./project-detectors.js";
import { readRulingStore } from "./ruling-store.js";
import type { Ruling } from "./ruling-store.js";

export interface RulingState {
  /** Every cluster still open after the rulings were applied, delta clusters included. */
  pending: Cluster[];
  /** Clusters the rulings resolved. */
  resolvedCount: number;
  /** Rulings recorded in the store. */
  recorded: number;
  stale: Ruling[];
  checkedKinds: ClusterKind[];
  /** The candidate set before rulings were applied (what pending.json would be merged from). */
  candidates: Cluster[];
}

/** Throws RulingStoreError when `design/design-dir.json` cannot be read. */
export function computeRulingState(projectDir: string, extra: readonly Cluster[] = [], extraKinds: readonly ClusterKind[] = []): RulingState {
  const store = readRulingStore(projectDir);
  const detection = detectProjectClusters(projectDir);
  const stored = readPending(projectDir).clusters;
  const replace = [...detection.checkedKinds, ...extraKinds];
  const candidates = mergePending(stored, [...detection.clusters, ...extra], replace);
  const applied = applyRulings(candidates, store.rulings, { checkedKinds: replace });
  return {
    pending: applied.pending, resolvedCount: applied.resolved.length, recorded: store.rulings.length,
    stale: applied.stale, checkedKinds: replace as ClusterKind[], candidates,
  };
}
