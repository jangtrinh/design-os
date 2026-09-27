/** `ui knowledge lint <rulings.json>` — IO shell over the pure rulings linter. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { lintRulings } from "../core/rulings-lint.js";

const SUB = "knowledge lint";

export function runRulingsLint(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["root"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui knowledge lint requires <rulings.json>");
  const rootFlag = parsed.flags["root"];
  if (rootFlag === true) return err("BAD_ARG", "--root requires a directory");
  const root = typeof rootFlag === "string" ? resolve(rootFlag) : process.cwd();

  let raw: string;
  try { raw = readFileSync(resolve(file), "utf8"); }
  catch { return err("FILE_NOT_FOUND", `cannot read rulings file '${file}'`); }
  let doc: unknown;
  try { doc = JSON.parse(raw); }
  catch { return err("BAD_JSON", `'${file}' is not valid JSON`); }

  const findings = lintRulings({ doc, pathExists: (rel) => existsSync(join(root, rel)) });
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const exitCode = errorCount > 0 ? 1 : 0;
  if (parsed.json) return okJsonWithExit(SUB, { file: resolve(file), root, findings, errorCount, warningCount }, exitCode);
  const head = `knowledge lint: ${resolve(file)} — ${errorCount} error(s), ${warningCount} warning(s)`;
  const lines = findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]: ${f.message}`);
  return { exitCode, stdout: `${[head, ...lines].join("\n")}\n` };
}
