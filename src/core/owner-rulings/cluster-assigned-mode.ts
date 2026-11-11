/**
 * The assigned mode of a single-choice cluster (each option gives every member its own outcome), kept apart from the
 * cluster builder: the check that a cluster is plain or assigned and never a mix, the NFC re-keying of member maps, and
 * the reader of a stored `memberChoices`.
 */
import { isRecord } from "../knowledge-promotion-ruling.js";
import type { ClusterInput, ClusterOption, MemberChoice } from "./cluster.js";
import { CLUSTER_KIND_TABLE, REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";

const sameKeySet = (map: Record<string, unknown>, members: readonly string[]): boolean => {
  const keys = Object.keys(map).map((k) => k.normalize("NFC"));
  return new Set(keys).size === members.length && members.every((m) => keys.includes(m));
};

/**
 * Single-choice clusters are plain (no assigns, no memberChoices) or assigned (memberChoices over exactly the members,
 * every option but `review individually` assigning each member one of its choices). A mix is refused.
 */
export function modeProblem(kind: ClusterKind, members: readonly string[], options: readonly ClusterOption[], memberChoices: ClusterInput["memberChoices"]): string | null {
  const anyAssigns = options.some((o) => o.assigns !== undefined);
  if (CLUSTER_KIND_TABLE[kind].setValued) {
    return anyAssigns || memberChoices !== undefined ? `cluster '${kind}' is set-valued: it carries neither assigns nor memberChoices` : null;
  }
  if (!anyAssigns && memberChoices === undefined) return null;
  if (memberChoices === undefined) return `cluster '${kind}' mixes plain and assigned options: options carry assigns but there is no memberChoices`;
  if (!sameKeySet(memberChoices, members)) return `cluster '${kind}' is assigned: memberChoices must cover exactly its members`;
  const choiceIds = new Map<string, Set<string>>();
  for (const [m, list] of Object.entries(memberChoices)) {
    if (list.length === 0 || new Set(list.map((c) => c.id)).size !== list.length || list.some((c) => c.id === "" || c.id === REVIEW_INDIVIDUALLY)) {
      return `cluster '${kind}' is assigned: member '${m}' needs at least one choice with distinct ids`;
    }
    choiceIds.set(m.normalize("NFC"), new Set(list.map((c) => c.id)));
  }
  for (const o of options) {
    if (o.id === REVIEW_INDIVIDUALLY) {
      if (o.assigns !== undefined) return `cluster '${kind}' is assigned: '${REVIEW_INDIVIDUALLY}' carries no assigns`;
      continue;
    }
    if (o.assigns === undefined) return `cluster '${kind}' mixes plain and assigned options: '${o.id}' has no assigns`;
    if (!sameKeySet(o.assigns, members)) return `cluster '${kind}': the assigns of '${o.id}' must cover exactly its members`;
    for (const [m, v] of Object.entries(o.assigns)) {
      if (choiceIds.get(m.normalize("NFC"))?.has(v) !== true) return `cluster '${kind}': '${o.id}' assigns '${v}' to '${m}', which is not one of that member's choices`;
    }
  }
  return null;
}

/** Re-keys a member map in sorted NFC member order, so the stored form never depends on insertion order. */
export function sortedKeys<T>(map: Record<string, T>, members: readonly string[]): Record<string, T> {
  const nfc = new Map(Object.entries(map).map(([k, v]) => [k.normalize("NFC"), v]));
  return Object.fromEntries(members.filter((m) => nfc.has(m)).map((m) => [m, nfc.get(m) as T]));
}


export const isStringMap = (v: unknown): v is Record<string, string> => isRecord(v) && Object.values(v).every((x) => typeof x === "string");

export function parseMemberChoices(raw: unknown): Record<string, MemberChoice[]> | undefined | string {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return "has memberChoices that is not an object";
  const out: Record<string, MemberChoice[]> = {};
  for (const [m, list] of Object.entries(raw)) {
    if (!Array.isArray(list) || !list.every((c) => isRecord(c) && typeof c["id"] === "string" && typeof c["label"] === "string")) {
      return `has memberChoices for '${m}' that is not a list of { id, label }`;
    }
    out[m] = list.map((c) => ({ id: (c as Record<string, string>)["id"] as string, label: (c as Record<string, string>)["label"] as string }));
  }
  return out;
}
