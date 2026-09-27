/**
 * `ui gate <file.html>` — the composed floor judge. One call runs every linter
 * family plus the autofix dry-run cleanliness check, so a workflow's quality
 * gate is a single line that cannot drift from its siblings. Read-only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { runGate, gateCoverage, GATE_FAMILIES } from "../core/gate.js";
import type { GateFamily, GateOptions } from "../core/gate.js";
import { loadTokenHexes } from "./taste-lint.js";
import { inlineLinkedCss } from "../core/html-css-loader.js";
import { tryDiscoverDesignSystem } from "../core/design-system.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";
import { autoScoreTokenCoverage } from "../core/token-coverage-io.js";
import { DEFAULT_TOKEN_COVERAGE_FLOOR } from "./token-coverage.js";

const CMD = "gate";

export const GATE_HELP = `ui gate — composed floor judge (every linter family, one verdict)

Usage:
  ui gate <file.html> [--tokens <f>] [--skip <family>:<reason>[,...]] [--json]
  ui gate coverage [--dir <project>] [--json]

Runs, in one call:
  layout    ui validate-layout   (structure + mobile + hover floors)
  a11y      ui a11y-lint         (Tier-1 WCAG floors)
  taste     ui taste-lint        (rubric machine floors; --tokens enables raw-hex)
  tell      ui tell-lint         (generated-UI tells; mostly advisory)
  content   ui content-lint      (UX-writing floors)
  autofix   DRY-RUN cleanliness  (pending repairs = error "autofix-not-clean")

Plus, when a token file is auto-detected for the project (design-dir contract,
then brand/design/design.tokens.json): a REQUIRED \`ui token-coverage\` check —
does the page style with the project's own tokens? Default floor 0.8,
configurable with --token-coverage-floor. Absent a token file, this check does
not run (nothing to grade against) — never a silent weakening of a check that
COULD run.

\`ui gate coverage\` lists every check the gate can run (the same catalog its
families are test-paired against) with per-project activity — the evidence a
router derives tractability from, never stale as floors ship.

The gate never rewrites the file — run \`ui autofix --write\` first, then gate.
A skipped family requires a reason and is reported in the result, so partial
gating is a declared decision, never a silent absence.

Options:
  --tokens <f>  DS token file; enables the taste Consistency raw-hex check
  --skip <s>    Comma-separated <family>:<reason> pairs, e.g.
                --skip "layout: embeddable fragment,content: mirror evidence"
  --token-coverage-floor <n>  Minimum ui token-coverage score before the gate
                fails (default: 0.8; only applies when a token file is found)
  --json        Emit a JSON envelope instead of human-readable output

Exit codes:
  0  No error-severity findings in any run family (warnings allowed), and
     token-coverage (when it ran) is at or above its floor
  1  Any error-severity finding, pending autofix repairs, token-coverage below
     its floor, or a user/file error

Error codes:
  BAD_ARG        Missing <file.html>, unknown --skip family, a skip without a
                 reason, or --token-coverage-floor not a number in [0,1]
  TOKENS_NOT_READABLE  --tokens path missing/unparsable — refused rather than silently weaker
  FILE_NOT_FOUND The input file does not exist
  READ_ERROR     The input file cannot be read
`;

/** Parse "--skip fam: reason, fam2: reason2" into the options map, or an error string. */
function parseSkip(raw: string): GateOptions["skip"] | string {
  const out: NonNullable<GateOptions["skip"]> = {};
  for (const part of raw.split(",")) {
    const idx = part.indexOf(":");
    const fam = (idx === -1 ? part : part.slice(0, idx)).trim() as GateFamily;
    const reason = idx === -1 ? "" : part.slice(idx + 1).trim();
    if (!GATE_FAMILIES.includes(fam)) return `unknown gate family '${fam}' (families: ${GATE_FAMILIES.join(", ")})`;
    if (reason === "") return `--skip ${fam} needs a reason ("${fam}: <why>") — a silent skip is the failure mode this command exists to end`;
    out[fam] = reason;
  }
  return out;
}

