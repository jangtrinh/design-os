/** `ui knowledge ledger append <events.jsonl> --event <json>` — validate one event, then append it as one line. */
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { appendLedgerEvent } from "../core/knowledge-ledger-write.js";

const SUB = "knowledge ledger append";

export function runLedgerAppend(parsed: ParsedArgs, file: string | undefined): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["event"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (file === undefined) return err("BAD_ARG", "ui knowledge ledger append requires <events.jsonl>");
  const eventFlag = parsed.flags["event"];
  if (typeof eventFlag !== "string") return err("BAD_ARG", "ui knowledge ledger append requires --event <json>");
  let event: unknown;
  try { event = JSON.parse(eventFlag); } catch { return err("BAD_JSON", "--event is not valid JSON"); }
  const r = appendLedgerEvent(file, event);
  if (!r.ok) return err(r.code, r.message);
  if (parsed.json) return okJson(SUB, { file: r.file, id: r.id, created: r.created });
  return { exitCode: 0, stdout: `knowledge ledger append: ${r.created ? "created" : "appended to"} ${r.file} (${r.id})\n` };
}
