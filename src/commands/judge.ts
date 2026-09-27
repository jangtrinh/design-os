/** `ui judge` — the System One shadow judge: record picks beside human decisions, report agreement. */
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { runJudgeRecord } from "./judge-record.js";
import { runJudgeReport } from "./judge-report.js";

const CMD = "judge";

export const JUDGE_HELP = `ui judge — System One shadow judge (records only, never enforces)

Usage:
  ui judge record --out <judgments.jsonl> --event <json> [--json]
  ui judge report <judgments.jsonl> [--families <families.json>] [--json]

Subcommands:
  record   Validate one judgment against schemas/judgment.schema.json and append it. A judgment names a
           decision point (art-direction | persona-family | layout-archetype | copy-language), the
           candidates, the pick with at least one evidence ref (persona-dossier | pattern-card | ruling
           r-*), and the kernel constraints that applied. The human decision arrives as a second line
           with the same id that repeats the pending judgment unchanged and adds 'human'
           (accepted | changed-to <x> | rejected). Nothing is rewritten.
  report   Agreement between the shadow pick and the human decision per decision point, with sample
           sizes. Below n = 5 resolved judgments it prints "not enough data" and the count, never a
           rate. --families validates knowledge/personas/families.json against
           schemas/persona-families.schema.json and checks that persona-family judgments name
           families that exist.

Exit codes: 0 ok · 1 invalid input, invalid ledger line, invalid families file, or unknown family ref.

Error codes:
  BAD_ARG | UNKNOWN_FLAG | BAD_JSON | SCHEMA_ERROR | LEDGER_INVALID | DUPLICATE_ID | WRITE_ERROR | FILE_NOT_FOUND
`;

export const judgeCommand = {
  name: CMD,
  summary: "System One shadow judge: record shadow picks beside human decisions, report agreement per decision point",
  hasSubcommands: true,
  help: JUDGE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "record": return runJudgeRecord(parsed);
      case "report": return runJudgeReport(parsed);
      case undefined: {
        const msg = "ui judge requires a subcommand (record, report). Run 'ui judge --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui judge --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
