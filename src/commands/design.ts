/**
 * `ui design` — the `design/` directory contract (schemas/design-dir.schema.json,
 * docs/design-directory.md). lint reports deviations; principles-index emits the machine
 * index of principles.md. Deterministic: reads files and `git ls-files`, no network, no model.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText } from "../core/output.js";
import { runDesignLint } from "./design-lint.js";
import { runPrinciplesIndex } from "./design-principles-index.js";

const CMD = "design";
export const DESIGN_HELP = `ui design — the design/ directory contract

Usage:
  ui design lint <project-root> [--json]
  ui design principles-index <principles.md> --out <principles.json> [--check] [--json]

Subcommands:
  lint              Report every deviation from the layout in docs/design-directory.md, each with
                    a fix hint: extra token files, tracked logs/caches, art direction outside
                    design/, supersession outside rulings, missing or stale principles index,
                    stale ingest. Exit 1 on any error; warnings are advisory.
  principles-index  Emit design/principles.json (id, title, yields_when, test) from the
                    "### <ID> · <title>" headings of principles.md. --check exits 1 on drift.

Options:
  --out <file>  Where the index is written (or compared, with --check)
  --check       Do not write; exit 1 when the index is missing or differs
  --json        Emit the JSON envelope
  -h, --help    Show this help

Error codes:
  BAD_ARG          Missing or extra argument
  UNKNOWN_FLAG     Unrecognised --flag
  NOT_A_DIRECTORY  <project-root> is not a directory
  SCHEMA_UNAVAILABLE  Installed design-dir schema cannot be read
  FILE_NOT_FOUND   Cannot read principles.md
  BAD_PRINCIPLES   An entry lacks Yields-when or Test, an id repeats, or none were found
  WRITE_ERROR      Cannot write the index
`;

export const designCommand = {
  name: CMD,
  summary: "Lint the design/ directory contract and emit the principles index",
  hasSubcommands: true,
  help: DESIGN_HELP,
  run(parsed: ParsedArgs): CommandResult {
    if (parsed.subcommand === "lint") return runDesignLint(parsed);
    if (parsed.subcommand === "principles-index") return runPrinciplesIndex(parsed);
    const message = "ui design requires lint <project-root> or principles-index <principles.md>. Run 'ui design --help'.";
    return parsed.json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`);
  },
};
