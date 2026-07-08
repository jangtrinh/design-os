/**
 * `ui memory record | compile | fingerprint` — the writer + rebuild + hash paths.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  validateEvent,
  buildEvent,
  nextEventId,
  isMedium,
  MemoryEventError,
} from "../core/memory-events.js";
import type { EventType, Medium } from "../core/memory-events.js";
import {
  memoryPaths,
  ledgerLineCount,
  appendEvent,
  compileAndWrite,
  upsertRegistry,
} from "../core/memory-store.js";

/** Resolve an ISO timestamp from a flag, or fall back to the system clock. */
function isoFrom(flag: string | boolean | undefined, fallback: () => string): { iso: string } | { err: string } {
  if (flag === undefined) return { iso: fallback() };
  if (typeof flag !== "string" || Number.isNaN(Date.parse(flag))) {
    return { err: `expected an ISO-8601 timestamp, got '${String(flag)}'` };
  }
  return { iso: flag };
}

// ─── record ───────────────────────────────────────────────────────────────────

export function runRecord(parsed: ParsedArgs): CommandResult {
  const CMD = "memory record";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const type = parsed.positionals[0];
  if (type === undefined) return err("BAD_ARG", "ui memory record requires a <type> positional");

  const rawData = parsed.flags["data"];
  if (typeof rawData !== "string") return err("BAD_ARG", "--data '<json>' is required");
  let data: Record<string, unknown>;
  try {
    const parsedData = JSON.parse(rawData) as unknown;
    if (parsedData === null || typeof parsedData !== "object" || Array.isArray(parsedData)) {
      return err("BAD_ARG", "--data must be a JSON object");
    }
    data = parsedData as Record<string, unknown>;
  } catch {
    return err("BAD_ARG", "--data is not valid JSON");
  }

  const mediumFlag = parsed.flags["medium"];
  let medium: Medium | undefined;
  if (typeof mediumFlag === "string") {
    if (!isMedium(mediumFlag)) return err("BAD_ARG", `--medium must be html or figma, got '${mediumFlag}'`);
    medium = mediumFlag;
  }

  const refsFlag = parsed.flags["refs"];
  const refs = typeof refsFlag === "string"
    ? refsFlag.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    : undefined;

  try {
    validateEvent(type, data, refs);
  } catch (e) {
    if (e instanceof MemoryEventError) return err(e.code, e.message);
    throw e;
  }

  const at = isoFrom(parsed.flags["at"], () => new Date().toISOString());
  if ("err" in at) return err("BAD_ARG", `--at ${at.err}`);

  const dirFlag = parsed.flags["dir"];
  const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);
  const id = nextEventId(ledgerLineCount(paths));

  const artifactRef = parsed.flags["artifact-ref"];
  const fingerprint = parsed.flags["fingerprint"];
  const event = buildEvent({
    id,
    t: at.iso,
    type: type as EventType,
    data,
    actor: typeof parsed.flags["actor"] === "string" ? parsed.flags["actor"] : undefined,
    medium,
    designId: typeof parsed.flags["design"] === "string" ? parsed.flags["design"] : undefined,
    artifact: {
      ref: typeof artifactRef === "string" ? artifactRef : undefined,
      fingerprint: typeof fingerprint === "string" ? fingerprint : undefined,
    },
    refs,
  });

  try {
    appendEvent(paths, event);
    compileAndWrite(paths, new Date().toISOString()); // fold in a rebuild; deterministic view via `compile --now`
    if (parsed.flags["no-registry"] !== true) upsertRegistry(paths.projectDir, at.iso);
  } catch (e) {
    return err("WRITE_ERROR", `cannot write memory: ${e instanceof Error ? e.message : String(e)}`);
  }

  const count = ledgerLineCount(paths);
  return okJson(CMD, { id, type, eventCount: count, ledger: paths.ledger });
}

// ─── compile ────────────────────────────────────────────────────────────────────

export function runCompile(parsed: ParsedArgs): CommandResult {
  const CMD = "memory compile";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const dirFlag = parsed.flags["dir"];
  const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);
  if (!existsSync(paths.ledger)) return err("NO_MEMORY", `no memory ledger at '${paths.ledger}'`);

  const now = isoFrom(parsed.flags["now"], () => new Date().toISOString());
  if ("err" in now) return err("BAD_ARG", `--now ${now.err}`);

  try {
    const graph = compileAndWrite(paths, now.iso);
    return okJson(CMD, { eventCount: graph.eventCount, graph: paths.graph });
  } catch (e) {
    if (e instanceof MemoryEventError) return err(e.code, e.message); // BAD_LEDGER (line number)
    return err("WRITE_ERROR", `cannot compile memory: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── fingerprint ─────────────────────────────────────────────────────────────────

export function runFingerprint(parsed: ParsedArgs): CommandResult {
  const CMD = "memory fingerprint";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui memory fingerprint requires a <file> positional");
  if (!existsSync(file)) return err("FILE_NOT_FOUND", `file not found: '${file}'`);
  try {
    const hash = "sha256:" + createHash("sha256").update(readFileSync(file)).digest("hex");
    return useJson ? okJson(CMD, { file, fingerprint: hash }) : ok(hash + "\n");
  } catch (e) {
    return err("READ_ERROR", `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`);
  }
}
