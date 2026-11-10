/**
 * Validates an answers file against the pending clusters (FR-005) and turns it into rulings.
 * All-or-nothing: the first problem refuses the whole file, so a refused answer writes nothing.
 */
import type { Cluster } from "./cluster.js";
import { CLUSTER_KIND_TABLE, REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import type { Ruling } from "./ruling-store.js";

export type AnswerErrorCode = "STALE_ANSWER" | "BAD_ANSWER" | "DANGLING_AFTER_SELECTION";
export interface AnswerRefusal { ok: false; code: AnswerErrorCode; message: string }
export interface AnswerAccepted { ok: true; rulings: Ruling[]; answered: Cluster[] }

/** A per-kind check of a chosen set, e.g. aliases left dangling by a collection selection. Returns the reason to refuse, or null. */
export type ChoiceCheck = (cluster: Cluster, choice: string | string[]) => string | null;
const choiceChecks = new Map<ClusterKind, ChoiceCheck>();

export function registerChoiceCheck(kind: ClusterKind, check: ChoiceCheck): void {
  choiceChecks.set(kind, check);
}
/** Test seam. */
export function clearChoiceChecks(): void {
  choiceChecks.clear();
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const refuse = (code: AnswerErrorCode, message: string): AnswerRefusal => ({ ok: false, code, message });
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

function checkChoice(cluster: Cluster, choice: unknown): AnswerRefusal | null {
  const ids = cluster.options.map((o) => o.id);
  const label = `${cluster.kind} (${cluster.fingerprint.slice(0, 12)})`;
  if (CLUSTER_KIND_TABLE[cluster.kind].setValued) {
    if (!Array.isArray(choice)) return refuse("BAD_ANSWER", `${label} is a multi-select question: choice must be a list of option ids`);
    if (choice.length === 0 || !choice.every((c) => typeof c === "string" && ids.includes(c)) || new Set(choice).size !== choice.length) {
      return refuse("BAD_ANSWER", `${label}: choice must be distinct option ids from [${ids.join(", ")}]`);
    }
    return null;
  }
  if (typeof choice !== "string") return refuse("BAD_ANSWER", `${label} is a single-choice question: choice must be one option id, not a list`);
  if (!ids.includes(choice)) return refuse("BAD_ANSWER", `${label}: '${choice}' is not one of [${ids.join(", ")}]`);
  return null;
}

function checkMembers(cluster: Cluster, choice: string | string[], members: unknown): AnswerRefusal | null {
  const label = `${cluster.kind} (${cluster.fingerprint.slice(0, 12)})`;
  if (choice !== REVIEW_INDIVIDUALLY) {
    return members === undefined ? null : refuse("BAD_ANSWER", `${label}: members is only valid after '${REVIEW_INDIVIDUALLY}'`);
  }
  const perMember = cluster.options.map((o) => o.id).filter((id) => id !== REVIEW_INDIVIDUALLY);
  if (!isRecord(members) || !sameSet(Object.keys(members), cluster.members)) {
    return refuse("BAD_ANSWER", `${label}: '${REVIEW_INDIVIDUALLY}' needs a members map with exactly the ${cluster.count} member ids`);
  }
  if (!Object.values(members).every((v) => typeof v === "string" && perMember.includes(v))) {
    return refuse("BAD_ANSWER", `${label}: every members value must be one of [${perMember.join(", ")}]`);
  }
  return null;
}

export function validateAnswers(pending: readonly Cluster[], raw: unknown, at: string): AnswerAccepted | AnswerRefusal {
  if (!isRecord(raw) || !Array.isArray(raw["answers"])) return refuse("BAD_ANSWER", 'the answers file must be { "answers": [ … ] }');
  if (raw["answers"].length === 0) return refuse("BAD_ANSWER", "the answers file answers nothing");

  const rulings: Ruling[] = [];
  const answered: Cluster[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of raw["answers"].entries()) {
    if (!isRecord(entry) || typeof entry["fingerprint"] !== "string") return refuse("BAD_ANSWER", `answers[${i}] needs a fingerprint string`);
    const fp = entry["fingerprint"];
    if (seen.has(fp)) return refuse("BAD_ANSWER", `answers[${i}] repeats fingerprint ${fp.slice(0, 12)}`);
    seen.add(fp);
    const cluster = pending.find((c) => c.fingerprint === fp);
    if (cluster === undefined) {
      return refuse("STALE_ANSWER", `fingerprint ${fp.slice(0, 12)} matches no pending question: the source changed since it was asked. Run: ui onboard questions`);
    }
    const choice = entry["choice"];
    const bad = checkChoice(cluster, choice) ?? checkMembers(cluster, choice as string | string[], entry["members"]);
    if (bad !== null) return bad;
    const dangling = choiceChecks.get(cluster.kind)?.(cluster, choice as string | string[]) ?? null;
    if (dangling !== null) return refuse("DANGLING_AFTER_SELECTION", dangling);
    answered.push(cluster);
    rulings.push({
      kind: cluster.kind, fingerprint: fp, choice: choice as string | string[], covers: [...cluster.members],
      ...(entry["members"] === undefined ? {} : { members: entry["members"] as Record<string, string> }),
      actor: "owner", at,
    });
  }
  return { ok: true, rulings, answered };
}
