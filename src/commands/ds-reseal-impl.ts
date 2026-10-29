/**
 * runReseal — implementation for `ui ds reseal [--apply --reason "<text>"]`.
 *
 * The sanctioned heal for hash drift: a store file (tokens or registry) no longer hashes to
 * what the manifest sealed, so every load fails DS_TAMPERED and no other writer can run.
 * Preview (default) lists each drifted file's manifest hash and current hash and writes
 * nothing. `--apply --reason` adopts the on-disk hashes through the shared `reseal` ceremony
 * (generation bump + ONE changelog entry carrying the reason). Hash drift ONLY: the store is
 * loaded with the tamper check relaxed and nothing else, so it must still pass the checks
 * every load runs (JSON parse, token shape and $type, alias resolution - dangling and cycle,
 * the registry's root shape) plus: every registry component is an object with a non-empty
 * string name. Token value formats and other per-component fields are NOT checked. A failure
 * is refused in preview and in apply. A registry file switch and a kit-bound store are
 * refused too (ds-reseal-guards.ts). No store file is ever rewritten - only the manifest.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir } from "../core/design-system.js";
import type { DesignSystem, DesignSystemPaths } from "../core/design-system.js";
import { reseal } from "../core/ds-reseal.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import {
  KIT_BOUND_MESSAGE, describeSwitch, findRegistrySwitch, firstMalformedComponent, manifestIsKitBound,
} from "./ds-reseal-guards.js";
import type { RegistrySwitch } from "./ds-reseal-guards.js";
import { appliedText, describeDrift, hashList, previewText } from "./ds-reseal-render.js";

const CMD = "ds reseal";
const KNOWN_FLAGS = ["dir", "apply", "reason"] as const;
/** The manifest schema caps a changelog reason at 256 characters. */
const MAX_REASON = 256;
/** Failures that are about the store as a whole, not about a file that failed validation. */
const NOT_A_FILE_REFUSAL = new Set(["DS_NOT_FOUND", "BAD_MANIFEST", "READ_ERROR", "WRITE_ERROR", "UNKNOWN_FLAG", "BAD_ARG"]);

function errorCodeOf(e: unknown): string {
  const code = e instanceof Error ? (e as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : "BAD_DS";
}
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

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
    return fail(errorCodeOf(e), messageOf(e));
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
    if (!NOT_A_FILE_REFUSAL.has(code) && manifestIsKitBound(paths)) {
      return fail("RESEAL_KIT_BOUND", `${KIT_BOUND_MESSAGE} (${messageOf(e)})`);
    }
    return fail(code, NOT_A_FILE_REFUSAL.has(code)
      ? messageOf(e)
      : `reseal refused — ${messageOf(e)}. Reseal only recomputes hashes of files that still validate; fix the file first.`);
  }

  const generation = ds.manifest.generation;
  const mode = apply ? "apply" : "preview";
  if ((ds.unsealedDrift ?? []).length === 0) {
    return useJson
      ? okJson(CMD, { mode, applied: false, nothingToReseal: true, generation, drift: [] })
      : ok(`ui ds reseal: nothing to reseal — every store file matches its sealed hash (gen ${generation}).\n`);
  }
  if (ds.manifest.kit) return fail("RESEAL_KIT_BOUND", KIT_BOUND_MESSAGE);

  const drifted = ds.unsealedDrift ?? [];
  let registrySwitch: RegistrySwitch | undefined;
  if (drifted.some((d) => d.file === "registry")) {
    const bad = firstMalformedComponent(ds.registry);
    if (bad >= 0) {
      return fail("BAD_REGISTRY", `reseal refused — registry component #${bad} is not an object with a non-empty string 'name'. Fix the file first.`);
    }
    registrySwitch = findRegistrySwitch(paths, ds.manifest);
  }
  // A switched registry is reported as a switch, never as drift of a file it is not.
  const drift = drifted.filter((d) => registrySwitch === undefined || d.file !== "registry").map((d) => describeDrift(ds, d));

  if (registrySwitch !== undefined && apply) return fail("RESEAL_REGISTRY_SWITCHED", `reseal refused — ${describeSwitch(registrySwitch)}.`);
  if (!apply) {
    return useJson
      ? okJson(CMD, { mode, applied: false, nothingToReseal: false, generation, drift, ...(registrySwitch && { registrySwitch }) })
      : ok(previewText(paths, ds, drift, registrySwitch));
  }

  const adopted = (file: "tokens" | "registry"): string | undefined => drift.find((d) => d.file === file)?.currentHash;
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
  } catch (e) {
    const code = errorCodeOf(e);
    return fail(code === "BAD_DS" ? "WRITE_ERROR" : code, messageOf(e));
  }
  // The point of the command: the store must now load under the full tamper check. The manifest
  // is already committed here, so a failure must say so.
  try {
    loadDesignSystem(paths);
  } catch (e) {
    return fail(errorCodeOf(e),
      `the manifest was already written (generation ${result.generation}, reseal changelog entry appended) but the store ` +
      `no longer loads clean: ${messageOf(e)}. A store file changed during the run: restore it, then run ui ds reseal again.`);
  }

  return useJson
    ? okJson(CMD, { mode, applied: true, nothingToReseal: false, generation: result.generation, previousGeneration: generation, reason, drift })
    : ok(appliedText(drift, generation, result.generation, reason));
}
