/**
 * `ui memory` dispatcher — routes the design-memory subcommands (mirror ds.ts).
 * The central flag guard (cli.ts + command-signatures.ts) rejects unknown flags
 * before dispatch, so the impls validate values only.
 */
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { runRecord, runCompile, runFingerprint } from "./memory-record-impl.js";
import { runContext } from "./memory-context-impl.js";
import { runQuery, runStatus } from "./memory-query-impl.js";
import { runConsolidate } from "./memory-consolidate-impl.js";
import { runExportCorpus } from "./memory-export-corpus-impl.js";

const CMD = "memory";

export const MEMORY_HELP = `ui memory — per-project design-decision ledger + compiled graph + cross-project taste profile

Usage:
  ui memory record <type> --data '<json>' [options]
  ui memory compile [--now <iso>] [--dir <path>]
  ui memory context [--for generate|critique|why] [--rank-file <path>] [--max-bytes <n>] [--now <iso>] [--dir <path>]
  ui memory query [--type <t>] [--design <id>] [--persona <slug>] [--limit <n>] [--dir <path>]
  ui memory fingerprint <file>
  ui memory consolidate [--insight "<text>" --refs '<json>'] [--actor <name>] [--now <iso>]
  ui memory status [--dir <path>]
  ui memory export-corpus [--since <eventId>] [--dir <path>]

Subcommands:
  record         Append one validated event to the ledger (folds in a graph recompile)
  compile        Rebuild memory.graph.json from the ledger (deterministic with --now)
  context        Emit a compact memory prior for the host model
  query          List raw events, newest first
  fingerprint    Print sha256:<hex> of a file's bytes
  consolidate    Rebuild the cross-project taste profile (user scope)
  status         Ledger count, graph freshness, registry size, profile presence
  export-corpus  Emit tiered natural-language payloads for the recall workspace to embed

record flags:
  --data '<json>'     Event payload (required; a JSON object)
  --at <iso>          Event timestamp (ISO-8601; default: system clock)
  --actor <name>      Who caused the event
  --medium <m>        Output medium: html | figma
  --design <id>       Design id this event is about
  --artifact-ref <r>  Artifact reference (file path or node id)
  --fingerprint <f>   Artifact fingerprint (sha256:…)
  --refs <ids>        Comma-separated event ids this event draws from (required for 'insight')
  --dir <path>        Project directory (default: cwd)
  --no-registry       Do not upsert this project into the user registry

Event types (v1): variant_generated, rendition_created, taste_verdict, user_pick,
  vibe_edit, manual_edit, token_change, component_registered, harvested, duel_result,
  insight (an 'insight' event requires --refs for provenance),
  gap (a knowledge-core gap for the librarian to graduate; refs optional).
  Example: ui memory record gap --data '{"text":"…","target":"taste-rubric.md#motion"}'

Other flags:
  --now <iso>         compile/context/consolidate: decay + compiledAt clock (deterministic when fixed)
  --for <mode>        context only: generate | critique | why (default generate)
  --rank-file <path>  context only: JSON array of ranked event ids (from 'recall query') whose
                      corpus items are spliced into the prior; never spliced for --for critique
                      (the taste gate stays craft-only)
  --max-bytes <n>     context only: truncate the block, sections whole (default 2048)
  --since <eventId>   export-corpus only: emit only items recorded after this event id
  --type <t>          query only: filter by event type
  --persona <slug>    query only: filter by persona
  --limit <n>         query only: max events (default 20)
  --insight "<text>"  consolidate only: append one insight (needs --refs)
  --refs '<json>'     consolidate only: [{"project":"…","events":["e1"]}] provenance

Storage:
  design/memory.events.jsonl   append-only ledger (truth; never hand-edited)
  design/memory.graph.json     compiled view (rebuildable)
  ~/.ease-design/projects.json + taste.profile.json   user scope (override: EASE_DESIGN_HOME)

Error codes:
  BAD_ARG          Missing or invalid flag / positional
  UNKNOWN_FLAG     Unrecognised --flag (rejected, with a did-you-mean hint)
  BAD_EVENT_TYPE   Event type is not in the v1 closed set
  BAD_EVENT        Event fails schema (missing required data key, or 'insight' without --refs)
  NO_MEMORY        No ledger to compile
  BAD_LEDGER       A ledger line is unparseable (message names the line number)
  FILE_NOT_FOUND   fingerprint target does not exist
  READ_ERROR       fingerprint target cannot be read
  WRITE_ERROR      Could not write the ledger, graph, or profile
`;

export const memoryCommand = {
  name: CMD,
  summary: "Record, compile, and query the project's design memory + taste profile",
  hasSubcommands: true,
  help: MEMORY_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "record":      return runRecord(parsed);
      case "compile":     return runCompile(parsed);
      case "context":     return runContext(parsed);
      case "query":       return runQuery(parsed);
      case "fingerprint": return runFingerprint(parsed);
      case "consolidate": return runConsolidate(parsed);
      case "status":      return runStatus(parsed);
      case "export-corpus": return runExportCorpus(parsed);
      case undefined: {
        const msg = "ui memory requires a subcommand. Run 'ui memory --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui memory --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
