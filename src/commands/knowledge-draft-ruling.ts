/** `ui knowledge draft-ruling --from <correction.json> --out <rulings-draft.json>` — correction → draft ruling stub. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { draftRulingFromCorrection } from "../core/knowledge-promotion-draft.js";
import { isIsoDate } from "../core/knowledge-promotion-freshness.js";
import { rulingCandidateEvent } from "../core/knowledge-ledger-event.js";
import { appendLedgerEvent } from "../core/knowledge-ledger-write.js";

const SUB = "knowledge draft-ruling";

export function runKnowledgeDraftRuling(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["from", "out", "as-of", "force", "ledger"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const from = parsed.flags["from"];
  const out = parsed.flags["out"];
  if (typeof from !== "string") return err("BAD_ARG", "ui knowledge draft-ruling requires --from <correction.json>");
  if (typeof out !== "string") return err("BAD_ARG", "ui knowledge draft-ruling requires --out <rulings-draft.json>");
  const ledgerFlag = parsed.flags["ledger"];
  if (ledgerFlag !== undefined && typeof ledgerFlag !== "string") return err("BAD_ARG", "--ledger requires a path to a JSON Lines ledger");
  const asOf = parsed.flags["as-of"];
  if (asOf !== undefined && !(typeof asOf === "string" && isIsoDate(asOf))) return err("BAD_AS_OF", "--as-of must be a YYYY-MM-DD date");
  const today = typeof asOf === "string" ? asOf : new Date().toISOString().slice(0, 10);

  let correction: unknown;
  try { correction = JSON.parse(readFileSync(resolve(from), "utf8")); }
  catch { return err("FILE_NOT_FOUND", `cannot read '${from}' as JSON`); }
  const drafted = draftRulingFromCorrection(correction, today);
  if (!drafted.ok) return err("BAD_CORRECTION", `'${from}' is not a usable correction: ${drafted.problems.join("; ")}`);

  const outPath = resolve(out);
  if (existsSync(outPath) && parsed.flags["force"] !== true) return err("OUT_EXISTS", `'${out}' already exists — pass --force to overwrite it`);
  const id = String(drafted.doc.rulings[0]?.["id"]);
  let ledgerRecorded = false;
  if (typeof ledgerFlag === "string") {
    const appended = appendLedgerEvent(ledgerFlag, rulingCandidateEvent(drafted.doc.rulings[0] ?? {}, today));
    // A duplicate id means this exact draft is already on the ledger: recording it once is the intended outcome.
    if (!appended.ok && appended.code !== "DUPLICATE_ID") return err(appended.code, appended.message);
    ledgerRecorded = appended.ok;
  }
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(drafted.doc, null, 2)}\n`, "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write ${outPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ledger = typeof ledgerFlag === "string" ? { ledger: resolve(ledgerFlag), ledgerEvent: `ev-rc-${id}`, ledgerRecorded } : {};
  if (parsed.json) return okJson(SUB, { file: outPath, id, ...ledger });
  const note = typeof ledgerFlag === "string" ? `; ledger ${ledgerRecorded ? "event appended" : "already had the event"}` : "";
  return { exitCode: 0, stdout: `knowledge draft-ruling: wrote ${outPath} (${id}, status draft, approved_by [])${note}\n` };
}
