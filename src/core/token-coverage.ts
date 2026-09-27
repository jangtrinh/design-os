/**
 * token-coverage.ts — aggregates classified CSS declarations into a per-
 * category and overall coverage score: coverage = token / (token + raw).
 * `derived` values (calc/percent/relative units) are counted in `total` but
 * never in the coverage ratio — they are neither a token win nor a raw miss.
 * The one entrypoint `ui token-coverage` and `ui gate`'s token-coverage check
 * both call: scoreCssSources(sources, resolvedTokenMap).
 */
import { extractDeclarations } from "./token-coverage-extract.js";
import type { CoverageDeclaration, TokenCoverageCategory } from "./token-coverage-extract.js";
import { classifyDeclaration, buildTokenValueIndex } from "./token-coverage-classify.js";
import type { TokenValueIndex } from "./token-coverage-classify.js";
import type { CssSource } from "./token-coverage-io.js";
import type { ResolvedMap } from "./token-model.js";

export type { TokenCoverageCategory, CoverageDeclaration, TokenValueIndex };

export interface CategoryCoverage {
  token: number;
  derived: number;
  raw: number;
  total: number;
  /** token / (token + raw); 1 when there is nothing to fail on (denom 0). */
  coverage: number;
}

export interface TokenCoverageResult {
  categories: Record<TokenCoverageCategory, CategoryCoverage>;
  overall: CategoryCoverage;
  declarationCount: number;
}

const CATEGORIES: readonly TokenCoverageCategory[] = ["color", "font-family", "font-size", "spacing", "radius", "shadow"];

interface RawTally { token: number; derived: number; raw: number }
function empty(): RawTally {
  return { token: 0, derived: 0, raw: 0 };
}

function finalize(c: RawTally): CategoryCoverage {
  const total = c.token + c.derived + c.raw;
  const denom = c.token + c.raw;
  return { ...c, total, coverage: denom === 0 ? 1 : c.token / denom };
}

/** Classify and aggregate an already-extracted declaration list. */
export function scoreDeclarations(declarations: readonly CoverageDeclaration[], idx: TokenValueIndex): TokenCoverageResult {
  const buckets: Record<TokenCoverageCategory, RawTally> = {
    color: empty(), "font-family": empty(), "font-size": empty(), spacing: empty(), radius: empty(), shadow: empty(),
  };
  for (const decl of declarations) buckets[decl.category][classifyDeclaration(decl, idx)]++;

  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, finalize(buckets[c])])) as Record<TokenCoverageCategory, CategoryCoverage>;
  const overallTally = CATEGORIES.reduce<RawTally>((acc, c) => ({
    token: acc.token + buckets[c].token,
    derived: acc.derived + buckets[c].derived,
    raw: acc.raw + buckets[c].raw,
  }), empty());

  return { categories, overall: finalize(overallTally), declarationCount: declarations.length };
}

/** Score every CSS source (HTML inline/<style> + linked files) an artifact pulls in. */
export function scoreCssSources(sources: readonly CssSource[], resolved: ResolvedMap): TokenCoverageResult {
  const idx = buildTokenValueIndex(resolved);
  const declarations = sources.flatMap((s) => extractDeclarations(s.text, s.isHtmlSource));
  return scoreDeclarations(declarations, idx);
}
