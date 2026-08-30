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
import { tryDiscoverDesignSystem } from "../core/design-system.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";

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
  --json        Emit a JSON envelope instead of human-readable output

Exit codes:
  0  No error-severity findings in any run family (warnings allowed)
  1  Any error-severity finding, pending autofix repairs, or a user/file error

Error codes:
  BAD_ARG        Missing <file.html>, unknown --skip family, or a skip without a reason
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

    const result = runGate(html, { knownHexes, skip });
    const exitCode = result.pass ? 0 : 1;

    const lines: string[] = [`gate: ${file} — ${result.errorCount} error(s), ${result.warningCount} warning(s)${result.pass ? " — PASS" : ""}`];
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

    const data = { file, ...result };
    const out = useJson ? okJsonWithExit(CMD, data, exitCode) : { exitCode, stdout: lines.join("\n") + "\n" };
    return withOutcome(out, parsed, { type: "lint_run", actor: "ui gate", projectDir: file, data: lintOutcomeData("gate", file, { findings: Object.values(result.families).flatMap((r) => r.findings), errorCount: result.errorCount, warningCount: result.warningCount }) });
  },
};
