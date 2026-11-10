/**
 * Validates an answers file against the pending clusters (FR-005) and turns it into rulings.
 * All-or-nothing: the first problem refuses the whole file, so a refused answer writes nothing.
 *
 * Set-valued kinds: `choice` is a non-empty list of distinct option ids; the kernel expands it into a keep/drop map
 * over every member from the chosen options' `selects`. `review-individually` is valid only as the single element,
 * with a `members` map of keep/drop for exactly the cluster's members. Single-choice kinds: `choice` is one option id;
 * after `review-individually`, `members` maps each member to an option id.
 */
import { isRecord } from "../knowledge-promotion-ruling.js";
import type { Cluster } from "./cluster.js";
import { CLUSTER_KIND_TABLE, REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { EMITTERS } from "./emitters.js";
import type { KindEmitter } from "./kind-emitter.js";
import { DROP, KEEP, outcomeOf } from "./ruling-store.js";
import type { Ruling } from "./ruling-store.js";

export type AnswerErrorCode = "STALE_ANSWER" | "BAD_ANSWER" | "DANGLING_AFTER_SELECTION";
export interface AnswerRefusal { ok: false; code: AnswerErrorCode; message: string }
export interface AnswerAccepted { ok: true; rulings: Ruling[]; answered: Cluster[] }

const refuse = (code: AnswerErrorCode, message: string): AnswerRefusal => ({ ok: false, code, message });
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const labelOf = (c: Cluster): string => `${c.kind} (${c.fingerprint.slice(0, 12)})`;

type Built = { choice: string | string[]; members?: Record<string, string> } | AnswerRefusal;

function buildSetValued(c: Cluster, choice: unknown, members: unknown): Built {
  const ids = c.options.map((o) => o.id);
  if (!isStrings(choice) || choice.length === 0 || new Set(choice).size !== choice.length || !choice.every((x) => ids.includes(x))) {
    return refuse("BAD_ANSWER", `${labelOf(c)} is a multi-select question: choice must be a non-empty list of distinct ids from [${ids.join(", ")}]`);
  }
  if (choice.includes(REVIEW_INDIVIDUALLY)) {
    if (choice.length !== 1) return refuse("BAD_ANSWER", `${labelOf(c)}: '${REVIEW_INDIVIDUALLY}' cannot be combined with other options`);
    if (!isRecord(members) || !sameSet(Object.keys(members), c.members) || !Object.values(members).every((v) => v === KEEP || v === DROP)) {
      return refuse("BAD_ANSWER", `${labelOf(c)}: '${REVIEW_INDIVIDUALLY}' needs a members map with exactly the ${c.count} member ids, each "${KEEP}" or "${DROP}"`);
    }
    return { choice, members: members as Record<string, string> };
  }
  if (members !== undefined) return refuse("BAD_ANSWER", `${labelOf(c)}: members is only valid after '${REVIEW_INDIVIDUALLY}'`);
  const kept = new Set(c.options.filter((o) => choice.includes(o.id)).flatMap((o) => o.selects ?? []));
  return { choice, members: Object.fromEntries(c.members.map((m) => [m, kept.has(m) ? KEEP : DROP])) };
}

function buildSingle(c: Cluster, choice: unknown, members: unknown): Built {
  const ids = c.options.map((o) => o.id);
  if (typeof choice !== "string") return refuse("BAD_ANSWER", `${labelOf(c)} is a single-choice question: choice must be one option id, not a list`);
  if (!ids.includes(choice)) return refuse("BAD_ANSWER", `${labelOf(c)}: '${choice}' is not one of [${ids.join(", ")}]`);
  if (choice !== REVIEW_INDIVIDUALLY) {
    return members === undefined ? { choice } : refuse("BAD_ANSWER", `${labelOf(c)}: members is only valid after '${REVIEW_INDIVIDUALLY}'`);
  }
  const perMember = ids.filter((id) => id !== REVIEW_INDIVIDUALLY);
  if (!isRecord(members) || !sameSet(Object.keys(members), c.members)) {
    return refuse("BAD_ANSWER", `${labelOf(c)}: '${REVIEW_INDIVIDUALLY}' needs a members map with exactly the ${c.count} member ids`);
  }
  if (!Object.values(members).every((v) => typeof v === "string" && perMember.includes(v))) {
    return refuse("BAD_ANSWER", `${labelOf(c)}: every members value must be one of [${perMember.join(", ")}]`);
  }
  return { choice, members: members as Record<string, string> };
}

export function validateAnswers(pending: readonly Cluster[], raw: unknown, at: string, emitters: readonly KindEmitter[] = EMITTERS): AnswerAccepted | AnswerRefusal {
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
      return refuse("STALE_ANSWER", `fingerprint ${fp.slice(0, 12)} matches no pending question: it was already answered, or the source changed since it was asked. Run: ui onboard questions`);
    }
    const built = (CLUSTER_KIND_TABLE[cluster.kind].setValued ? buildSetValued : buildSingle)(cluster, entry["choice"], entry["members"]);
    if ("ok" in built) return built;
    const ruling: Ruling = { kind: cluster.kind, fingerprint: fp, choice: built.choice, covers: [...cluster.members], ...(built.members === undefined ? {} : { members: built.members }), actor: "owner", at };
    const outcomes = Object.fromEntries(cluster.members.map((m) => [m, outcomeOf(ruling, m)]));
    const dangling = emitters.find((e) => e.kind === cluster.kind)?.checkAnswer?.(cluster, outcomes) ?? null;
    if (dangling !== null) return refuse("DANGLING_AFTER_SELECTION", dangling);
    answered.push(cluster);
    rulings.push(ruling);
  }
  return { ok: true, rulings, answered };
}
