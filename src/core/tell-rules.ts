/**
 * The `tell` rule engine: rules over DesignFacts, never over source text.
 *
 * A rule that reaches for an HTML string, a CSS declaration or a Swift token has
 * broken the architecture — that is exactly what makes a linter web-only. Rules
 * here receive facts and nothing else, which is why the same 36 judge a .html, a
 * .tsx, a .swift and a .dart. `tests/tell-lint.test.ts` asserts the import
 * boundary mechanically.
 *
 * Every rule declares the fact kinds it needs. Missing kinds mean NOT-EVALUATED,
 * never a pass — see design-facts/rule-requirements.ts.
 *
 * Precision over recall. A false positive that fails a good page is worse than a
 * missed marginal one; a UI-kit showcase of badges must not read as 35 violations.
 */
import type { DesignFact, FactKind } from "./design-facts/index.js";
import type { Provenance } from "./design-facts/index.js";
import type { FloorFindingBase, FloorSeverity } from "./finding-schema.js";

/** Facts for one artifact, indexed by kind so rules do not re-filter. */
export interface FactIndex {
  all: readonly DesignFact[];
  by: <K extends FactKind>(kind: K) => Array<Extract<DesignFact, { kind: K }>>;
}

export function indexFacts(facts: readonly DesignFact[]): FactIndex {
  const buckets = new Map<FactKind, DesignFact[]>();
  for (const f of facts) {
    const list = buckets.get(f.kind);
    if (list === undefined) buckets.set(f.kind, [f]);
    else list.push(f);
  }
  // Rules that aggregate ("the first spacing", "the widest border") would
  // otherwise inherit the caller's array order, and two runs over the same
  // artifact could disagree. The collector already sorts; sorting here means a
  // rule is deterministic no matter who assembled the facts.
  for (const list of buckets.values()) {
    list.sort((a, b) => a.at.line - b.at.line || a.at.file.localeCompare(b.at.file));
  }
  return {
    all: facts,
    by: <K extends FactKind>(kind: K) =>
      (buckets.get(kind) ?? []) as Array<Extract<DesignFact, { kind: K }>>,
  };
}

/** A `tell` finding: the shared floor shape plus the knowledge section it cites. */
export type TellFinding = FloorFindingBase & {
  /** Heading in knowledge/design-tells.md this rule enforces. */
  section: string;
};

export interface TellRule {
  id: string;
  /** Fact kinds without which this rule cannot run. */
  needs: readonly FactKind[];
  severity: FloorSeverity;
  section: string;
  run: (facts: FactIndex) => TellFinding[];
}

/** Build a finding, keeping the per-rule metadata in one place. */
export function finding(
  rule: Pick<TellRule, "id" | "severity" | "section">,
  parts: {
    message: string;
    line?: number;
    nodeRef?: string;
    expected?: string;
    actual?: string;
    fixHint: string;
  },
): TellFinding {
  // RepairTarget is a discriminated union: a "nodes" scope REQUIRES a nodeRef by
  // construction, because a blast radius with nothing named is one no validator
  // can bound. Building the two shapes separately is what keeps that guarantee.
  const base = {
    checkId: rule.id,
    severity: rule.severity,
    section: rule.section,
    message: parts.message,
    line: parts.line,
    expected: parts.expected,
    actual: parts.actual,
    fixHint: parts.fixHint,
  };
  return parts.nodeRef !== undefined
    ? { ...base, repairScope: "nodes", nodeRef: parts.nodeRef }
    : base;
}

/**
 * Do two facts describe the same element?
 *
 * In a resolved cascade every declaration of one element carries that element's
 * nodeRef, so identity is exact. A line scanner has no such handle: SwiftUI and
 * Flutter spell one view as a chain of modifiers on CONSECUTIVE LINES, and a
 * rule that demanded the same line would silently never fire there.
 *
 * `.cornerRadius(16)` on line 24 and `.overlay(...alignment: .leading)` on line
 * 25 are one card. Matching on line equality made side-tab and pulsing-dot dead
 * rules on every native file — a cascade assumption leaking into a rule that is
 * supposed to be language-independent.
 *
 * So: exact when both facts name a node, and a small line window otherwise. The
 * window is deliberately tight; widening it trades a dead rule for a false one.
 */
export const OWNER_LINE_WINDOW = 4;

export function sameOwner(a: { at: Provenance }, b: { at: Provenance }): boolean {
  if (a.at.nodeRef !== undefined && b.at.nodeRef !== undefined) return a.at.nodeRef === b.at.nodeRef;
  if (a.at.file !== b.at.file) return false;
  return Math.abs(a.at.line - b.at.line) <= OWNER_LINE_WINDOW;
}

/**
 * THE partner fact for this one, or undefined.
 *
 * `sameOwner` answers "could these belong together" — right for an existence
 * check ("is there a radius on this element"), wrong when a rule needs exactly
 * one partner. Pairing a heading with *a* nearby size picked the h2's size for
 * the h1 the moment the line window opened, and heading-rhythm started reading
 * a scale that was never written.
 *
 * So: same line wins outright; otherwise the nearest candidate inside the
 * window, ties broken by the earlier line for determinism.
 */
export function nearestOwner<T extends { at: Provenance }>(
  candidates: readonly T[],
  fact: { at: Provenance },
): T | undefined {
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (!sameOwner(c, fact)) continue;
    const distance = Math.abs(c.at.line - fact.at.line);
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best;
}

/** Fonts that no longer carry personality. Platform defaults are handled per-extractor. */
export const OVERUSED_FONTS = new Set([
  "inter", "roboto", "geist", "plus jakarta sans", "space grotesk", "fraunces",
]);

/** Purple/violet accent detection — the single most recognisable palette tell. */
export function isAiPurple(hex: string): boolean {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return false;
  // Blue-dominant, green suppressed, red not far behind green.
  //
  // The first threshold set required `r - g > 30`, which excluded indigo
  // (#6366f1, r-g = -3) — squarely in the family this rule exists to catch, and
  // the miss only surfaced when the guard was deliberately broken and the suite
  // stayed green. `r - g >= -20` admits indigo while still rejecting royal blue
  // (#4169e1, -40) and blue-500 (#3b82f6, -71), which are blue, not purple.
  // Navy and dark plum fail `b > 140` on their own.
  return b > 140 && b - g > 60 && r > 60 && r - g >= -20;
}

/** Cyan-on-dark, the other half of the same palette tell. */
export function isAiCyan(hex: string): boolean {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return g > 170 && b > 170 && r < 110;
}

/** Warm off-white reached for by reflex as the "tasteful" default surface. */
export function isCream(hex: string): boolean {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  // #FAF7F0 — the canonical reflex cream — has r-b = 10, so a floor of 12
  // silently excluded the exact colour this rule exists to catch.
  return r > 235 && g > 225 && b > 200 && r >= g && g > b && r - b >= 8 && r - b <= 48;
}

/** Perceptual grey: low saturation, mid lightness. */
export function isGrey(hex: string): boolean {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min <= 24 && max >= 90 && max <= 205;
}

/** Saturated enough that grey text on it reads washed out. */
export function isSaturated(hex: string): boolean {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) >= 60;
}