export const gateCommand = {
  name: CMD,
  summary: "Composed floor judge — every linter family plus autofix dry-run, one verdict",
  hasSubcommands: false,
  help: GATE_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const file = parsed.positionals[0];
    if (file === "coverage") {
      const dir = typeof parsed.flags["dir"] === "string" ? (parsed.flags["dir"] as string) : process.cwd();
      // Resolve the DS the way every DS command does (walks up to .git) — a
      // flat join would report "no tokens" from any subdirectory of a real
      // project and silently deactivate the tokens-gated check.
      const ds = tryDiscoverDesignSystem(dir);
      const project = {
        tokensPresent: existsSync(ds !== undefined ? ds.tokens : join(dir, "design", "design.tokens.json")),
        dsPresent: ds !== undefined,
      };
      const cov = gateCoverage(project);
      if (useJson) return okJsonWithExit(CMD, cov, 0);
      const lines = [
        `gate coverage — ${cov.checks.filter((c) => c.active).length}/${cov.checks.length} checks active (tokens: ${project.tokensPresent ? "present" : "absent"}, ds: ${project.dsPresent ? "present" : "absent"})`,
        ...GATE_FAMILIES.map((f) => `  ${f}: ${cov.families[f].active}/${cov.families[f].total} active`),
        ...cov.checks.filter((c) => !c.active).map((c) => `  inactive: ${c.id} (requires ${c.requires})`),
      ];
      return { exitCode: 0, stdout: lines.join("\n") + "\n" };
    }
    if (file === undefined) {
      const msg = "ui gate requires <file.html>";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    let html: string;
    try {
      html = readFileSync(file, "utf8");
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound ? `file not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }
    // A1: judge the union of inline + LOCAL linked CSS exactly as if inlined;
    // an unreadable linked stylesheet is an error finding, never silence —
    // every family below reads `html` post-inlining, so a violation living
    // only in a linked stylesheet is no longer invisible to the gate.
    const loaded = inlineLinkedCss(file, html);
    html = loaded.html;

    const skipFlag = parsed.flags["skip"];
    let skip: GateOptions["skip"];
    if (typeof skipFlag === "string") {
      const parsedSkip = parseSkip(skipFlag);
      if (typeof parsedSkip === "string") {
        return useJson ? errJson(CMD, "BAD_ARG", parsedSkip) : errText(`ui: ${parsedSkip}\n`);
      }
      skip = parsedSkip;
    }
    const tokensFlag = parsed.flags["tokens"];
    let knownHexes: Set<string> | undefined;
    if (typeof tokensFlag === "string") {
      knownHexes = loadTokenHexes(tokensFlag);
      // Fail LOUD: taste-lint tolerates a missing token file (optional context),
      // but on the mandatory gate line a typo'd path would silently disable the
      // raw-hex Consistency check — a quieter gate that looks like a passing one.
      if (knownHexes === undefined) {
        const msg = `--tokens '${tokensFlag}' is not a readable token file (missing, unparsable, or holds no color tokens) — fix the path or drop the flag; a gate must never weaken silently`;
        return useJson ? errJson(CMD, "TOKENS_NOT_READABLE", msg) : errText(`ui: ${msg}\n`);
      }
    }

    const tcFloorFlag = parsed.flags["token-coverage-floor"];
    let tokenCoverageFloor = DEFAULT_TOKEN_COVERAGE_FLOOR;
    if (typeof tcFloorFlag === "string") {
      const n = Number(tcFloorFlag);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        const msg = `--token-coverage-floor must be a number in [0,1], got '${tcFloorFlag}'`;
        return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      tokenCoverageFloor = n;
    }

    // Required check A2: runs only when a token file is auto-detectable for
    // this project — absent one, there is nothing to grade against, and that
    // is a declared "did not run" (below), never a check pretending to pass.
    const tokenCoverage = autoScoreTokenCoverage(file, html);
    const tokenCoverageFails = tokenCoverage !== undefined && tokenCoverage.overall.coverage < tokenCoverageFloor;

    const result = runGate(html, { knownHexes, skip });
    result.errorCount += loaded.errors.length;
    const pass = result.pass && loaded.errors.length === 0 && !tokenCoverageFails;
    const exitCode = pass ? 0 : 1;

    const lines: string[] = [`gate: ${file} — ${result.errorCount} error(s), ${result.warningCount} warning(s)${pass ? " — PASS" : ""}`];
    for (const e of loaded.errors) lines.push(`  ✗ [${e.checkId}]: ${e.message}`);
    if (tokenCoverage !== undefined) {
      const pct = Math.round(tokenCoverage.overall.coverage * 100);
      lines.push(`  token-coverage: ${pct}% (floor ${Math.round(tokenCoverageFloor * 100)}%)${tokenCoverageFails ? " — FAIL" : ""}`);
    }
    for (const fam of GATE_FAMILIES) {
      const r = result.families[fam];
      if (r === undefined) continue;
      if (r.findings.length === 0) { lines.push(`  ${fam}: clean`); continue; }
      lines.push(`  ${fam}: ${r.errorCount} error(s), ${r.warningCount} warning(s)`);
      for (const f of r.findings) {
        lines.push(`    ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]${f.line !== undefined ? ` line ${f.line}` : ""}: ${f.message}`);
      }
    }
    for (const s of result.skipped) lines.push(`  skipped ${s}`);
    // A family that RAN but read only part of the artifact. Printed beside the
    // skips because a partial verdict and an absent one are both "not a clean bill".
    for (const s of result.partial) lines.push(`  PARTIAL ${s}`);

    const data = { file, ...result, pass, tokenCoverage, tokenCoverageFloor, linkedCssErrors: loaded.errors };
    const out = useJson ? okJsonWithExit(CMD, data, exitCode) : { exitCode, stdout: lines.join("\n") + "\n" };
    return withOutcome(out, parsed, { type: "lint_run", actor: "ui gate", projectDir: file, data: lintOutcomeData("gate", file, { findings: Object.values(result.families).flatMap((r) => r.findings), errorCount: result.errorCount, warningCount: result.warningCount }) });
  },
};
