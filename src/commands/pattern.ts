import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText } from "../core/output.js";
import { runPatternLint } from "./pattern-lint.js";

const CMD = "pattern";
export const PATTERN_HELP = `ui pattern — check screen-pattern cards

Usage:
  ui pattern lint <card.json|dir> [--json]

A pattern card records what one screen archetype looks like across n observed
screens: distributions and component breakdowns as counts over n, with
observed(mobbin:<id>) evidence and never an image path. Lint checks the
schema (schemas/pattern-card.schema.json), every share against n, unique
evidence ids, the n >= 8 floor (below it only as a flagged draft), and that
no image path or URL appears. A directory is searched recursively for .json.

Options:
  --json  Emit the per-file findings envelope
  -h, --help  Show this help

Error codes:
  BAD_ARG             Missing or extra argument
  UNKNOWN_FLAG        Unrecognised --flag
  FILE_NOT_FOUND      Cannot read the file, or the directory holds no .json
  BAD_JSON            A card is not valid JSON
  SCHEMA_UNAVAILABLE  Installed schema file cannot be read
`;

export const patternCommand = {
  name: CMD,
  summary: "Lint screen-pattern cards (shares over n, evidence, floor)",
  hasSubcommands: true,
  help: PATTERN_HELP,
  run(parsed: ParsedArgs): CommandResult {
    if (parsed.subcommand === "lint") return runPatternLint(parsed);
    const message = "ui pattern requires lint <card.json|dir>. Run 'ui pattern --help'.";
    return parsed.json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`);
  },
};
