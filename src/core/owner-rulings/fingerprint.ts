/** Cluster fingerprints (CD-4): SHA-256 over the kind and the sorted, de-duplicated member identities. */
import { createHash } from "node:crypto";
import type { ClusterKind } from "./cluster-kinds.js";

/** Stable member order: plain code-unit comparison, so the order never depends on the locale. */
export function sortedUnique(members: readonly string[]): string[] {
  return [...new Set(members)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function fingerprintOf(kind: ClusterKind, members: readonly string[]): string {
  const h = createHash("sha256");
  h.update(`${kind}\n`);
  for (const m of sortedUnique(members)) h.update(`${m}\n`);
  return h.digest("hex");
}
