/**
 * `ui build-evidence` — the linter half of the build-loop standard
 * (knowledge/build-loop.md is the emitter half). Checks a builder's evidence
 * folder rule by rule and reports PASS / FAIL / SKIPPED-with-reason.
 *
 * A separate top-level command, not a subcommand of `ui evidence` — that name
 * is already the user-evidence ledger (add/list/verify/show, DESIGN-OS T6):
 * an unrelated anti-fabrication findings store, not this build-evidence check.
 */
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { isEvidenceDir, runEvidenceLint } from "../core/build-evidence-rules-shared.js";

const CMD = "build-evidence";
const DEFAULT_WIDTHS = [375, 768, 1440];

export const BUILD_EVIDENCE_HELP = `ui build-evidence — the build-loop standard's linter half

Usage:
  ui build-evidence lint <dir> [--widths 375,768,1440] [--json]

Subcommands:
  lint  Reads a builder's evidence folder (knowledge/build-loop.md) and reports, per rule,
        PASS / FAIL / SKIPPED-with-reason:
          r1 one probe JSON beside every screenshot PNG (same stem, or probe-<width>.json)
          r2 every required width present as a screenshot PNG
          r3 probe JSON's scrollWidth/innerWidth (or scrollW/width) has scroll <= inner
          r4 gates.txt names an inlined variant; every recorded exit= is 0 or in deviations.md
          r5 deviations.md exists; every entry carries a number+unit/ratio (px, %, :1, ms)
          r6 a red-probe line (a deliberately-bad-input non-zero exit) exists somewhere
          r7 probe JSON's font check is true, or the PNGs are marked fallback-face in deviations.md

Real probe JSONs vary their keys (scrollW/innerW vs scrollWidth/innerWidth vs scrollW/width) and
their filename (a per-width sidecar, probe-<width>.json, a single probe.json keyed by widths[width],
or a single probes.json keyed by "<stem>-<width>") — all forms are read.

Options:
  --widths LIST  Comma-separated required widths (default 375,768,1440)
  --json         Emit a JSON envelope { dir, widths, rules, passCount, failCount, skippedCount }
  -h, --help     Show this help

Exit codes:
  0  Every rule PASS or SKIPPED
  1  One or more rules FAIL, or a user/file error
  2  The evidence folder does not exist

Error codes:
  BAD_ARG       Missing <dir>, or --widths is not a comma-separated list of positive numbers
  UNKNOWN_FLAG  Unrecognised --flag
  DIR_NOT_FOUND The evidence folder does not exist (exit 2)
`;

const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined);
function fail(useJson: boolean, sub: string, code: string, msg: string): CommandResult {
  return useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
}

function runLint(parsed: ParsedArgs): CommandResult {
  const sub = "build-evidence lint";
  const useJson = parsed.json;
  const unknown = findUnknownFlag(parsed.flags, ["widths"]);
  if (unknown) return fail(useJson, sub, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const dir = parsed.positionals[0];
  if (dir === undefined) return fail(useJson, sub, "BAD_ARG", "ui build-evidence lint requires <dir>");

  let widths = DEFAULT_WIDTHS;
  const widthsFlag = str(parsed.flags["widths"]);
  if (widthsFlag !== undefined) {
    const parsedWidths = widthsFlag.split(",").map((s) => Number(s.trim()));
    if (parsedWidths.length === 0 || parsedWidths.some((n) => !Number.isFinite(n) || n <= 0)) {
      return fail(useJson, sub, "BAD_ARG", `--widths must be a comma-separated list of positive numbers (got '${widthsFlag}')`);
    }
    widths = parsedWidths;
  }

  if (!isEvidenceDir(dir)) {
    const msg = `evidence folder not found: '${dir}'`;
    return useJson
      ? { ...errJson(sub, "DIR_NOT_FOUND", msg), exitCode: 2 }
      : { exitCode: 2, stderr: `ui: ${msg}\n` };
  }

  const report = runEvidenceLint(dir, widths);
  const exitCode = report.failCount > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(sub, report, exitCode);

  const verdictMark = (v: string): string => (v === "PASS" ? "✓" : v === "FAIL" ? "✗" : "•");
  const lines = [
    `build-evidence lint: ${dir} — ${report.passCount} PASS, ${report.failCount} FAIL, ${report.skippedCount} SKIPPED`,
    ...report.rules.map((r) => `  ${verdictMark(r.verdict)} ${r.id} ${r.title}${r.reason ? `: ${r.reason}` : ""}`),
  ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

export const buildEvidenceCommand = {
  name: CMD,
  summary: "The build-loop standard's linter half (r1-r7 over a builder's evidence folder)",
  hasSubcommands: true,
  help: BUILD_EVIDENCE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "lint": return runLint(parsed);
      case undefined: return fail(parsed.json, CMD, "BAD_ARG", "ui build-evidence requires a subcommand (lint). Run 'ui build-evidence --help'.");
      default: return fail(parsed.json, CMD, "BAD_ARG", `unknown subcommand '${parsed.subcommand}'. Run 'ui build-evidence --help'.`);
    }
  },
};
