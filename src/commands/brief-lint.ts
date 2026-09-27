/** `ui brief lint <brief.json>` — schema check, route rules and the D4 receipt. IO shell over src/core/brief-*. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { validateBrief } from "../core/brief-validate.js";
import { d4Receipt, findBlockingFields } from "../core/brief-rules.js";
import type { BriefRecord } from "../core/brief-rules.js";
import { buildQuestions } from "../core/brief-questions-build.js";

const SUB = "brief lint";
export const EXIT_CONTINUE = 0;
export const EXIT_SCHEMA_ERROR = 1;
export const EXIT_BLOCKED = 2;

export function runBriefLint(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["questions"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui brief lint requires <brief.json>");
  const out = parsed.flags["questions"];
  if (out === true) return err("BAD_ARG", "--questions requires an output path");

  let doc: unknown;
  try { doc = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch (e) { return err(e instanceof SyntaxError ? "BAD_JSON" : "FILE_NOT_FOUND", `cannot read '${file}' as JSON`); }

  const findings = validateBrief(doc);
  if (findings.length > 0) {
    if (parsed.json) return okJsonWithExit(SUB, { file: resolve(file), findings, errorCount: findings.length }, EXIT_SCHEMA_ERROR);
    const lines = findings.map((f) => `  ✗ [${f.checkId}] ${f.field}: ${f.message}`);
    return { exitCode: EXIT_SCHEMA_ERROR, stdout: `brief lint: ${resolve(file)} — ${findings.length} schema error(s)\n${lines.join("\n")}\n` };
  }

  const brief = doc as BriefRecord;
  const blocking = findBlockingFields(brief);
  const d4 = d4Receipt(brief, blocking);
  const questions = buildQuestions(brief, blocking, d4);
  if (typeof out === "string") {
    try { writeFileSync(resolve(out), `${JSON.stringify(questions, null, 2)}\n`, "utf8"); }
    catch { return err("WRITE_ERROR", `cannot write questions to '${out}'`); }
  }
  const exitCode = d4.decision === "CONTINUE" ? EXIT_CONTINUE : EXIT_BLOCKED;
  if (parsed.json) return okJsonWithExit(SUB, { file: resolve(file), surface: brief["surface"], blocking, d4, questionCount: questions.questions.length }, exitCode);
  const lines = blocking.map((b) => `  ${b.routeChanging ? "‼" : "•"} ${b.field}: ${b.reason}`);
  const head = `brief lint: ${resolve(file)} — ${String(brief["surface"])}`;
  const receipt = `d4: B=${d4.B} R=${d4.R ? "yes" : "no"} L=${d4.L} → ${d4.decision}`;
  return { exitCode, stdout: `${[head, ...lines, receipt].join("\n")}\n` };
}
