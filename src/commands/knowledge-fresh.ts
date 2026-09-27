/** `ui knowledge fresh <rulings.json>` — age + anchor liveness of every live ruling. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { assessFreshness, isIsoDate } from "../core/knowledge-promotion-freshness.js";
import { isRecord } from "../core/knowledge-promotion-ruling.js";

const SUB = "knowledge fresh";
const DEFAULT_DAYS = 90;

export function runKnowledgeFresh(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["root", "days", "as-of", "strict"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui knowledge fresh requires <rulings.json>");
  const rootFlag = parsed.flags["root"];
  if (rootFlag === true) return err("BAD_ARG", "--root requires a directory");
  const root = typeof rootFlag === "string" ? resolve(rootFlag) : process.cwd();
  const daysFlag = parsed.flags["days"];
  if (daysFlag !== undefined && !(typeof daysFlag === "string" && /^[1-9]\d*$/.test(daysFlag))) return err("BAD_ARG", "--days must be a positive integer");
  const days = typeof daysFlag === "string" ? Number(daysFlag) : DEFAULT_DAYS;
  const asOfFlag = parsed.flags["as-of"];
  if (asOfFlag !== undefined && !(typeof asOfFlag === "string" && isIsoDate(asOfFlag))) return err("BAD_AS_OF", "--as-of must be a YYYY-MM-DD date");
  const asOf = typeof asOfFlag === "string" ? asOfFlag : new Date().toISOString().slice(0, 10);

  let doc: unknown;
  try { doc = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch { return err("FILE_NOT_FOUND", `cannot read '${file}' as JSON`); }
  if (!isRecord(doc) || !Array.isArray(doc["rulings"])) return err("BAD_RULINGS", `'${file}' has no rulings array — run 'ui knowledge lint'`);

  const result = assessFreshness({ doc, asOf, days, pathExists: (rel) => existsSync(join(root, rel)) });
  const stale = result.rows.filter((r) => r.verdict === "stale");
  const count = (v: string): number => result.rows.filter((r) => r.verdict === v).length;
  const summary = `fresh ${count("fresh")} / stale ${stale.length} / unanchored ${count("unanchored")}`;
  const exitCode = parsed.flags["strict"] === true && stale.length > 0 ? 1 : 0;
  if (parsed.json) {
    return okJsonWithExit(SUB, { file: resolve(file), root, asOf, days, summary, notLive: result.notLive, unusable: result.unusable, stale, rows: result.rows }, exitCode);
  }
  const lines = [`knowledge fresh: ${resolve(file)} — as of ${asOf}, threshold ${days}d`];
  if (stale.length > 0) lines.push("STALE:", ...stale.map((r) => `  ✗ ${r.id} — ${r.reasons.join("; ")}`));
  lines.push(summary, `(${result.notLive} not live and ${result.unusable} unusable ruling(s) not assessed)`);
  return { exitCode, stdout: `${lines.join("\n")}\n` };
}
