/**
 * runReseal — implementation for `ui ds reseal [--apply --reason "<text>"]`.
 *
 * The sanctioned heal for hash drift: a store file (tokens or registry) no longer hashes to
 * what the manifest sealed, so every load fails DS_TAMPERED and no other writer can run.
 * Preview (default) lists each drifted file's manifest hash and current hash and writes
 * nothing. `--apply --reason` adopts the on-disk hashes through the shared `reseal` ceremony
 * (generation bump + ONE changelog entry carrying the reason). Hash drift ONLY: the store is
 * loaded with the tamper check relaxed and nothing else, so a file that fails structural
 * validation (bad JSON, schema, dangling alias, cycle) is refused, in preview and in apply.
 * No store file is ever rewritten — only the manifest changes.
 */
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import {
  discoverDesignSystem, loadDesignSystem, pathsForDir, countTokens,
} from "../core/design-system.js";
import type { DesignSystem, DesignSystemPaths, HashDrift } from "../core/design-system.js";
import { reseal } from "../core/ds-reseal.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds reseal";
const KNOWN_FLAGS = ["dir", "apply", "reason"] as const;
/** The manifest schema caps a changelog reason at 256 characters. */
const MAX_REASON = 256;
/** Failures that are about the store as a whole, not about a file that failed validation. */
const NOT_A_FILE_REFUSAL = new Set(["DS_NOT_FOUND", "BAD_MANIFEST", "READ_ERROR", "WRITE_ERROR", "UNKNOWN_FLAG", "BAD_ARG"]);

interface DriftReport {
  file: "tokens" | "registry";
  path: string;
  manifestHash: string;
  currentHash: string;
  unit: "tokens" | "components";
  /** The manifest records hashes only, so the count at seal time is not knowable. */
  before: null;
  after: number;
}

