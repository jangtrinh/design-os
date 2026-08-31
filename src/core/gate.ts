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
import { lintTell } from "./tell-lint.js";
import { extractHtml } from "./extractors/html/html-extractor.js";
import { extractorById } from "./design-facts/index.js";
import type { FloorFindingBase } from "./finding-schema.js";
import { CHECK_CATALOG } from "./check-catalog.js";
import type { CatalogEntry } from "./check-catalog.js";

export const GATE_FAMILIES = ["layout", "a11y", "taste", "tell", "content", "autofix"] as const;
export type GateFamily = (typeof GATE_FAMILIES)[number];

export interface GateFamilyResult {
  errorCount: number;
  warningCount: number;
  /** Signs, not defects — printed, never counted toward failure. */
  advisoryCount: number;
  /** FloorFinding schema v1; family extras (a11y `sc`, taste `axis`) ride along. */
  findings: FloorFindingBase[];
}

export interface GateResult {
  families: Partial<Record<GateFamily, GateFamilyResult>>;
  /** Signs, not defects — printed, never counted toward failure. */
  advisoryCount: number;
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
  /** Path of the artifact, so tell findings carry a real file in their provenance. */
  file?: string;
}

function familyResult(findings: GateFamilyResult["findings"]): GateFamilyResult {
  return { ...countBySeverity(findings), findings };
}

export function runGate(html: string, opts: GateOptions = {}): GateResult {
  const skip = opts.skip ?? {};
  const families: GateResult["families"] = {};
  const skipped: string[] = [];

  // One extraction, two families. `tell` and `content` both read facts, and running
  // the cascade twice would be both slower and a place for them to disagree.
  let factPassCache: ReturnType<typeof lintTell> | null | undefined;
  const factPass = (): ReturnType<typeof lintTell> | null => {
    if (factPassCache === undefined) {
      const profile = extractorById("html-cascade");
      factPassCache = profile === undefined
        ? null
        : lintTell(extractHtml(html, opts.file ?? "artifact.html").collector.facts(), profile);
    }
    return factPassCache;
  };

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
    } else if (fam === "tell") {
      // The gate reads HTML, so the tell family runs against the reference
      // extractor. Rules whose fact kinds it cannot supply would be reported
      // NOT-EVALUATED — with html-cascade there are none, which is why the
      // richer extractor is also the one the gate uses.
      families.tell = familyResult(factPass()?.findings ?? []);
    } else if (fam === "content") {
      // BOTH halves of the content family, because there are two.
      //
      // The regex checks read the raw document. The rest — the voice tells and
      // `prompt-leak-metadata` — are computed from FACTS and reach the gate only
      // through the tell pass. Composing this family from the regex roster alone
      // left six catalog rows reported active by `gate coverage` that `ui gate`
      // could never emit, and one of them is severity `error`. A check the
      // coverage report claims to run and does not is the silent gate weakening
      // this module's own docblock names as its first risk.
      const all: ContentFinding[] = [];
      for (const check of allContentChecks) all.push(...check(html));
      all.push(...((factPass()?.content ?? []) as unknown as ContentFinding[]));
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
  let advisoryCount = 0;
  for (const fam of GATE_FAMILIES) {
    const r = families[fam];
    if (r === undefined) continue;
    errorCount += r.errorCount;
    warningCount += r.warningCount;
    advisoryCount += r.advisoryCount;
  }
  // pass keys on errors alone: an advisory finding prints and never fails.
  return { families, skipped, errorCount, warningCount, advisoryCount, pass: errorCount === 0 };
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
export function gateCoverage(project: {
  tokensPresent: boolean;
  dsPresent: boolean;
  /** True when a rendered capture is available (ui gate --render). */
  renderAvailable?: boolean;
}): GateCoverage {
  const checks = CHECK_CATALOG.map((c) => ({
    ...c,
    // A fact-based requirement is active when the gate's extractor supplies the
    // kinds. html-cascade supplies all ten, so every fact rule is active — but a
    // rule needing `rendered` confidence cannot run without a capture, and
    // reporting it active would be exactly the silent pass NOT-EVALUATED exists
    // to prevent.
    active:
      c.requires === "none" ||
      (c.requires === "tokens" && project.tokensPresent) ||
      (typeof c.requires === "object" &&
        (c.requires.minConfidence !== "rendered" || project.renderAvailable === true)),
  }));
  const families = Object.fromEntries(GATE_FAMILIES.map((f) => {
    const rows = checks.filter((c) => c.family === f);
    return [f, { total: rows.length, active: rows.filter((c) => c.active).length }];
  })) as Record<GateFamily, { total: number; active: number }>;
  return { checks, families, project };
}
