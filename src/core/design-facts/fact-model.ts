/**
 * DesignFacts — the ONE normalized model every extractor emits and every `tell`
 * rule reads.
 *
 * Why this exists: rules bound to CSS syntax can never leave the web. Bound to
 * design *facts* instead — a resolved color, a font family, a radius, a border
 * on one side, a nesting depth — the same rule judges an .html, a .tsx, a
 * .swift and a .dart. The repo already half-proved this: `ui audit` runs rules
 * over a normalized node tree from Figma, not from CSS (audit-detect.ts:38-58).
 * That model is Figma-shaped and thin; this one is derived from the 41 rules
 * being ported, so each kind names the rule that needs it.
 *
 * Every fact carries provenance. A fact you cannot point at is a fact you
 * cannot repair, so `at` is required by construction — there is no overload
 * that omits it.
 */

/**
 * How much an extractor actually knew when it emitted a fact. Ordered
 * strongest-first; `atLeast()` below compares on this order.
 *
 * - `rendered`  read off a real rendered page (phase 10's CDP capture). It is
 *               what the user actually saw, so it outranks static resolution.
 * - `resolved`  computed through a real cascade or AST — the value that WILL
 *               render, with custom properties and specificity applied.
 * - `literal`   a literal read from source with its surrounding context
 *               unresolved (the line-scanner tier). Honest undercount.
 * - `heuristic` inferred from a name or a shape (a `.card` class implies a card
 *               role). Weakest; never sufficient on its own for an error.
 */
export const CONFIDENCE_ORDER = ["rendered", "resolved", "literal", "heuristic"] as const;
export type Confidence = (typeof CONFIDENCE_ORDER)[number];

/** True when `have` is at least as strong as `want`. */
export function atLeast(have: Confidence, want: Confidence): boolean {
  return CONFIDENCE_ORDER.indexOf(have) <= CONFIDENCE_ORDER.indexOf(want);
}

/** The ten fact kinds. Each is required by at least one ported rule. */
export const FACT_KINDS = [
  "color",
  "gradient",
  "typography",
  "spacing",
  "radius",
  "border",
  "shadow",
  "motion",
  "text",
  "structure",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** Where a fact came from. Required on every fact — see the module docblock. */
export interface Provenance {
  /** Absolute or project-relative path of the source the fact was read from. */
  file: string;
  /** 1-based line. Whole-artifact facts use the line of their declaring node. */
  line: number;
  /** Registered extractor id (see extractor-registry.ts). */
  extractor: string;
  confidence: Confidence;
}
