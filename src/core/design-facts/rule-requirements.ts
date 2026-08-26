/**
 * The requirement contract — what stops a polyglot linter from turning
 * "I cannot see it" into "it is clean".
 *
 * Each rule declares the fact kinds it needs and, where a weak reading would
 * mislead, the minimum confidence those facts must carry. Against a given
 * extractor a rule lands in exactly one of two buckets: RUNNABLE, or
 * NOT-EVALUATED with the missing kinds named. There is no third state and
 * nothing is dropped silently — `partition()` asserts the two buckets sum to
 * the input, so a lost rule is a thrown error, not a quiet pass.
 *
 * This generalizes CHECK_CATALOG's `requires` field, which until now could only
 * say "none" or "tokens".
 */
import type { FactKind, Confidence } from "./fact-model.js";
import { atLeast } from "./fact-model.js";
import type { ExtractorProfile } from "./extractor-registry.js";
import { supplyOf } from "./extractor-registry.js";

export interface RuleRequirement {
  /** checkId, matching the CHECK_CATALOG row. */
  id: string;
  /** Kinds the rule cannot run without. */
  needs: readonly FactKind[];
  /**
   * Minimum confidence for the needed kinds. Defaults to `heuristic` (any).
   * `low-contrast` sets `resolved`: a contrast ratio computed from literals a
   * cascade never resolved is a number that means nothing.
   */
  minConfidence?: Confidence;
}

/** Why a rule could not run against this extractor. */
export interface NotEvaluated {
  id: string;
  /** Kinds the extractor cannot supply at all. */
  missing: FactKind[];
  /** Kinds supplied, but too weakly for this rule. */
  tooWeak: Array<{ kind: FactKind; have: Confidence; want: Confidence }>;
  /** One-line reason, ready to print in the coverage matrix. */
  reason: string;
}

export interface Partition {
  runnable: string[];
  notEvaluated: NotEvaluated[];
}

/** Evaluate one rule against one extractor. */
export function evaluate(
  rule: RuleRequirement,
  profile: ExtractorProfile,
): { runnable: true } | { runnable: false; why: NotEvaluated } {
  const want: Confidence = rule.minConfidence ?? "heuristic";
  const missing: FactKind[] = [];
  const tooWeak: NotEvaluated["tooWeak"] = [];

  for (const kind of rule.needs) {
    const have = supplyOf(profile, kind);
    if (have === undefined) missing.push(kind);
    else if (!atLeast(have, want)) tooWeak.push({ kind, have, want });
  }

  if (missing.length === 0 && tooWeak.length === 0) return { runnable: true };

  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
  for (const w of tooWeak) parts.push(`${w.kind} only ${w.have}, needs ${w.want}`);
  return {
    runnable: false,
    why: { id: rule.id, missing, tooWeak, reason: `${profile.id} — ${parts.join("; ")}` },
  };
}

/**
 * Split a rule set against one extractor. Deterministically ordered, and
 * self-checked: losing a rule between the buckets throws rather than reading
 * as one fewer finding.
 */
export function partition(
  rules: readonly RuleRequirement[],
  profile: ExtractorProfile,
): Partition {
  const runnable: string[] = [];
  const notEvaluated: NotEvaluated[] = [];

  for (const rule of rules) {
    const verdict = evaluate(rule, profile);
    if (verdict.runnable) runnable.push(rule.id);
    else notEvaluated.push(verdict.why);
  }

  if (runnable.length + notEvaluated.length !== rules.length) {
    throw new Error(
      `rule partition lost ${rules.length - runnable.length - notEvaluated.length} rule(s) ` +
        `for extractor "${profile.id}" — every rule must land in exactly one bucket`,
    );
  }

  runnable.sort();
  notEvaluated.sort((a, b) => a.id.localeCompare(b.id));
  return { runnable, notEvaluated };
}

/** One row of the `--coverage` matrix: a rule against every extractor. */
export interface CoverageRow {
  id: string;
  byExtractor: Array<{ extractor: string; runnable: boolean; reason?: string }>;
}

/** Build the full rule x extractor matrix, deterministically ordered. */
export function coverageMatrix(
  rules: readonly RuleRequirement[],
  profiles: readonly ExtractorProfile[],
): CoverageRow[] {
  return [...rules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((rule) => ({
      id: rule.id,
      byExtractor: [...profiles]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((profile) => {
          const verdict = evaluate(rule, profile);
          return verdict.runnable
            ? { extractor: profile.id, runnable: true }
            : { extractor: profile.id, runnable: false, reason: verdict.why.reason };
        }),
    }));
}
