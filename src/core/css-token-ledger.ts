/**
 * The ledger of `ui ingest-css-ds`: every input custom property is accounted for exactly once — written as a primitive
 * or an alias, or left out for one named reason — so the sum of the ledger equals the input count and an empty result
 * is never read as a success. Also the message of the empty result: it names the next action.
 */

/** The named reasons a custom property is left out. Each name lands under exactly one. */
export const LEFT_OUT = {
  notOneLeaf: "value is not one typed leaf (calc, a shadow, an easing, a multi-value shorthand)",
  unrecognisedSelector: "declared only under unrecognised selectors",
  noBase: "declared only under a theme or mode, so it has no base value",
  aliasNotInInput: "alias names a property that is not in the input",
  aliasLeftOut: "alias names a property that was left out",
} as const;
export type LeftOutReason = (typeof LEFT_OUT)[keyof typeof LEFT_OUT];

export interface CssIngestLedger {
  /** Distinct custom property names in the input. */
  properties: number;
  /** Declarations in the input (a name declared under several selectors or values is several declarations). */
  declarations: number;
  written: { primitives: number; semantics: number };
  /** Reason -> how many properties; present only for a reason that left something out. */
  leftOut: Record<string, number>;
}

/** A selector no rule maps to a base or a mode, with the declarations under it. */
export interface UnrecognisedSelector { selector: string; declarations: number }

export function buildLedger(input: { properties: number; declarations: number; primitives: number; semantics: number; reasons: readonly LeftOutReason[] }): CssIngestLedger {
  const leftOut: Record<string, number> = {};
  for (const r of input.reasons) leftOut[r] = (leftOut[r] ?? 0) + 1;
  return { properties: input.properties, declarations: input.declarations, written: { primitives: input.primitives, semantics: input.semantics }, leftOut };
}

/** Largest first, ties by selector text, so the same input always prints the same list. */
export function rankSelectors(counts: ReadonlyMap<string, number>): UnrecognisedSelector[] {
  return [...counts.entries()]
    .map(([selector, declarations]) => ({ selector, declarations }))
    .sort((a, b) => b.declarations - a.declarations || (a.selector < b.selector ? -1 : a.selector > b.selector ? 1 : 0));
}

/**
 * What to say when custom properties went in and no token came out: how many were read, every reason the ledger shows
 * with its count (in the order the ledger writes them), the unrecognised selectors when there are any, and one next
 * action. It states the ledger and guesses no single cause.
 */
export function emptyResultMessage(ledger: CssIngestLedger, selectors: readonly UnrecognisedSelector[]): string {
  const n = ledger.properties;
  const reasons = Object.entries(ledger.leftOut).map(([reason, count]) => `${reason} (${count})`).join(", ");
  const listed = selectors.slice(0, 5).map((s) => `'${s.selector}' (${s.declarations})`).join(", ");
  return `no token was written from ${n} custom ${n === 1 ? "property" : "properties"}. Left out, by reason: ${reasons}.` +
    (selectors.length > 0 ? ` Selectors not recognised, by declarations: ${listed}.` : "") +
    " Next action: check that the CSS files passed hold the base selector of the theme and its values.";
}
