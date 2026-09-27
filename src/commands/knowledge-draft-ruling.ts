/** `ui knowledge draft-ruling --from <correction.json> --out <rulings-draft.json>` — correction → draft ruling stub. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { draftRulingFromCorrection } from "../core/knowledge-promotion-draft.js";
import { isIsoDate } from "../core/knowledge-promotion-freshness.js";

const SUB = "knowledge draft-ruling";

export function runKnowledgeDraftRuling(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["from", "out", "as-of", "force"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const from = parsed.flags["from"];
  const out = parsed.flags["out"];
  if (typeof from !== "string") return err("BAD_ARG", "ui knowledge draft-ruling requires --from <correction.json>");
  if (typeof out !== "string") return err("BAD_ARG", "ui knowledge draft-ruling requires --out <rulings-draft.json>");
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
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(drafted.doc, null, 2)}\n`, "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write ${outPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const id = String(drafted.doc.rulings[0]?.["id"]);
  if (parsed.json) return okJson(SUB, { file: outPath, id });
  return { exitCode: 0, stdout: `knowledge draft-ruling: wrote ${outPath} (${id}, status draft, approved_by [])\n` };
}
