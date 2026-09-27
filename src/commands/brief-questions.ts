/** `ui brief questions <questions.json> --format claude|markdown` — runtime adapters over questions.json. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { parseQuestionsDoc, toClaudePayload, toGapSheet } from "../core/brief-questions-format.js";

const SUB = "brief questions";
const FORMATS = ["claude", "markdown"] as const;

export function runBriefQuestions(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["format"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui brief questions requires <questions.json>");
  const format = parsed.flags["format"] ?? "claude";
  if (typeof format !== "string" || !(FORMATS as readonly string[]).includes(format)) {
    return err("BAD_ARG", `--format must be one of ${FORMATS.join("|")}`);
  }
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch (e) { return err(e instanceof SyntaxError ? "BAD_JSON" : "FILE_NOT_FOUND", `cannot read '${file}' as JSON`); }
  const doc = parseQuestionsDoc(raw);
  if (typeof doc === "string") return err("BAD_QUESTIONS", `'${file}': ${doc}`);
  if (format === "markdown") return { exitCode: 0, stdout: toGapSheet(doc) };
  return { exitCode: 0, stdout: `${JSON.stringify(toClaudePayload(doc), null, 2)}\n` };
}
