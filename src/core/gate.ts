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
import { lintA11y } from "./a11y-lint.js";
import { lintTaste } from "./taste-lint.js";
import { allContentChecks } from "./content-checks.js";
import type { ContentFinding } from "./content-checks.js";
import { runAutofix } from "./html-autofix.js";

export const GATE_FAMILIES = ["layout", "a11y", "taste", "content", "autofix"] as const;
export type GateFamily = (typeof GATE_FAMILIES)[number];

export interface GateFamilyResult {
  errorCount: number;
  warningCount: number;
  findings: Array<{ checkId: string; severity: "error" | "warning"; message: string; line?: number }>;
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
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return { errorCount, warningCount: findings.length - errorCount, findings };
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
      const r = lintA11y(html);
      families.a11y = familyResult(r.findings.map(({ checkId, severity, message, line }) => ({ checkId, severity, message, line })));
    } else if (fam === "taste") {
      const r = lintTaste(html, { knownHexes: opts.knownHexes });
      families.taste = familyResult(r.findings.map(({ checkId, severity, message, line }) => ({ checkId, severity, message, line })));
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
