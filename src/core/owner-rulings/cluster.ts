/**
 * The cluster: one group of anomalies, one question (FR-001). Built only through `buildCluster`, and only inside
 * this folder: an emitter returns a detection and the kernel turns it into a cluster (see resolve-detections.ts).
 */
import { isRecord } from "../knowledge-promotion-ruling.js";
import { CLUSTER_KIND_TABLE, REVIEW_INDIVIDUALLY, isClusterKind } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { isStringMap, modeProblem, parseMemberChoices, sortedKeys } from "./cluster-assigned-mode.js";
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
   * the options the lists are disjoint and together equal the cluster's members. An empty list is an option that
   * keeps none of them.
   */
  selects?: string[];
  /**
   * Single-choice kinds in assigned mode: the outcome each member takes when this option is chosen. Covers exactly
   * the cluster's members; each value is one of that member's `memberChoices`.
   */
  assigns?: Record<string, string>;
}

/** One outcome a member of an assigned single-choice cluster may take. */
export interface MemberChoice { id: string; label: string }

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
  /** Assigned mode only (single-choice kinds): per member, the outcomes it may take. */
  memberChoices?: Record<string, MemberChoice[]>;
  /** Display label per member (keys are members): every place that prints a member prints `label (id)`. */
  labels?: Record<string, string>;
  /** Set when the cluster holds only the members that no earlier ruling governs. */
  delta?: true;
  /** The command that raised it: a command replaces only the stored questions it raised itself. */
  raisedBy: string;
}

export interface ClusterInput {
  kind: ClusterKind;
  question: string;
  members: readonly string[];
  options: readonly ClusterOption[];
  evidence?: unknown;
  delta?: true;
  raisedBy?: string;
  memberChoices?: Record<string, readonly MemberChoice[]>;
  labels?: Record<string, string>;
}

/** Recommended options first (stable); `review individually`, when present, stays last. */
function orderOptions(options: readonly ClusterOption[]): ClusterOption[] {
  const review = options.filter((o) => o.id === REVIEW_INDIVIDUALLY);
  const rest = options.filter((o) => o.id !== REVIEW_INDIVIDUALLY);
  return [...rest.filter((o) => o.recommended === true), ...rest.filter((o) => o.recommended !== true), ...review];
}

/** The reason an option set cannot stand for these members, or null. Single-choice kinds carry no selects. */
function selectsProblem(kind: ClusterKind, members: readonly string[], options: readonly ClusterOption[]): string | null {
  if (!CLUSTER_KIND_TABLE[kind].setValued) {
    return options.some((o) => o.selects !== undefined) ? `cluster '${kind}' is single-choice: its options carry no selects` : null;
  }
  // The per-member answer is always available without an option, so no slot is spent on it.
  if (options.some((o) => o.id === REVIEW_INDIVIDUALLY)) return `cluster '${kind}' is set-valued: ${REVIEW_INDIVIDUALLY} is not an option (a per-member answer is always accepted)`;
  if (options.some((o) => o.selects === undefined)) return `cluster '${kind}' is set-valued: every option needs selects`;
  const memberSet = new Set(members);
  const seen = new Set<string>();
  for (const o of options) {
    for (const m of sortedUnique(o.selects ?? [])) {
      if (!memberSet.has(m)) return `cluster '${kind}': option '${o.id}' selects '${m}', which is not a member`;
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
  const problem = selectsProblem(input.kind, members, input.options) ?? modeProblem(input.kind, members, input.options, input.memberChoices);
  if (problem !== null) throw new Error(problem);
  if (input.labels !== undefined) {
    const stray = Object.keys(input.labels).find((k) => !members.includes(k.normalize("NFC")));
    if (stray !== undefined) throw new Error(`cluster '${input.kind}': a label names '${stray}', which is not a member`);
  }
  const options = orderOptions(input.options).map((o) => {
    const withSelects = o.selects === undefined ? o : { ...o, selects: sortedUnique(o.selects) };
    return withSelects.assigns === undefined ? withSelects : { ...withSelects, assigns: sortedKeys(withSelects.assigns, members) };
  });
  return {
    kind: input.kind,
    question: input.question,
    fingerprint: fingerprintOf(input.kind, members),
    count: members.length,
    samples: members.slice(0, MAX_SAMPLES),
    members,
    options,
    ...(input.memberChoices === undefined ? {} : { memberChoices: sortedKeys(Object.fromEntries(Object.entries(input.memberChoices).map(([m, l]) => [m, l.map((c) => ({ id: c.id, label: c.label }))])), members) }),
    ...(input.labels === undefined ? {} : { labels: sortedKeys(input.labels, members) }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.delta === true ? { delta: true as const } : {}),
    raisedBy: input.raisedBy ?? "",
  };
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Reads a cluster from a stored file in full: the cluster, or the first thing that is wrong with it. */
export function parseStoredCluster(raw: unknown): Cluster | string {
  if (!isRecord(raw)) return "a cluster is not an object";
  const { kind, question, members, options, fingerprint, count, samples, evidence, delta, raisedBy, memberChoices, labels } = raw;
  if (!isClusterKind(kind)) return "a cluster has an unknown kind";
  if (typeof question !== "string") return `cluster '${kind}' needs a question string`;
  if (typeof raisedBy !== "string" || raisedBy === "") return `cluster '${kind}' needs a non-empty raisedBy string (the command that raised it)`;
  if (!isStrings(members) || members.length === 0) return `cluster '${kind}' needs a non-empty list of string members`;
  if (!Array.isArray(options)) return `cluster '${kind}' needs an options list`;
  const parsed: ClusterOption[] = [];
  for (const o of options) {
    if (!isRecord(o) || typeof o["id"] !== "string" || typeof o["label"] !== "string" || typeof o["consequence"] !== "string") {
      return `cluster '${kind}' has an option without string id, label and consequence`;
    }
    if (o["selects"] !== undefined && !isStrings(o["selects"])) return `cluster '${kind}' has an option whose selects is not a list of strings`;
    if (o["assigns"] !== undefined && !isStringMap(o["assigns"])) return `cluster '${kind}' has an option whose assigns is not a map of strings`;
    if (o["recommended"] !== undefined && typeof o["recommended"] !== "boolean") return `cluster '${kind}' has an option whose recommended is not a boolean`;
    parsed.push({ id: o["id"], label: o["label"], consequence: o["consequence"], ...(o["recommended"] === true ? { recommended: true } : {}), ...(o["selects"] === undefined ? {} : { selects: o["selects"] }), ...(o["assigns"] === undefined ? {} : { assigns: o["assigns"] }) });
  }
  const choices = parseMemberChoices(memberChoices);
  if (typeof choices === "string") return `cluster '${kind}' ${choices}`;
  if (labels !== undefined && !isStringMap(labels)) return `cluster '${kind}' has labels that are not a map of strings`;
  if (delta !== undefined && delta !== true) return `cluster '${kind}' has a malformed delta flag`;
  let built: Cluster;
  try { built = buildCluster({ kind, question, members, options: parsed, evidence, raisedBy, ...(choices === undefined ? {} : { memberChoices: choices }), ...(labels === undefined ? {} : { labels: labels as Record<string, string> }), ...(delta === true ? { delta: true as const } : {}) }); }
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
