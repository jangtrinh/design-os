/** `ui knowledge ledger lint <events.jsonl> [--json]` — IO shell over the pure learning-ledger linter. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { lintLedgerEvents } from "../core/knowledge-ledger-event.js";
import { parseLedger } from "../core/knowledge-promotion-ledger.js";

const SUB = "knowledge ledger lint";

export function runLedgerLint(parsed: ParsedArgs, file: string | undefined): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, []);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  if (file === undefined) return err("BAD_ARG", "ui knowledge ledger lint requires <events.jsonl>");
  let raw: string;
  try { raw = readFileSync(resolve(file), "utf8"); } catch { return err("FILE_NOT_FOUND", `cannot read ledger '${file}'`); }
  const ledger = parseLedger(raw);
  if (ledger === null) return err("BAD_LEDGER", `'${file}' is neither JSON Lines nor a JSON document`);

  const lint = lintLedgerEvents(ledger.records);
  const unreadable = ledger.skippedLines;
  const findings = unreadable > 0
    ? [...lint.findings, { checkId: "unreadable-line", severity: "error" as const, message: `${unreadable} non-empty line(s) are not valid JSON`, id: "(file)" }]
    : lint.findings;
  const errorCount = findings.length;
  const exitCode = errorCount > 0 ? 1 : 0;
  const data = {
    file: resolve(file), events: lint.events, cleanEvents: lint.cleanEvents, withoutRulingRef: lint.withoutRulingRef,
    unreadableLines: unreadable, byType: lint.byType, errorCount, findings,
  };
  if (parsed.json) return okJsonWithExit(SUB, data, exitCode);
  const head = `knowledge ledger lint: ${data.file} — ${lint.events} event(s), ${lint.cleanEvents} clean, ${lint.withoutRulingRef} without a ruling ref, ${errorCount} error(s)`;
  const lines = findings.map((f) => `  ✗ [${f.checkId}] ${f.id}: ${f.message}`);
  return { exitCode, stdout: `${[head, ...lines].join("\n")}\n` };
}
