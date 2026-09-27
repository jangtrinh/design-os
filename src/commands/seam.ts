import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText } from "../core/output.js";
import { runSeamLint } from "./seam-lint.js";
export const seamCommand = {
  name: "seam",
  summary: "Ratchet runtime prose reads in the kernel source",
  hasSubcommands: true,
  help: `ui seam — source-level prose read ratchet

Usage:
  ui seam lint [--allowlist <file>] [--json]

Scans src/ below the current working directory; generated build output is excluded.
Default allowlist: schemas/seam-allowlist.json. Exits 1 for new reads or stale entries.
Text summary: reads N / allowed M / new K. JSON includes reads and findings.
Read identity is file + call + resolved paths; line numbers are evidence, not identity.

Static scan supports filesystem imports, literals, joins, local bindings and named helpers.
Dynamic evaluation, computed dispatch and externally supplied paths are not resolved.

Options:
  --allowlist <file>  Explicit allowance JSON, relative to the current directory
  --json              Emit JSON envelope

Errors: BAD_ARG | UNKNOWN_FLAG | BAD_ALLOWLIST | READ_ERROR`,
  run(parsed: ParsedArgs) {
    if (parsed.subcommand === "lint") return runSeamLint(parsed);
    const message = "expected 'ui seam lint'";
    return parsed.json ? errJson("seam", "BAD_ARG", message) : errText(`ui: ${message}\n`);
  },
};
