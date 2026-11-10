/**
 * The ingest ledger (FR-012): every variable and node of the scan is written, excluded with a named reason, or
 * pending an owner ruling, and `in = written + excluded + pending` holds on every run. A run where the three do not
 * add up is a bug, so `buildLedger` refuses to return one.
 */
import type { Heuristic } from "./figma-ds-heuristics.js";

/** Every reason an item can be excluded. One count per reason. */
export const EXCLUSION_REASONS = [
  "collection-not-selected", "path-collision", "unmappable-type", "null-leaf", "dangling-alias", "alias-cycle", "bad-colour",
  "page-not-selected", "archived-excluded", "duplicate-excluded", "classified-icon", "classified-screen",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export interface LedgerInput {
  variables: number;
  components: number;
  writtenTokens: number;
  writtenComponents: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Items withheld because a question about them is open. */
  pending: number;
  classifiedByHeuristic: Record<Heuristic, number>;
}

export interface Ledger {
  in: { variables: number; components: number; total: number };
  written: { tokens: number; components: number; total: number };
  /** One count per reason, only the reasons that occurred. */
  excluded: Partial<Record<ExclusionReason, number>> & { total: number };
  pending: number;
  classifiedByHeuristic: Record<Heuristic, number>;
}

export function buildLedger(input: LedgerInput): Ledger {
  const excludedTotal = Object.values(input.excluded).reduce((n, c) => n + (c ?? 0), 0);
  const total = input.variables + input.components;
  const accounted = input.writtenTokens + input.writtenComponents + excludedTotal + input.pending;
  if (accounted !== total) throw new Error(`ledger does not add up: in ${total} = written ${input.writtenTokens + input.writtenComponents} + excluded ${excludedTotal} + pending ${input.pending} is ${accounted}`);
  const excluded: Ledger["excluded"] = { total: excludedTotal };
  for (const r of EXCLUSION_REASONS) if ((input.excluded[r] ?? 0) > 0) excluded[r] = input.excluded[r] as number;
  return {
    in: { variables: input.variables, components: input.components, total },
    written: { tokens: input.writtenTokens, components: input.writtenComponents, total: input.writtenTokens + input.writtenComponents },
    excluded, pending: input.pending, classifiedByHeuristic: input.classifiedByHeuristic,
  };
}

/** The ledger as text lines (the summary and DESIGN.md use the same wording). */
export function ledgerLines(l: Ledger): string[] {
  const reasons = EXCLUSION_REASONS.filter((r) => l.excluded[r] !== undefined).map((r) => `${r} ${l.excluded[r]}`);
  const heuristics = Object.entries(l.classifiedByHeuristic).filter(([, n]) => n > 0).map(([h, n]) => `${h} ${n}`);
  return [
    `in ${l.in.total} (${l.in.variables} variables, ${l.in.components} nodes) = written ${l.written.total} (${l.written.tokens} tokens, ${l.written.components} components) + excluded ${l.excluded.total} + pending ${l.pending}`,
    ...(reasons.length > 0 ? [`excluded by reason: ${reasons.join(", ")}`] : []),
    ...(heuristics.length > 0 ? [`classified by heuristic: ${heuristics.join(", ")}`] : []),
  ];
}
