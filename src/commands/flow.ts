/**
 * `ui flow` — multi-screen flow tooling. Today: `lint` (deterministic IA checks).
 * Room to grow (render html/mermaid) without changing the dispatch shape.
 */
import { readFileSync } from "node:fs";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { parseFlow, FlowError } from "../core/flow-model.js";
import { lintFlow } from "../core/flow-lint.js";

const CMD = "flow";

export const FLOW_HELP = `ui flow — multi-screen flow tooling

Usage:
  ui flow lint <flow.json> [--json]

Subcommands:
  lint    Deterministically lint an IA graph (screens + states + transitions)

flow.json shape:
  { name?, screens:[{ id, name?, mode?, artifact?, states?:[…], terminal? }],
    transitions:[{ id, from, to, trigger, label?, source?, guard?, async? }],
    entryPoints:[{ id, screen, name? }] }
  from/to are "screenId" or "screenId.stateId". guards are DECLARED for linting, never run.

lint checks (error / warning):
  dangling-ref · unreachable-screen · dead-end · missing-error-state · invalid-trigger ·
  noop-self-loop · no-entry   (errors) — orphan-screen · unreachable-state ·
  missing-back-path · missing-empty-state · missing-skeleton · guard-without-complement (warnings)

Options:
  --json      Emit a JSON envelope { errorCount, warningCount, findings }
  -h, --help  Show this help

Exit codes:
  0  No error-severity findings (warnings allowed)
  1  One or more error-severity findings, or a user/file error

Error codes:
  BAD_ARG        Missing subcommand or <flow.json>
  UNKNOWN_FLAG   Unrecognised --flag
  FILE_NOT_FOUND The flow file does not exist
  READ_ERROR     The flow file cannot be read
  BAD_FLOW       The flow file is not valid JSON or the wrong shape
`;

function runLint(parsed: ParsedArgs): CommandResult {
  const sub = "flow lint";
  const useJson = parsed.json;
  const file = parsed.positionals[0];
  if (file === undefined) {
    const msg = "ui flow lint requires <flow.json>";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = isNotFound ? `file not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
  }
  let flow;
  try {
    flow = parseFlow(JSON.parse(raw), file);
  } catch (e) {
    const code = e instanceof FlowError ? e.code : "BAD_FLOW";
    return useJson ? errJson(sub, code, e instanceof Error ? e.message : String(e)) : errText(`ui: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  const r = lintFlow(flow);
  const exitCode = r.errorCount > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(sub, { file, ...r }, exitCode);
  const lines = r.findings.length === 0
    ? [`flow lint: ${file} — 0 findings; the IA is well-formed.`]
    : [`flow lint: ${file} — ${r.errorCount} error(s), ${r.warningCount} warning(s)`,
       ...r.findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}] ${f.message}`)];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

export const flowCommand = {
  name: CMD,
  summary: "Lint a multi-screen flow (IA graph) deterministically",
  hasSubcommands: true,
  help: FLOW_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "lint": return runLint(parsed);
      case undefined: {
        const msg = "ui flow requires a subcommand. Run 'ui flow --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui flow --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
