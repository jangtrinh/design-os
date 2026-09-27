/**
 * `ui trace summarize <dir>` — reads the append-only read trace a host hook left in
 * `<dir>/.design-os/trace/reads.jsonl` and reports how much context the agent loaded
 * before its first mutation, plus whether es-designer was loaded and its checklist run.
 * Pure kernel: src/core/trace-summarize.ts. This command owns the one file read.
 * Deterministic, no network, no model call.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { summarizeTrace } from "../core/trace-summarize.js";
import type { TraceSummary } from "../core/trace-summarize.js";

const CMD = "trace";
const SUB = "trace summarize";
const TRACE_REL = join(".design-os", "trace", "reads.jsonl");

export const TRACE_HELP = `ui trace — summarize the agent read trace

Usage:
  ui trace summarize <dir> [--session <id>] [--json]

Reads <dir>/.design-os/trace/reads.jsonl, appended by templates/hooks/design-os-read-trace.cjs
(a Claude PreToolUse/PostToolUse hook), and reports:
  bytesBeforeFirstMutate / filesBeforeFirstMutate   context loaded before the first edit
  readmeOpened / indexOpened                        orientation files opened (README.md, knowledge/index.json)
  esDesignerLoaded                                  the es-designer skill was invoked
  esDesignerChecklistRan                            its checklist.md was read AND a gate ran after that
  gateRuns                                          ui gate / slop-detect invocations
  traceCoverage                                     "claude-only" when a trace exists, "none" otherwise
  malformedLines                                    trace lines that were not a JSON object

Options:
  --session <id>  Keep only records of that session id (default: every record in the file)
  --json          Emit a JSON envelope
  -h, --help      Show this help

Error codes:
  BAD_ARG       Missing/unknown subcommand, missing <dir>, or --session without a value
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
  NOT_A_DIR     <dir> does not exist
  READ_ERROR    The trace file exists but could not be read
`;

function renderText(dir: string, s: TraceSummary): string {
  const yes = (b: boolean): string => (b ? "yes" : "no");
  return [
    `trace summarize: ${dir} (coverage: ${s.traceCoverage})`,
    `  before first mutate: ${s.bytesBeforeFirstMutate} bytes over ${s.filesBeforeFirstMutate.length} file(s)`,
    `  README opened: ${yes(s.readmeOpened)} · knowledge index opened: ${yes(s.indexOpened)}`,
    `  es-designer loaded: ${yes(s.esDesignerLoaded)} · checklist ran: ${yes(s.esDesignerChecklistRan)}`,
    `  gate runs: ${s.gateRuns}` + (s.malformedLines > 0 ? ` · malformed lines: ${s.malformedLines}` : ""),
    "",
  ].join("\n");
}

function runSummarize(parsed: ParsedArgs): CommandResult {
  const fail = (code: string, message: string): CommandResult =>
    parsed.json ? errJson(SUB, code, message) : errText(`ui: ${message}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["session"]);
  if (unknown !== null) return fail("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const dirArg = parsed.positionals[0];
  if (dirArg === undefined) return fail("BAD_ARG", "ui trace summarize requires <dir>");
  const sessionFlag = parsed.flags["session"];
  if (sessionFlag === true) return fail("BAD_ARG", "--session requires an id");

  const dir = resolve(dirArg);
  if (!existsSync(dir)) return fail("NOT_A_DIR", `no such directory '${dir}'`);

  const tracePath = join(dir, TRACE_REL);
  let lines: string[] = [];
  if (existsSync(tracePath)) {
    try {
      lines = readFileSync(tracePath, "utf8").split("\n");
    } catch (e) {
      return fail("READ_ERROR", `cannot read ${tracePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const summary = summarizeTrace(lines, typeof sessionFlag === "string" ? { session: sessionFlag } : {});
  return parsed.json ? okJson(SUB, summary) : { exitCode: 0, stdout: renderText(dir, summary) };
}

export const traceCommand = {
  name: CMD,
  summary: "Summarize the agent read trace (context loaded before the first edit, es-designer checklist evidence)",
  hasSubcommands: true,
  help: TRACE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "summarize": return runSummarize(parsed);
      case undefined: {
        const msg = "ui trace requires a subcommand (summarize). Run 'ui trace --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui trace --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
