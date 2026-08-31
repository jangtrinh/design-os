/**
 * The stable identity of a finding, shared by every test that has to say
 * "the same finding" across two runs.
 *
 * Built from the stable half of the dedup key the linter itself uses
 * (`checkId ∥ line ∥ nodeRef ∥ message`). `message` is deliberately EXCLUDED:
 * `collapseRepeated` folds an element count into it, so keying on message turns
 * every count change into a phantom new finding — and, worse, makes any law
 * asserted over those keys flaky by construction.
 *
 * Measured over 73 real files / 263 findings, this key collides once when scoped
 * per page — hence `withOrdinals`, which is inert wherever the key is unique.
 *
 * This lives in one file on purpose. It was copied into the field corpus first
 * and needed second by the metamorphic laws; two copies of an identity function
 * drift, and the drift would show up as a law and a corpus disagreeing about
 * what "the same finding" means.
 */

export interface KeyableFinding {
  checkId: string;
  line?: number;
  nodeRef?: string;
  actual?: string;
}

export function keyOf(f: KeyableFinding): string {
  const locator = f.nodeRef ?? (f.line !== undefined && f.line !== null ? `line:${f.line}` : "doc");
  return `${f.checkId}@${locator}#${f.actual ?? "-"}`;
}

/** Keys in emission order, disambiguating the rare collision with a suffix. */
export function withOrdinals(findings: readonly KeyableFinding[]): string[] {
  const seen = new Map<string, number>();
  return findings.map((f) => {
    const base = keyOf(f);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}~${n}`;
  });
}
