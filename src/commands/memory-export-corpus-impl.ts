/**
 * `ui memory export-corpus [--since <eventId>]` — emit the embeddable corpus.
 *
 * The deterministic half of the recall loop: the binary shapes ledger events into
 * tiered natural-language payloads and stops there. Embedding, indexing, and KNN
 * live in the optional `recall/` workspace, which consumes this output over Bash.
 * Zero-network, no LLM — the same ledger always produces the same bytes.
 *
 * Text mode emits NDJSON (one payload per line) so it pipes straight into the
 * indexer; `--json` wraps the same items in the standard envelope.
 */
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { memoryPaths, readEvents } from "../core/memory-store.js";
import { exportCorpus } from "../core/memory-corpus.js";
import { MemoryEventError } from "../core/memory-events.js";

export function runExportCorpus(parsed: ParsedArgs): CommandResult {
  const CMD = "memory export-corpus";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const sinceFlag = parsed.flags["since"];
  if (sinceFlag !== undefined && typeof sinceFlag !== "string") {
    return err("BAD_ARG", "--since expects an event id like 'e12'");
  }

  const dirFlag = parsed.flags["dir"];
  const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);

  // Cold start is not a failure: an absent ledger yields an empty corpus, exit 0.
  let events;
  try {
    events = readEvents(paths);
  } catch (e) {
    const code = e instanceof MemoryEventError ? e.code : "BAD_LEDGER";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  let items;
  try {
    items = exportCorpus(events, typeof sinceFlag === "string" ? sinceFlag : undefined);
  } catch (e) {
    return err("BAD_ARG", e instanceof Error ? e.message : String(e));
  }

  if (useJson) return okJson(CMD, { count: items.length, items });
  return ok(items.map((i) => JSON.stringify(i)).join("\n") + (items.length > 0 ? "\n" : ""));
}
