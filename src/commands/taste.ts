/**
 * `ui taste` dispatcher — routes taste subcommands to their implementations.
 * `serve` (phase 02) is not registered yet; command-signatures.ts declares
 * only the 4 verbs shipped in this phase.
 */
import { errJson, errText } from "../core/output.js";
import { runTasteIngest } from "./taste-ingest-impl.js";
import { runTasteNext } from "./taste-next-impl.js";
import { runTasteRecord } from "./taste-record-impl.js";
import { runTasteStatus } from "./taste-status-impl.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "taste";

export const TASTE_HELP = `ui taste — vote-driven taste corpus: ingest, pairwise Elo ranking, study verdicts

Usage:
  ui taste ingest [--root <p>] [--dir <p>] [--genre <g>] [--source-url <u>] [--json]
  ui taste next --mode pair|study [--root <p>] [--genre <g>] [--json]
  ui taste record --mode pair|study [options] [--root <p>] [--json]
  ui taste status [--root <p>] [--genre <g>] [--json]

Subcommands:
  ingest   Scan taste/inbox/<genre>/*.{png,jpg,jpeg} (+ optional --dir sources), dedup, move/copy into corpus/
  next     Propose the next thing to vote on: a pair (--mode pair) or a study item (--mode study). Read-only.
  record   Append one validated vote (--mode pair) or study verdict (--mode study)
  status   Ledger counts, top-Elo per genre, self-consistency from repeat votes

'ingest' options:
  --root <p>        Store root (default: DESIGN_OS_TASTE_ROOT env, else <cwd>/taste)
  --dir <p>         Extra source directory outside inbox/ (comma-separated for more than one)
  --genre <g>       Genre tag for files pulled in via --dir (required whenever --dir is given)
  --source-url <u>  Provenance URL recorded on every item ingested this run

'next' options:
  --mode <m>   pair | study (required)
  --genre <g>  pair: restrict to one genre (default: auto-pick the least-voted genre). study: filters candidates.

'record' options (--mode pair):
  --a <id>          First item id (required)
  --b <id>          Second item id (required, must differ from --a)
  --winner <w>      a | b | tie | skip (required)
  --reasons <csv>   Comma-separated reason tags
  --note <s>        Free-text note
  --swapped         Echo the display order 'taste next' returned
  --repeat-of <ts>  ts of the original vote this repeats
  --ms <n>          Time-to-decide, milliseconds

'record' options (--mode study):
  --item <id>          Item id (required)
  --verdict <v>         LEARN | PARTIAL | SKIP (required)
  --blind-verdict <v>  Verdict recorded BEFORE seeing the item's known lesson (LEARN|PARTIAL|SKIP)
  --note <s>           Free-text note
  --lesson-ref <path>  Path to the knowledge/ entry this verdict folds into

'status' options:
  --genre <g>  Restrict counts/top-Elo/consistency to one genre

Store layout (under root, default <cwd>/taste):
  items.jsonl, votes.jsonl, study.jsonl   append-only ledgers (source of truth; Elo is replayed, never stored)
  inbox/<genre>/*.png|jpg                 drop zone for 'ui taste ingest'
  corpus/<genre>/<id>.<ext>               ingested originals (id = 12-hex sha256 prefix)

Common options:
  --json        Emit a JSON envelope instead of human-readable text
  -h, --help    Show this help

Error codes:
  E_TASTE_ROOT          Store root has no items.jsonl yet (run 'ui taste ingest' first)
  E_TASTE_BAD_FLAGS     Missing/invalid flag or combination (e.g. --dir without --genre, missing --mode)
  E_TASTE_NO_ITEMS      'next' found nothing left to propose
  E_TASTE_UNKNOWN_ITEM  'record' referenced an id not present in items.jsonl
  E_TASTE_BAD_VOTE      'record' winner/verdict outside its enum, or --a === --b
  E_TASTE_LEDGER        A ledger line failed validation (message names the file + line number)
  UNKNOWN_FLAG          Unrecognised --flag (rejected, with a did-you-mean hint)
  BAD_ARG               Missing/unknown subcommand
`;

export const tasteCommand = {
  name: CMD,
  summary: "Vote-driven taste corpus: ingest, pairwise Elo ranking, study verdicts",
  hasSubcommands: true,
  help: TASTE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "ingest": return runTasteIngest(parsed);
      case "next":   return runTasteNext(parsed);
      case "record": return runTasteRecord(parsed);
      case "status": return runTasteStatus(parsed);
      case undefined: {
        const msg = "ui taste requires a subcommand. Run 'ui taste --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui taste --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
