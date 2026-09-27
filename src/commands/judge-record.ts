/** `ui judge record --out <judgments.jsonl> --event <json>` — validate one judgment and append it. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errJsonWithData, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { validateJudgment } from "../core/judge-validate.js";
import type { Judgment } from "../core/judge-validate.js";
import { appendConflict, appendJudgment, readLedger } from "../core/judge-store.js";

const SUB = "judge record";

export function runJudgeRecord(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["out", "event"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const out = parsed.flags["out"], event = parsed.flags["event"];
  if (typeof out !== "string") return err("BAD_ARG", "ui judge record requires --out <judgments.jsonl>");
  if (typeof event !== "string") return err("BAD_ARG", "ui judge record requires --event <json>");

  let doc: unknown;
  try { doc = JSON.parse(event); } catch { return err("BAD_JSON", "--event is not valid JSON"); }
  const findings = validateJudgment(doc);
  if (findings.length > 0) {
    const lines = findings.map((f) => `  ✗ ${f.field}: ${f.message}`).join("\n");
    return parsed.json
      ? errJsonWithData(SUB, "SCHEMA_ERROR", `judgment is invalid (${findings.length} finding(s))`, { findings })
      : errText(`ui: judgment is invalid (${findings.length} finding(s)) — nothing appended\n${lines}\n`);
  }
  const ev = doc as Judgment;
  const path = resolve(out);
  const ledger = existsSync(path) ? readLedger(path) : { records: [], errors: [] };
  if (ledger.errors.length > 0) return err("LEDGER_INVALID", `'${out}' has ${ledger.errors.length} invalid line(s); fix them before appending (ui judge report shows which)`);
  const conflict = appendConflict(ledger.records, ev);
  if (conflict !== null) return err("DUPLICATE_ID", conflict);
  try { appendJudgment(path, ev); } catch { return err("WRITE_ERROR", `cannot write '${out}'`); }

  const state = ev.human === undefined ? "pending" : `human ${ev.human.decision}`;
  return parsed.json ? okJson(SUB, { file: path, id: ev.id, state }) : ok(`recorded judgment ${ev.id} (${ev.decisionPoint}, ${state}) → ${path}\n`);
}
