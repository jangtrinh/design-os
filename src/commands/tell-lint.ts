/**
 * `ui tell-lint` — the generated-UI tell family, across every language the
 * extractor registry can read.
 *
 * `taste-lint` asks whether a rubric law was broken. This asks whether a habit
 * was revealed. Most findings are advisory: they print, they never fail a build,
 * and the exit code keys on errors alone — same policy as every other floor.
 *
 * Read-only. Accepts a file, a directory or a glob, and reports what it could
 * NOT look at as loudly as what it could: skipped paths, undercount tiers,
 * unresolved reads, and rules that were NOT-EVALUATED for want of facts. A zero
 * from a half-read project is a claim nobody has earned.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { resolveTargets, describeResolution } from "../core/lint-target.js";
import type { LintTarget } from "../core/lint-target.js";
import { extractHtml } from "../core/extractors/html/html-extractor.js";
import { lintTell, tellCoverage, TELL_RULES } from "../core/tell-lint.js";
import type { TellFinding } from "../core/tell-rules.js";
import { extractorById, EXTRACTOR_PROFILES } from "../core/design-facts/index.js";
import { scanInlineIgnores, applyInlineIgnores } from "../core/inline-ignores.js";
import { countBySeverity } from "../core/finding-schema.js";

const CMD = "tell-lint";

export const TELL_LINT_HELP = `ui tell-lint — generated-UI tells, in any language the registry can read

Usage:
  ui tell-lint <file|dir|glob>... [--no-advisory] [--json]
  ui tell-lint --coverage [--json]

A tell is an involuntary, machine-detectable sign that a surface was made without
design judgment (knowledge/design-tells.md). AI-generation fingerprints are the
salient subclass, not the definition.

Options:
  --coverage     Print the rule x extractor matrix and exit
  --no-advisory  Hide advisory findings (they never affect the exit code anyway)
  --json         Emit a JSON envelope instead of human-readable output
  -h, --help     Show this help

Severity:
  error     unambiguous: gradient-text, justified-text, side-tab
  advisory  everything else — printed, never counted toward failure

Waivers travel with the file and require a reason:
  <!-- design-os-disable side-tab -- exported brand doc -->
  /* design-os-disable-line overused-font -- client mandate */
  // design-os-disable-next-line pulsing-dot -- genuinely live data

Exit code: 1 iff any error-severity finding.

