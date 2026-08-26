/**
 * runGate — the ONE composed judge for HTML artifact floors (advisory:
 * plans/reports/advisory-260819-1536-ui-gate-unification.md). Composes the four
 * linter families plus an autofix DRY-RUN cleanliness check into a single
 * verdict, so every consumer (workflows, critique, corpus tests, the figma
 * panel) judges with the same instrument — adding a linter here lands
 * everywhere at once, and a partial gate is a DECLARED skip, never a silently
 * missing call.
 *
 * Read-only by design: a verb that judges must not rewrite what it judges.
 * Pending autofix repairs surface as an error-severity `autofix-not-clean`
 * finding; the mutation stays the caller's explicit `ui autofix --write` step,
 * which also keeps the "autofix re-run is a no-op" proof meaningful.
 */
import { lintLayout } from "./layout-lint.js";
import { countBySeverity } from "./finding-schema.js";
import { lintA11y } from "./a11y-lint.js";
import { lintTaste } from "./taste-lint.js";
import { allContentChecks } from "./content-checks.js";
import type { ContentFinding } from "./content-checks.js";
import { runAutofix } from "./html-autofix.js";
import type { FloorFindingBase } from "./finding-schema.js";
import { CHECK_CATALOG } from "./check-catalog.js";
import type { CatalogEntry } from "./check-catalog.js";

export const GATE_FAMILIES = ["layout", "a11y", "taste", "content", "autofix"] as const;
export type GateFamily = (typeof GATE_FAMILIES)[number];

export interface GateFamilyResult {
  errorCount: number;
  warningCount: number;
  /** FloorFinding schema v1; family extras (a11y `sc`, taste `axis`) ride along. */
  findings: FloorFindingBase[];
}

export interface GateResult {
  families: Partial<Record<GateFamily, GateFamilyResult>>;
  /** Declared partial gating: "<family>: <reason>" per skipped family. */
  skipped: string[];
  errorCount: number;
  warningCount: number;
  /** true iff no error-severity finding in any run family. */
  pass: boolean;
}

export interface GateOptions {
  /** DS color-token hexes — enables taste-lint's Consistency raw-hex check. */
  knownHexes?: Set<string>;
  /** Families to skip, each with a REQUIRED reason (validated by the command). */
  skip?: Partial<Record<GateFamily, string>>;
}

function familyResult(findings: GateFamilyResult["findings"]): GateFamilyResult {
  return { ...countBySeverity(findings), findings };
}

export function runGate(html: string, opts: GateOptions = {}): GateResult {
  const skip = opts.skip ?? {};
  const families: GateResult["families"] = {};
  const skipped: string[] = [];

  for (const fam of GATE_FAMILIES) {
    const reason = skip[fam];
    if (reason !== undefined) {
      skipped.push(`${fam}: ${reason}`);
      continue;
    }
    if (fam === "layout") {
      const r = lintLayout(html);
      families.layout = familyResult(r.findings);
    } else if (fam === "a11y") {
      families.a11y = familyResult(lintA11y(html).findings);
    } else if (fam === "taste") {
      families.taste = familyResult(lintTaste(html, { knownHexes: opts.knownHexes }).findings);
    } else if (fam === "content") {
      const all: ContentFinding[] = [];
      for (const check of allContentChecks) all.push(...check(html));
      families.content = familyResult(all);
    } else {
      // Dry-run cleanliness: any repair the autofixer WOULD apply is a floor the
      // artifact has not met — the caller runs `ui autofix --write`, then gates.
      const { findings } = runAutofix(html);
      families.autofix = familyResult(findings.length === 0 ? [] : [{
        checkId: "autofix-not-clean", severity: "error",
        message: `the autofixer would still apply ${findings.length} repair(s): ${findings.map((f) => f.ruleId).join(", ")} — run \`ui autofix --write\` first, then gate`,
      }]);
    }
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const fam of GATE_FAMILIES) {
    const r = families[fam];
    if (r === undefined) continue;
    errorCount += r.errorCount;
    warningCount += r.warningCount;
  }
  return { families, skipped, errorCount, warningCount, pass: errorCount === 0 };
}

// ─── Coverage — the registry triage routes on ─────────────────────────────────

export interface GateCoverage {
  checks: Array<CatalogEntry & { active: boolean }>;
  families: Record<GateFamily, { total: number; active: number }>;
  project: { tokensPresent: boolean; dsPresent: boolean };
}

/**
 * gateCoverage — which checks CAN run for a given project context. Derived from
 * the same catalog the gate's families are paired against, so a router reading
 * this can never go stale as floors ship (triage-by-attempted-compilation's
 * evidence source). `dsPresent` is reported for routing context (DS density);
 * no gate check currently keys on it beyond the token file.
 */
export function gateCoverage(project: { tokensPresent: boolean; dsPresent: boolean }): GateCoverage {
  const checks = CHECK_CATALOG.map((c) => ({
    ...c,
    active: c.requires === "none" || (c.requires === "tokens" && project.tokensPresent),
  }));
  const families = Object.fromEntries(GATE_FAMILIES.map((f) => {
    const rows = checks.filter((c) => c.family === f);
    return [f, { total: rows.length, active: rows.filter((c) => c.active).length }];
  })) as Record<GateFamily, { total: number; active: number }>;
  return { checks, families, project };
}
