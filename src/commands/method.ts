import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText } from "../core/output.js";
import { runMethodLint } from "./method-lint.js";

const CMD = "method";
export const METHOD_HELP = `ui method — lint one feature's six-step design-thinking run

Usage:
  ui method lint <run.json> [--json]

The run follows frame, define, explore, decide, build, verify. A school label
is vocabulary only; it does not change the steps. Define references a brief.json
relative to run.json. Skipped steps need a fixed reason code and detail; a done
decide or verify step cannot leave a human question unanswered.

Options:
  --json  Emit the findings envelope and six-cell status line
  -h, --help  Show this help

Error codes:
  BAD_ARG             Missing or extra argument
  UNKNOWN_FLAG        Unrecognised --flag
  FILE_NOT_FOUND      Cannot read run.json
  BAD_JSON            run.json is not valid JSON
  SCHEMA_UNAVAILABLE  Installed schema file cannot be read
`;

export const methodCommand = {
  name: CMD,
  summary: "Lint a six-step method run and its defining brief",
  hasSubcommands: true,
  help: METHOD_HELP,
  run(parsed: ParsedArgs): CommandResult {
    if (parsed.subcommand === "lint") return runMethodLint(parsed);
    const message = "ui method requires lint <run.json>. Run 'ui method --help'.";
    return parsed.json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`);
  },
};
