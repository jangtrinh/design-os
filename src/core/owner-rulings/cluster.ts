/**
 * The cluster: one group of anomalies, one question (FR-001). Built only through `buildCluster`, and only inside
 * this folder: an emitter returns a detection and the kernel turns it into a cluster (see resolve-detections.ts).
 */
import { isRecord } from "../knowledge-promotion-ruling.js";
import { CLUSTER_KIND_TABLE, REVIEW_INDIVIDUALLY, isClusterKind } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { FINGERPRINT, fingerprintOf, sortedUnique } from "./fingerprint.js";

export const MAX_SAMPLES = 5;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

export interface ClusterOption {
  id: string;
  label: string;
  /** What choosing it does, stated as a count (FR-001). */
  consequence: string;
  recommended?: boolean;
  /**
   * Set-valued kinds only: the member identities this option stands for (one option may stand for a group). Over
   * the options other than `review-individually` the lists are disjoint and together equal the cluster's members.
   */
  selects?: string[];
}

export interface Cluster {
  kind: ClusterKind;
  question: string;
  fingerprint: string;
  count: number;
  /** Up to 5 members, sorted. */
  samples: string[];
  /** Every member identity, sorted, NFC: the governing-ruling rule and the per-member sheet read it. */
  members: string[];
  options: ClusterOption[];
  /** A JSON value the kind's own answer check reads; the kernel stores it and never looks inside. */
  evidence?: unknown;
  /** Set when the cluster holds only the members that no earlier ruling governs. */
  delta?: true;
}

export interface ClusterInput {
  kind: ClusterKind;
  question: string;
  members: readonly string[];
  options: readonly ClusterOption[];
  evidence?: unknown;
  delta?: true;
}

/** Recommended options first (stable); `review individually`, when present, stays last. */
function orderOptions(options: readonly ClusterOption[]): ClusterOption[] {
  const review = options.filter((o) => o.id === REVIEW_INDIVIDUALLY);
  const rest = options.filter((o) => o.id !== REVIEW_INDIVIDUALLY);
  return [...rest.filter((o) => o.recommended === true), ...rest.filter((o) => o.recommended !== true), ...review];
}

/** The reason an option set cannot stand for these members, or null. Single-choice kinds carry no selects. */
function selectsProblem(kind: ClusterKind, members: readonly string[], options: readonly ClusterOption[]): string | null {
  const real = options.filter((o) => o.id !== REVIEW_INDIVIDUALLY);
  if (!CLUSTER_KIND_TABLE[kind].setValued) {
    return options.some((o) => o.selects !== undefined) ? `cluster '${kind}' is single-choice: its options carry no selects` : null;
  }
  if (options.some((o) => o.id === REVIEW_INDIVIDUALLY && o.selects !== undefined)) return `cluster '${kind}': ${REVIEW_INDIVIDUALLY} carries no selects`;
  if (real.some((o) => o.selects === undefined)) return `cluster '${kind}' is set-valued: every option needs selects`;
  const seen = new Set<string>();
  for (const o of real) {
    for (const m of sortedUnique(o.selects ?? [])) {
      if (!members.includes(m)) return `cluster '${kind}': option '${o.id}' selects '${m}', which is not a member`;
      if (seen.has(m)) return `cluster '${kind}': the selects of the options must be disjoint ('${m}' appears twice)`;
      seen.add(m);
    }
  }
  const missing = members.find((m) => !seen.has(m));
  return missing === undefined ? null : `cluster '${kind}': the selects must together cover every member ('${missing}' is in no option)`;
}

/** Throws on a cluster the spec forbids: no members, 2-4 options, unique option ids, selects that do not partition. */
export function buildCluster(input: ClusterInput): Cluster {
  const members = sortedUnique(input.members);
  if (members.length === 0) throw new Error(`cluster '${input.kind}' has no members`);
  if (input.options.length < MIN_OPTIONS || input.options.length > MAX_OPTIONS) {
    throw new Error(`cluster '${input.kind}' needs ${MIN_OPTIONS}-${MAX_OPTIONS} options, got ${input.options.length}`);
  }
  if (new Set(input.options.map((o) => o.id)).size !== input.options.length) {
    throw new Error(`cluster '${input.kind}' has a repeated option id`);
  }
  const problem = selectsProblem(input.kind, members, input.options);
  if (problem !== null) throw new Error(problem);
  const options = orderOptions(input.options).map((o) => (o.selects === undefined ? o : { ...o, selects: sortedUnique(o.selects) }));
  return {
    kind: input.kind,
    question: input.question,
    fingerprint: fingerprintOf(input.kind, members),
    count: members.length,
    samples: members.slice(0, MAX_SAMPLES),
    members,
    options,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.delta === true ? { delta: true as const } : {}),
  };
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Reads a cluster from a stored file in full: the cluster, or the first thing that is wrong with it. */
export function parseStoredCluster(raw: unknown): Cluster | string {
  if (!isRecord(raw)) return "a cluster is not an object";
  const { kind, question, members, options, fingerprint, count, samples, evidence, delta } = raw;
  if (!isClusterKind(kind)) return "a cluster has an unknown kind";
  if (typeof question !== "string") return `cluster '${kind}' needs a question string`;
  if (!isStrings(members) || members.length === 0) return `cluster '${kind}' needs a non-empty list of string members`;
  if (!Array.isArray(options)) return `cluster '${kind}' needs an options list`;
  const parsed: ClusterOption[] = [];
  for (const o of options) {
    if (!isRecord(o) || typeof o["id"] !== "string" || typeof o["label"] !== "string" || typeof o["consequence"] !== "string") {
      return `cluster '${kind}' has an option without string id, label and consequence`;
    }
    if (o["selects"] !== undefined && !isStrings(o["selects"])) return `cluster '${kind}' has an option whose selects is not a list of strings`;
    if (o["recommended"] !== undefined && typeof o["recommended"] !== "boolean") return `cluster '${kind}' has an option whose recommended is not a boolean`;
    parsed.push({ id: o["id"], label: o["label"], consequence: o["consequence"], ...(o["recommended"] === true ? { recommended: true } : {}), ...(o["selects"] === undefined ? {} : { selects: o["selects"] }) });
  }
  if (delta !== undefined && delta !== true) return `cluster '${kind}' has a malformed delta flag`;
  let built: Cluster;
  try { built = buildCluster({ kind, question, members, options: parsed, evidence, ...(delta === true ? { delta: true as const } : {}) }); }
  catch (e) { return e instanceof Error ? e.message : "a cluster is malformed"; }
  if (typeof fingerprint !== "string" || !FINGERPRINT.test(fingerprint) || fingerprint !== built.fingerprint) {
    return `cluster '${kind}': the fingerprint does not match its members`;
  }
  if (count !== built.count) return `cluster '${kind}': count ${String(count)} does not match its ${built.count} members`;
  if (members.length !== built.members.length || members.some((m, i) => m !== built.members[i])) return `cluster '${kind}': members must be sorted, unique and NFC`;
  if (!isStrings(samples) || samples.length !== built.samples.length || samples.some((s, i) => s !== built.samples[i])) return `cluster '${kind}': samples do not match its members`;
  if (parsed.some((o, i) => o.id !== built.options[i]?.id)) return `cluster '${kind}': options are not in the stored order (recommended first, review individually last)`;
  return built;
}
