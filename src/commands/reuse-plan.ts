/**
 * `ui reuse-plan` — check a task's reuse plan against the project's design system.
 * The plan is the Markdown file an agent writes BEFORE building a screen: for each slot,
 * the first ladder rung that holds (knowledge/design-reuse-ladder.md). Today: `check`.
 */
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { runReusePlanCheck } from "./reuse-plan-check-impl.js";

const CMD = "reuse-plan";

export const REUSE_PLAN_HELP = `ui reuse-plan — check a reuse plan against the design system registry

Usage:
  ui reuse-plan check <file> [--dir <project>] [--file <registry>] [--tokens <file>] [--json]

Subcommands:
  check   Validate every name in the plan against the component registry (default
          <project>/design/component-registry.json), pattern names against that registry and
          <project>/design/patterns/*.md (by file stem), and token paths against the tokens
          (default <project>/design/design.tokens.json). Deterministic, offline.

Plan format (Markdown, one section per screen):
  ## Screen: <screen name>
  Pattern: <registered template name | none — reason>

  | Slot | Rung | Use | Reason |
  |---|---|---|---|
  | header | 3 | Page header/Default | — |
  | owner chip | 7 | ds-new: Owner chip | no email chip in registry |

Rungs (stop at the first that holds):
  1 skip (reason)  2 template  3 registered component  4 'Name (Axis=Value)'
  5 'A + B' composition  6 token paths 'a.b, c.d'  7 'ds-new: <Name>' + reason

Options:
  --dir <path>      Project directory holding design/ (default: cwd)
  --file <path>     Registry file; the same one 'ui registry list/lookup --file' reads
  --tokens <path>   Token file for rung 6 (default: <project>/design/design.tokens.json)
  --json            Emit a JSON envelope { file, registry, tokens, ok, errorCount, warningCount,
                    findings, warnings, screens, dsNew }
  -h, --help        Show this help

Output:
  The header names the registry and the token file checked. Per screen
  'reuse: <rung 2-6 slots>/<all slots except rung 1>' plus 'N skipped' for rung 1, and the
  pattern with its source (design/patterns or registry); then the ds-new items for the owner
  (a hint line when a name is close to a registered one — a hint, never a finding).
  A rung-2-6 slot with any finding is not counted as reuse.
  Templates (one set for the Pattern line and rung 2): design/patterns file stems, registry
  Pattern/* names, and registry records whose category matches page|template|pattern|layout|screen.
  With none declared, any registered name is accepted and NO_TEMPLATES_DECLARED is warned once.
  Names marked [ARCHIVED], [DEPRECATED], ❌ or matching the repo's deprecation vocabulary are
  findings; [REVIEW] names are counted warnings. A rung-4 'Axis=Value' is checked against the
  record's variants when it declares any.

Exit codes:
  0  No findings
  1  One or more findings, or a usage error
  2  Cannot run: no registry, unreadable registry, or unreadable plan file

Finding codes:
  EMPTY_PLAN  EMPTY_SCREEN  ROW_OUTSIDE_SCREEN  BAD_ROW  BAD_RUNG  EMPTY_USE
  MISSING_PATTERN  PATTERN_NONE_NO_REASON  UNKNOWN_PATTERN  PATTERN_NOT_TEMPLATE
  UNKNOWN_COMPONENT  RUNG2_NOT_TEMPLATE  BAD_VARIANT  BAD_VARIANT_VALUE  BAD_COMPOSITION
  LIFECYCLE_NAME  UNRESOLVED_TOKEN  SKIP_WITHOUT_REASON  NEW_MISSING_PREFIX  NEW_WITHOUT_NAME
  NEW_WITHOUT_REASON  NEW_AT_WRONG_RUNG  NOT_NEW  DUPLICATE_PATTERN  SCREEN_HEADING_MALFORMED
  UNSUPPORTED_TABLE
Warning codes:
  REVIEW_NAME  NO_TEMPLATES_DECLARED

Error codes:
  BAD_ARG             Missing subcommand or <file>
  UNKNOWN_FLAG        Unrecognised --flag
  FILE_NOT_FOUND      The plan file does not exist
  READ_ERROR          The plan or registry cannot be read
  REGISTRY_NOT_FOUND  No component registry under <project>/design
  BAD_REGISTRY        The registry is invalid JSON or the wrong shape
`;

export const reusePlanCommand = {
  name: CMD,
  summary: "Check a reuse plan (design reuse ladder) against the registry",
  hasSubcommands: true,
  help: REUSE_PLAN_HELP,

  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "check": return runReusePlanCheck(parsed);
      case undefined: {
        const msg = "ui reuse-plan requires a subcommand. Run 'ui reuse-plan --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui reuse-plan --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
