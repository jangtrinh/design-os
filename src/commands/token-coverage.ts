/**
 * `ui token-coverage <file.html> [--tokens <f>] [--floor <0..1>] [--json]` —
 * does the page actually STYLE with the project's tokens, or hardcode values
 * a token already covers? Complements ds-usage-lint.ts (colour-only, var-
 * reference honesty) with a coverage NUMBER across every value-bearing
 * category: color, font-family, font-size, spacing, radius, shadow. See
 * token-coverage.ts for the classify-and-aggregate algorithm.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { TokenCoverageResult } from "../core/token-coverage.js";
import { resolveProjectTokensPath, collectCssSources, scoreTokenCoverage } from "../core/token-coverage-io.js";

const CMD = "token-coverage";
export const DEFAULT_TOKEN_COVERAGE_FLOOR = 0.8;

export const TOKEN_COVERAGE_HELP = `ui token-coverage — does the page style with the project's own tokens?

Usage:
  ui token-coverage <file.html> [--tokens <design.tokens.json>] [--floor <0..1>] [--json]

For every color, font-family, font-size, spacing (margin/padding/gap), radius
and shadow declaration in the file's own CSS (inline style="", <style>
blocks, and locally linked stylesheets), classifies the value:
  token    var(--x) resolving to a project token, or a literal equal to a
           token's resolved value.
  derived  calc(...), a percentage, or a relative unit (em/rem/vw/vh/...) —
           legitimate and lower-signal, never counted as raw.
  raw      anything else — a hardcoded literal a token could have covered.

Prints coverage = token / (token + raw) per category and overall; a category
with nothing to fail on (0 token + 0 raw) reports coverage 1. Token-
DECLARATION blocks (:root/@theme/[data-theme]/.dark) are excluded — they hold
the token literals themselves, not usage to grade.

Options:
  --tokens <f>  Token file to grade against (default: auto-detect via the
                design-dir contract, then brand/design/design.tokens.json)
  --floor <n>   Minimum overall coverage to exit 0 (default: 0.8)
  --json        Emit a JSON envelope
  -h, --help    Show this help

Exit codes:
  0  overall coverage >= floor
  1  overall coverage < floor, or a user/file error

Error codes:
  BAD_ARG           Missing <file.html>, or --floor not a number in [0,1]
  FILE_NOT_FOUND    Input HTML file does not exist
  READ_ERROR        Input HTML file exists but cannot be read
  TOKENS_NOT_FOUND  No token file given or auto-detected — pass --tokens or run 'ui ds init'
  BAD_JSON          Token file is not valid JSON / fails DTCG validation
`;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatReport(file: string, floor: number, r: TokenCoverageResult): string {
  const lines = [
    `token-coverage: ${file} — overall ${pct(r.overall.coverage)} (floor ${pct(floor)}) — ${r.overall.coverage >= floor ? "PASS" : "FAIL"}`,
  ];
  for (const [cat, c] of Object.entries(r.categories)) {
    lines.push(`  ${cat}: ${pct(c.coverage)} (${c.token} token / ${c.raw} raw / ${c.derived} derived, ${c.total} total)`);
  }
  return lines.join("\n") + "\n";
}

export const tokenCoverageCommand = {
  name: CMD,
  summary: "Does the page style with the project's own tokens? Coverage per category, floor-gated",
  hasSubcommands: false,
  help: TOKEN_COVERAGE_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const err = (code: string, msg: string): CommandResult =>
      useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

    const file = parsed.positionals[0];
    if (file === undefined) return err("BAD_ARG", "ui token-coverage requires a <file.html> argument");

    let html: string;
    try {
      html = readFileSync(file, "utf8");
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      return err(
        isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR",
        isNotFound ? `file not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const floorFlag = parsed.flags["floor"];
    let floor = DEFAULT_TOKEN_COVERAGE_FLOOR;
    if (typeof floorFlag === "string") {
      const n = Number(floorFlag);
      if (!Number.isFinite(n) || n < 0 || n > 1) return err("BAD_ARG", `--floor must be a number in [0,1], got '${floorFlag}'`);
      floor = n;
    }

    const tokensFlag = parsed.flags["tokens"];
    const tokensPath = typeof tokensFlag === "string" ? resolve(tokensFlag) : resolveProjectTokensPath(dirname(resolve(file)));
    if (tokensPath === undefined || !existsSync(tokensPath)) {
      return err("TOKENS_NOT_FOUND", "no token file given or auto-detected — pass --tokens or run 'ui ds init'");
    }

    // A1/C1: a locally linked stylesheet that cannot be read is an error
    // finding, never silence — it also forces the check to FAIL regardless
    // of the coverage number, since that number was computed over an
    // incomplete picture of the page's real CSS.
    const { errors: linkErrors } = collectCssSources(file, html);
    let result: TokenCoverageResult;
    try {
      result = scoreTokenCoverage(file, html, tokensPath);
    } catch (e) {
      return err("BAD_JSON", `bad token file '${tokensPath}': ${e instanceof Error ? e.message : String(e)}`);
    }
    const exitCode = result.overall.coverage >= floor && linkErrors.length === 0 ? 0 : 1;

    if (useJson) return okJsonWithExit(CMD, { file, floor, ...result, linkedCssErrors: linkErrors }, exitCode);
    let report = formatReport(file, floor, result);
    if (linkErrors.length > 0) {
      report += linkErrors.map((e) => `  ✗ [${e.checkId}]: ${e.message}\n`).join("");
    }
    return { exitCode, stdout: report };
  },
};
