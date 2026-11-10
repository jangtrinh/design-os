/** The cluster: one group of anomalies, one question (FR-001). Built only through `buildCluster`. */
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { fingerprintOf, sortedUnique } from "./fingerprint.js";

export const MAX_SAMPLES = 5;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

export interface ClusterOption {
  id: string;
  label: string;
  /** What choosing it does, stated as a count (FR-001). */
  consequence: string;
  recommended?: boolean;
}

export interface Cluster {
  kind: ClusterKind;
  question: string;
  fingerprint: string;
  count: number;
  /** Up to 5 members, sorted. */
  samples: string[];
  /** Every member identity, sorted: the subset rule and the per-member sheet read it (FR-006). */
  members: string[];
  options: ClusterOption[];
  /** Set when the cluster holds only the members that no earlier ruling covered (FR-006). */
  delta?: true;
}

export interface ClusterInput {
  kind: ClusterKind;
  question: string;
  members: readonly string[];
  options: readonly ClusterOption[];
}

/** Recommended options first (stable); `review individually`, when present, stays last. */
function orderOptions(options: readonly ClusterOption[]): ClusterOption[] {
  const review = options.filter((o) => o.id === REVIEW_INDIVIDUALLY);
  const rest = options.filter((o) => o.id !== REVIEW_INDIVIDUALLY);
  return [...rest.filter((o) => o.recommended === true), ...rest.filter((o) => o.recommended !== true), ...review];
}

/** Throws on a cluster the spec forbids: no members, 2–4 options, unique option ids. */
export function buildCluster(input: ClusterInput): Cluster {
  const members = sortedUnique(input.members);
  if (members.length === 0) throw new Error(`cluster '${input.kind}' has no members`);
  if (input.options.length < MIN_OPTIONS || input.options.length > MAX_OPTIONS) {
    throw new Error(`cluster '${input.kind}' needs ${MIN_OPTIONS}-${MAX_OPTIONS} options, got ${input.options.length}`);
  }
  if (new Set(input.options.map((o) => o.id)).size !== input.options.length) {
    throw new Error(`cluster '${input.kind}' has a repeated option id`);
  }
  return {
    kind: input.kind,
    question: input.question,
    fingerprint: fingerprintOf(input.kind, members),
    count: members.length,
    samples: members.slice(0, MAX_SAMPLES),
    members,
    options: orderOptions(input.options),
  };
}

/** The same question over fewer members: the new fingerprint, count and samples; options unchanged. */
export function reshapeCluster(cluster: Cluster, members: readonly string[]): Cluster {
  const next = buildCluster({ kind: cluster.kind, question: cluster.question, members, options: cluster.options });
  return { ...next, delta: true };
}
