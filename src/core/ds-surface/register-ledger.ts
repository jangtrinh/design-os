/**
 * The ledger of a registration run (spec 033 FR-027): every component the run plans for is in exactly one term, so a
 * count in one place can always be reconciled with the counts in the others. Nothing is dropped without a term.
 */
export interface RegisterLedger {
  planned: number;
  /** New records, the `<name> · code` ones included. */
  written: number;
  linked: number;
  refreshed: number;
  unchanged: number;
  /** Source changed and the owner ruled `keep`: the record stays as registered. */
  staleByRuling: number;
  /** Refused by the design-system lint and the owner ruled `leave-out`. */
  leftOutByRuling: number;
  /** Refused by the design-system lint and the owner ruled `stop`. */
  stopped: number;
  /** Ruled different from their record, but `<name> · code` is held by another door. */
  separateNameHeld: number;
  /** No answer yet: source match, source changed or lint refused. */
  awaitingRuling: number;
}

/** The terms the ledger reads from a preview. */
export interface LedgerSource {
  records: readonly unknown[]; links: readonly unknown[]; refreshes: readonly unknown[]; unchanged: number;
  staleByRuling: readonly unknown[]; leftOutByRuling: readonly unknown[]; lintStopped: readonly unknown[]; separateNameHeld: readonly unknown[];
  awaitingSourceMatch: readonly unknown[]; awaitingSourceChanged: readonly unknown[]; awaitingLintRuling: readonly unknown[];
}

export function registerLedger(p: LedgerSource, planned: number): RegisterLedger {
  return {
    planned, written: p.records.length, linked: p.links.length, refreshed: p.refreshes.length, unchanged: p.unchanged,
    staleByRuling: p.staleByRuling.length, leftOutByRuling: p.leftOutByRuling.length, stopped: p.lintStopped.length, separateNameHeld: p.separateNameHeld.length,
    awaitingRuling: p.awaitingSourceMatch.length + p.awaitingSourceChanged.length + p.awaitingLintRuling.length,
  };
}
