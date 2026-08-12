import { readFileSync } from "node:fs";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { lintDiagram } from "../core/diagram-lint.js";

const CMD = "diagram";

export const DIAGRAM_HELP = `ui diagram — deterministic diagram artifact checks

Usage:
  ui diagram lint <diagram.html> [--json]

Subcommands:
  lint    Check the self-contained HTML and owned inline SVG contract

Options:
  --json      Emit a JSON envelope { file, errorCount, warningCount, findings }
  -h, --help  Show this help

Exit codes:
  0  No error findings
  1  Error findings or a user/file error

Error codes:
  BAD_ARG        Missing subcommand or <diagram.html>
  UNKNOWN_FLAG   Unrecognised --flag
  FILE_NOT_FOUND The input file does not exist
  READ_ERROR     The input file cannot be read
`;

function runLint(parsed: ParsedArgs): CommandResult {
  const command = "diagram lint";
  const file = parsed.positionals[0];
  if (file === undefined) {
    const message = "ui diagram lint requires <diagram.html>";
    return parsed.json ? errJson(command, "BAD_ARG", message) : errText(`ui: ${message}\n`);
  }

  let html: string;
  try {
    html = readFileSync(file, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    const code = missing ? "FILE_NOT_FOUND" : "READ_ERROR";
    const message = missing
      ? `file not found: '${file}'`
      : `cannot read '${file}': ${error instanceof Error ? error.message : String(error)}`;
    return parsed.json ? errJson(command, code, message) : errText(`ui: ${message}\n`);
  }

  const result = lintDiagram(html);
  const exitCode = result.errorCount > 0 ? 1 : 0;
  if (parsed.json) return okJsonWithExit(command, { file, ...result }, exitCode);

  const lines = result.findings.length === 0
    ? [`diagram lint: ${file} — 0 error(s), 0 warning(s)`]
    : [
        `diagram lint: ${file} — ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
        ...result.findings.map((item) =>
          `  ✗ [${item.checkId}]${item.elementId ? ` ${item.elementId}:` : ""} ${item.message}`
        ),
      ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

export const diagramCommand = {
  name: CMD,
  summary: "Lint self-contained diagram artifacts deterministically",
  hasSubcommands: true,
  help: DIAGRAM_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "lint":
        return runLint(parsed);
      case undefined: {
        const message = "ui diagram requires a subcommand. Run 'ui diagram --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`);
      }
      default: {
        const message = `unknown subcommand '${parsed.subcommand}'. Run 'ui diagram --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`);
      }
    }
  },
};
