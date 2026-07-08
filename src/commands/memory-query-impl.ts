/**
 * `ui memory query | status` — raw-event lookup + a health summary. Read-only.
 */
import { existsSync, statSync } from "node:fs";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { memoryPaths, readEvents, loadRegistry, loadProfile } from "../core/memory-store.js";
import { MemoryEventError } from "../core/memory-events.js";
import type { MemoryEvent } from "../core/memory-events.js";

// ─── query ────────────────────────────────────────────────────────────────────

export function runQuery(parsed: ParsedArgs): CommandResult {
  const CMD = "memory query";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const dirFlag = parsed.flags["dir"];
  const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);

  let events: MemoryEvent[];
  try {
    events = readEvents(paths);
  } catch (e) {
    if (e instanceof MemoryEventError) return err(e.code, e.message); // BAD_LEDGER
    throw e;
  }

  const typeF = parsed.flags["type"];
  const designF = parsed.flags["design"];
  const personaF = parsed.flags["persona"];
  let matched = events.filter((e) => {
    if (typeof typeF === "string" && e.type !== typeF) return false;
    if (typeof designF === "string" && e.designId !== designF) return false;
    if (typeof personaF === "string" && e.data["persona"] !== personaF) return false;
    return true;
  });

  // Newest first.
  matched = matched.reverse();

  const limitRaw = parsed.flags["limit"];
  let limit = 20;
  if (limitRaw !== undefined) {
    const n = parseInt(String(limitRaw), 10);
    if (Number.isNaN(n) || n <= 0) return err("BAD_ARG", `--limit must be a positive integer, got '${String(limitRaw)}'`);
    limit = n;
  }
  const results = matched.slice(0, limit);

  if (useJson) return okJson(CMD, { count: results.length, events: results });
  if (results.length === 0) return ok("memory: no matching events\n");
  const lines = results.map((e) =>
    `${e.id}  ${e.t}  ${e.type}${e.designId !== undefined ? `  design=${e.designId}` : ""}${e.actor !== undefined ? `  by=${e.actor}` : ""}`,
  );
  return ok(lines.join("\n") + "\n");
}

// ─── status ─────────────────────────────────────────────────────────────────────

export function runStatus(parsed: ParsedArgs): CommandResult {
  const CMD = "memory status";
  const dirFlag = parsed.flags["dir"];
  const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);

  const hasLedger = existsSync(paths.ledger);
  let eventCount = 0;
  let graphState: "fresh" | "stale" | "none" = "none";
  if (hasLedger) {
    try {
      eventCount = readEvents(paths).length;
    } catch {
      eventCount = -1; // unparseable ledger; status never fails
    }
    if (existsSync(paths.graph)) {
      graphState = statSync(paths.graph).mtimeMs >= statSync(paths.ledger).mtimeMs ? "fresh" : "stale";
    }
  }
  const registrySize = loadRegistry().length;
  const hasProfile = loadProfile() !== null;

  if (parsed.json) {
    return okJson(CMD, { eventCount, graph: graphState, registrySize, profile: hasProfile });
  }
  return ok(
    `memory: ${eventCount < 0 ? "unparseable ledger" : `${eventCount} event(s)`} (graph ${graphState})\n` +
    `registry: ${registrySize} project(s)\n` +
    `profile: ${hasProfile ? "present" : "none"}\n`,
  );
}