Error codes:
  BAD_ARG         No <file|dir|glob> given
  FILE_NOT_FOUND  A named path does not exist (also reported per-target as a skip)
  READ_ERROR      A target could not be read`;

interface PerFile {
  file: string;
  extractor: string;
  tier: string;
  undercount: boolean;
  findings: TellFinding[];
  notEvaluated: Array<{ id: string; reason: string }>;
  unresolvedCount: number;
  waived: number;
  degraded?: string;
}

/** Extract facts for one target. Only the HTML tier is implemented so far. */
function analyze(target: LintTarget, cwd: string): PerFile | undefined {
  const profile = extractorById(target.extractorId);
  if (profile === undefined) return undefined;
  const rel = relative(cwd, target.path) || target.path;

  // Extractors for the other tiers land in phases 06 and 07. Until then a
  // target routed to one is reported as NOT ANALYSED rather than as clean.
  if (target.extractorId !== "html-cascade") {
    return {
      file: rel,
      extractor: target.extractorId,
      tier: target.tier,
      undercount: target.undercount,
      findings: [],
      notEvaluated: TELL_RULES.map((r) => ({
        id: r.id,
        reason: `${target.extractorId} extractor not implemented yet`,
      })),
      unresolvedCount: 0,
      waived: 0,
    };
  }

  const source = readFileSync(target.path, "utf8");
  const extraction = extractHtml(source, target.path);
  const result = lintTell(extraction.collector.facts(), profile);
  const scan = scanInlineIgnores(source);
  const { kept, waived } = applyInlineIgnores(result.findings, scan);

  return {
    file: rel,
    extractor: target.extractorId,
    tier: target.tier,
    undercount: target.undercount || extraction.degraded,
    findings: kept,
    notEvaluated: result.notEvaluated,
    unresolvedCount: extraction.collector.unresolvedCount,
    waived: waived.length,
    degraded: extraction.degraded ? extraction.degradeReason : undefined,
  };
}

function renderCoverage(json: boolean): CommandResult {
  const matrix = tellCoverage(EXTRACTOR_PROFILES);
  if (json) return okJsonWithExit(CMD, { matrix }, 0);
  const lines = [`ui tell-lint --coverage — ${matrix.length} rules x ${EXTRACTOR_PROFILES.length} extractors`, ""];
  for (const row of matrix) {
    const runs = row.byExtractor.filter((b) => b.runnable).map((b) => b.extractor);
    const blocked = row.byExtractor.filter((b) => !b.runnable);
    lines.push(`  ${row.id}`);
    lines.push(`    runs: ${runs.length > 0 ? runs.join(", ") : "(nowhere)"}`);
    for (const b of blocked) lines.push(`    NOT-EVALUATED ${b.reason}`);
  }
  return { stdout: lines.join("\n"), exitCode: 0 };
}

export function runTellLint(args: ParsedArgs, cwd = process.cwd()): CommandResult {
  const json = args.flags["json"] === true;
  if (args.flags["coverage"] === true) return renderCoverage(json);

  const inputs = args.positionals;
  if (inputs.length === 0) {
    return json
      ? errJson(CMD, "BAD_ARG", "missing <file|dir|glob>")
      : errText(`ui ${CMD} requires a <file|dir|glob> argument`);
  }

  const resolution = resolveTargets(inputs, cwd);
  const hideAdvisory = args.flags["no-advisory"] === true;

  const perFile: PerFile[] = [];
  for (const target of resolution.targets) {
    const r = analyze(target, cwd);
    if (r !== undefined) perFile.push(r);
  }

  const all = perFile.flatMap((f) => f.findings);
  const counts = countBySeverity(all);
  const exitCode = counts.errorCount > 0 ? 1 : 0;

  if (json) {
    return okJsonWithExit(
      CMD,
      {
        files: perFile,
        skipped: resolution.skipped,
        truncated: resolution.truncated,
        droppedNote: resolution.droppedNote,
        ...counts,
      },
      exitCode,
    );
  }

  const lines: string[] = [`${CMD}: ${describeResolution(resolution)}`];
  if (resolution.truncated) lines.push(`  ! ${resolution.droppedNote}`);

  for (const f of perFile) {
    const shown = hideAdvisory ? f.findings.filter((x) => x.severity !== "advisory") : f.findings;
    const notes: string[] = [];
    if (f.undercount) notes.push("UNDERCOUNT");
    if (f.degraded !== undefined) notes.push(`DEGRADED: ${f.degraded}`);
    if (f.unresolvedCount > 0) notes.push(`${f.unresolvedCount} unresolved read(s)`);
    if (f.waived > 0) notes.push(`${f.waived} waived in-file`);
    if (f.notEvaluated.length > 0) notes.push(`${f.notEvaluated.length} rule(s) NOT-EVALUATED`);

    if (shown.length === 0 && notes.length === 0) continue;
    lines.push("", `${f.file}  [${f.extractor} — ${f.tier}]${notes.length > 0 ? `  (${notes.join("; ")})` : ""}`);
    for (const x of shown) {
      const mark = x.severity === "error" ? "✗" : x.severity === "warning" ? "!" : "·";
      // Two elements can trip one stylesheet line — the same rule, different
      // nodes. Printing the sentence twice with no locator reads as a bug in the
      // linter; printing the node makes it the finding it actually is.
      const where = x.nodeRef !== undefined ? ` ${x.nodeRef}` : "";
      lines.push(`  ${mark} [${x.checkId}]${x.line !== undefined ? ` line ${x.line}` : ""}${where}: ${x.message}`);
      if (x.fixHint !== undefined) lines.push(`      → ${x.fixHint}`);
    }
  }

  for (const s of resolution.skipped) lines.push(`  skipped ${relative(cwd, s.path) || s.path}: ${s.reason}`);

  lines.push(
    "",
    `${counts.errorCount} error, ${counts.warningCount} warning, ${counts.advisoryCount} advisory` +
      (hideAdvisory && counts.advisoryCount > 0 ? " (advisory hidden)" : ""),
  );
  return { stdout: lines.join("\n"), exitCode };
}

export const tellLintCommand = {
  name: CMD,
  summary: "Generated-UI tells, in any language the extractor registry can read",
  hasSubcommands: false,
  help: TELL_LINT_HELP,
  run(parsed: ParsedArgs): CommandResult {
    return runTellLint(parsed);
  },
};
