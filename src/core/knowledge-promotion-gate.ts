/**
 * Single-project promotion gate: which rulings are worth proposing to the shared
 * knowledge core. A live ruling is a candidate when the ledger shows it recurring
 * (>= minRecurrence events referencing its id or one of its principles) OR it is
 * corroborated by >= minSources distinct source documents. Pure and deterministic.
 */
import {
  byCategoryThenId, distinctSourceDocuments, effectiveStatus, stringArray, usableRulings,
} from "./knowledge-promotion-ruling.js";
import type { RulingRecord } from "./knowledge-promotion-ruling.js";

export interface GateParams { minRecurrence: number; minSources: number }

export type CandidateReason = "recurrence" | "multi-source";

export interface Candidate {
  ruling: RulingRecord;
  reasons: CandidateReason[];
  recurrence: number;
  distinctSources: number;
}

export interface GateResult {
  candidates: Candidate[];
  considered: number;
  /** Rulings excluded because they are not live (draft / superseded / retired). */
  notLive: number;
  /** Rulings lacking id / category / text. */
  unusable: number;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Token boundary: `r-a` must not match inside `r-a-extended` or `xr-a`. */
const tokenRe = (needle: string): RegExp => new RegExp(`(?<![\\w-])${escapeRe(needle)}(?![\\w-])`);

/** Distinct ledger events that mention the ruling id or any of its principles. */
export function countRecurrence(ruling: RulingRecord, serializedEvents: readonly string[]): number {
  const needles = [String(ruling["id"]), ...stringArray(ruling["principle"])].map(tokenRe);
  return serializedEvents.filter((ev) => needles.some((re) => re.test(ev))).length;
}

export function selectCandidates(doc: unknown, ledgerRecords: readonly unknown[], params: GateParams): GateResult {
  const { usable, unusable } = usableRulings(doc);
  const events = ledgerRecords.map((r) => JSON.stringify(r));
  const candidates: Candidate[] = [];
  let notLive = 0;
  for (const ruling of [...usable].sort(byCategoryThenId)) {
    if (effectiveStatus(ruling) !== "active") { notLive += 1; continue; }
    const recurrence = countRecurrence(ruling, events);
    const distinctSources = distinctSourceDocuments(ruling).length;
    const reasons: CandidateReason[] = [];
    if (recurrence >= params.minRecurrence) reasons.push("recurrence");
    if (distinctSources >= params.minSources) reasons.push("multi-source");
    if (reasons.length > 0) candidates.push({ ruling, reasons, recurrence, distinctSources });
  }
  return { candidates, considered: usable.length - notLive, notLive, unusable };
}
