/**
 * `ui ksync` — keep built code and the Figma frames it was built from in step.
 * pin records the pairing, census counts coverage, drift says what changed since.
 * The kernel reads files the host captured; it never calls Figma (Art. I). No model call.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText } from "../core/output.js";
import { runCensus } from "./ksync-census.js";
import { runDrift } from "./ksync-drift.js";
import { runPin } from "./ksync-pin.js";

const CMD = "ksync";

export const KSYNC_HELP = `ui ksync — Figma ↔ code sync from captured files (no network, no model call)

Usage:
  ui ksync pin <route> --file <figmaFileKey> --node <nodeId> [--pins <pins.json>]
               [--spec-hash <hash>] [--commit <sha>] [--at <iso>] [--json]
  ui ksync census <routes.json|route-manifest.json> --pins <pins.json> [--labels <file>]
               [--assume-unlisted <status>] [--registry <registry.json>] [--json]
  ui ksync drift --pins <pins.json> --frames <frames.json> [--max-age-days <n>]
               [--warn-only] [--now <iso>] [--json]

Subcommands:
  pin      Record that <route> was built against frame <nodeId> of <figmaFileKey>. Idempotent
           upsert keyed by (file, node): one entry per frame, sorted, so re-running never
           duplicates. Stamps pinnedAt (now, or --at) and builtFrom (git HEAD, or --commit).
           --spec-hash stores the frame's content hash so drift can compare hashes.
           Default pins file: design/ksync/pins.json. Re-pinning IS the way to accept a drift.
  census   Count manifest entries by label (built / placeholder / orphan / parked), the share
           of built entries whose frame is pinned, a per-app table, and (with --registry) how
           many registry components carry figmaNode. Labels are read, never guessed: from the
           entry's parked marker or status, else from --labels (rows of {routeId, kind,
           variant, status}; a census file's unbuiltInManifest.entries works). Entries with no
           label print as unlabeled. --assume-unlisted <status> counts them as that status and
           says so in the output.
  drift    Compare each pin with the frame snapshot the host captured (--frames). DRIFT = the
           frame changed after the pin (spec hash differs, else lastModified is after pinnedAt);
           MISSING = the frame is not in the snapshot; UNCHECKABLE = the snapshot cannot say.
           STALE-INGEST = the snapshot is older than --max-age-days (default 14) or undated: the
           whole verdict is red even when nothing else changed. An empty pins file is EMPTY, not
           CLEAN. Exit 1 on any verdict but CLEAN unless --warn-only.

Frames file: { ingestedAt, fileKey?, frames: [{ nodeId, lastModified?, specHash? }] }, or the
per-app ledger shape ({ fileKey, apps: { <app>: { refreshedFromDumpAt, entries: [{ figmaId, specHash }] } } }).

Options:
  --pins <f>            Pins file (schemas/ksync-pins.schema.json)
  --frames <f>          Captured frame snapshot
  --file <key>          Figma file key of the frame
  --node <id>           Figma node id of the frame
  --spec-hash <hash>    Frame content hash at pin time
  --commit <sha>        Override builtFrom (default: git rev-parse HEAD)
  --at <iso>            Override pinnedAt (default: now)
  --labels <f>          Status labels for manifest entries that carry none
  --assume-unlisted <s> Count unlabeled entries as built|placeholder|orphan|parked
  --registry <f>        Component registry ({version, components}) for the figmaNode count
  --max-age-days <n>    Oldest acceptable snapshot (default 14)
  --warn-only           Report drift but exit 0
  --now <iso>           Reference instant for the snapshot age (default: now; for reproducible runs)
  --json                Emit a JSON envelope instead of human-readable text
  -h, --help            Show this help

Error codes:
  BAD_ARG          missing <route>/<manifest>, missing or valueless required flag, bad --at/--now/--max-age-days/--assume-unlisted, or no git HEAD
  UNKNOWN_FLAG     a flag outside this command's signature was passed
  FILE_NOT_FOUND   a named input file cannot be read
  BAD_JSON         an input file is not valid JSON
  BAD_PINS         the pins file breaks schemas/ksync-pins.schema.json
  BAD_FRAMES       the frames file has neither a 'frames' array nor a per-app ledger
  BAD_MANIFEST     the manifest has no 'entries' array
  BAD_LABELS       the labels file has no rows
  BAD_REGISTRY     the registry has no 'components' array
  WRITE_ERROR      the pins file cannot be written
`;

export const ksyncCommand = {
  name: CMD,
  summary: "Figma ↔ code sync: pin built routes to frames, census coverage, detect drift",
  hasSubcommands: true,
  help: KSYNC_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "pin": return runPin(parsed);
      case "census": return runCensus(parsed);
      case "drift": return runDrift(parsed);
      default: {
        const msg = sub === undefined ? "ui ksync requires a subcommand. Run 'ui ksync --help'." : `unknown subcommand '${sub}'. Run 'ui ksync --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