function errorCodeOf(e: unknown): string {
  const code = e instanceof Error ? (e as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : "BAD_DS";
}

function describeDrift(ds: DesignSystem, d: HashDrift): DriftReport {
  const tokens = d.file === "tokens";
  return {
    file: d.file,
    path: basename(tokens ? ds.paths.tokens : ds.paths.registry),
    manifestHash: d.expected,
    currentHash: d.actual,
    unit: tokens ? "tokens" : "components",
    before: null,
    after: tokens ? countTokens(ds.tokens) : ds.registry.components.length,
  };
}

/** "tokens=sha256-…; registry=sha256-…" — one entry for every drifted file, in a fixed order. */
const hashList = (drift: DriftReport[], pick: "manifestHash" | "currentHash"): string =>
  drift.map((d) => `${d.file}=${d[pick]}`).join("; ");

function previewText(paths: DesignSystemPaths, ds: DesignSystem, drift: DriftReport[]): string {
  const lines = [`ui ds reseal — preview, nothing written (${paths.dir})`, ""];
  for (const d of drift) {
    lines.push(
      `${d.path}  (${d.file})`,
      `  manifest hash : ${d.manifestHash}`,
      `  current hash  : ${d.currentHash}`,
      `  ${d.unit}: ${d.after} now; the count at seal time is not recorded in the manifest`,
    );
  }
  const clean = (["tokens", "registry"] as const).filter((f) => !drift.some((d) => d.file === f));
  for (const f of clean) lines.push(`${basename(f === "tokens" ? paths.tokens : paths.registry)}  (${f})  hash matches the seal`);
  lines.push("", `Manifest is at generation ${ds.manifest.generation}. Adopt these hashes with:`,
    '  ui ds reseal --apply --reason "<why the drift is legitimate>"');
  return lines.join("\n") + "\n";
}

export function runReseal(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const fail = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return fail("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const applyFlag = parsed.flags["apply"];
  if (typeof applyFlag === "string") return fail("BAD_ARG", `--apply takes no value (got '${applyFlag}')`);
  const apply = applyFlag === true;

  const reasonFlag = parsed.flags["reason"];
  const reason = typeof reasonFlag === "string" ? reasonFlag.trim() : "";
  if (apply && reason.length === 0) {
    return fail("RESEAL_REASON_REQUIRED",
      '--apply needs --reason "<text>": the reason is recorded in the manifest changelog');
  }
  if (reason.length > MAX_REASON) {
    return fail("BAD_ARG", `--reason is ${reason.length} characters; the manifest allows at most ${MAX_REASON}`);
  }

  const dirFlag = parsed.flags["dir"];
  let paths: DesignSystemPaths;
  try {
    paths = typeof dirFlag === "string"
      ? pathsForDir(resolve(dirFlag, "design"))
      : discoverDesignSystem(undefined);
  } catch (e) {
    return fail(errorCodeOf(e), e instanceof Error ? e.message : String(e));
  }

  // The registry resolver treats an unparseable / version-less component-registry.json as a
  // FOREIGN file and looks for the kernel's alternate file instead, so a damaged registry would
  // surface below as an unrelated "not found". Name the real problem.
  if (paths.foreignRegistryAtDefaultPath && !existsSync(paths.registry)) {
    return fail("BAD_REGISTRY",
      "reseal refused — design/component-registry.json is not a valid kernel registry (not JSON, or no 'version' string) " +
      "and no figma-component-registry.json exists. Fix the file first.");
  }

  // Tamper check relaxed for hash drift ONLY; every structural validator still runs.
  let ds: DesignSystem;
  try {
    ds = loadDesignSystem(paths, { allowUnsealed: true });
  } catch (e) {
    const code = errorCodeOf(e);
    const msg = e instanceof Error ? e.message : String(e);
    return fail(code, NOT_A_FILE_REFUSAL.has(code)
      ? msg
      : `reseal refused — ${msg}. Reseal only recomputes hashes of files that still validate; fix the file first.`);
  }

  const drift = (ds.unsealedDrift ?? []).map((d) => describeDrift(ds, d));
  const generation = ds.manifest.generation;
  if (drift.length === 0) {
    return useJson
      ? okJson(CMD, { mode: apply ? "apply" : "preview", applied: false, nothingToReseal: true, generation, drift: [] })
      : ok(`ui ds reseal: nothing to reseal — every store file matches its sealed hash (gen ${generation}).\n`);
  }

  if (!apply) {
    return useJson
      ? okJson(CMD, { mode: "preview", applied: false, nothingToReseal: false, generation, drift })
      : ok(previewText(paths, ds, drift));
  }

  const adopted = (file: DriftReport["file"]): string | undefined => drift.find((d) => d.file === file)?.currentHash;
  const compiledHash = adopted("tokens");
  const registryHash = adopted("registry");
  let result;
  try {
    result = reseal({
      ds, paths,
      adopt: { ...(compiledHash !== undefined && { compiledHash }), ...(registryHash !== undefined && { registryHash }) },
      entry: {
        kind: "reseal",
        by: "ui ds reseal",
        path: drift.map((d) => d.path).join(","),
        from: hashList(drift, "manifestHash"),
        to: hashList(drift, "currentHash"),
        reason,
      },
      nowIso: new Date().toISOString(),
    });
    // The point of the command: the store must now load under the full tamper check.
    loadDesignSystem(paths);
  } catch (e) {
    const code = errorCodeOf(e);
    return fail(code === "BAD_DS" ? "WRITE_ERROR" : code, e instanceof Error ? e.message : String(e));
  }

  return useJson
    ? okJson(CMD, { mode: "apply", applied: true, nothingToReseal: false, generation: result.generation, previousGeneration: generation, reason, drift })
    : ok(
      `ui ds reseal: re-sealed ${drift.map((d) => d.path).join(", ")} (gen ${generation} → gen ${result.generation})\n` +
      drift.map((d) => `  ${d.path}: ${d.manifestHash} → ${d.currentHash}`).join("\n") +
      `\n  reason recorded in the manifest changelog: ${reason}\n`,
    );
}
