/** `ui knowledge ledger <lint|append> …` — dispatcher for the learning-ledger contract. */
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { runLedgerAppend } from "./knowledge-ledger-append.js";
import { runLedgerLint } from "./knowledge-ledger-lint.js";

export const LEDGER_HELP = `  ledger lint    Check a learning ledger (JSON Lines or {entries:[…]}) against schemas/learning-event.schema.json:
                 schema, duplicate ids, telemetry kinds rejected, correction/approval without an r-* ref; exit 1 on any error.
  ledger append  Validate one --event <json> and append it as one line (never rewrites; refuses a JSON-document ledger).
`;

export function runKnowledgeLedger(parsed: ParsedArgs): CommandResult {
  const [verb, file] = parsed.positionals;
  if (verb === "lint") return runLedgerLint(parsed, file);
  if (verb === "append") return runLedgerAppend(parsed, file);
  const msg = "ui knowledge ledger requires a verb: lint <events.jsonl> | append <events.jsonl> --event <json>";
  return parsed.json ? errJson("knowledge ledger", "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
}
