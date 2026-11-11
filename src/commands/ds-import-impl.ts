/**
 * runImport — `ui ds import <tokens.json> --dir <project> [--registry <file>]`.
 *
 * Onboard an EXISTING flat design-token file into the ease-design DS store so the rest of
 * `ui ds *` (a11y, status, diff, docs) works on it (dogfood G1: a Figma-reconciled
 * tokens.json is flat `{category:{name:value}}`, not the DTCG store shape). Converts →
 * DTCG, seals a fresh manifest + a registry (empty, or the one `ui ingest-figma-ds` wrote when
 * `--registry` names it). Deterministic transform; only writes files.
 *
 * It asks instead of skipping (spec 033): every member it cannot type, every colour token whose role
 * the name cannot decide, and the project-level questions (scan budget, app roots, source of truth)
 * block the import with ONBOARD_BLOCKED_NEEDS_OWNER_RULING before anything is written.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { refuseKitDowngrade } from "../core/ds-kit-seal.js";
import { pathsForDir } from "../core/design-system.js";
import { createEmptyRegistry } from "../core/registry-store.js";
import type { Registry } from "../core/registry-store.js";
import { parseTokenFile } from "../core/token-model.js";
import { recognizeRoles } from "../core/role-recognition.js";
import { planImport } from "../core/ds-import-plan.js";
import type { ImportPlan } from "../core/ds-import-plan.js";
import { wireFuelLine } from "../core/ds-fuel-line.js";
import { blockOnOpenClusters } from "../core/owner-rulings/block-contract.js";
import { RulingStoreError, readRulingStore } from "../core/owner-rulings/ruling-store.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { ImportRegistryError, assertBindingsInFile, dropBindingsOutsideTree, loadImportRegistry, sealedRegistryCount } from "./ds-import-registry.js";
import { applyRoles, sealImportStore, validateRoles } from "./ds-import-seal.js";
import { extraSummary, hadQuestions, ledgerLines, runHarvest } from "./ds-import-summary.js";
import { SetRoleError } from "./ds-set-role-impl.js";

const CMD = "ds import";
const KNOWN_FLAGS = ["dir", "name", "force", "reset-registry", "registry"] as const;
const NAME_RE = /^[a-z][a-z0-9-]*$/;

export function runImport(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => (useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const src = parsed.positionals[0];
  if (typeof src !== "string" || src.length === 0) {
    return err("BAD_ARG", "missing <tokens.json>. Usage: ui ds import <tokens.json> --dir <project> [--registry <component-registry.json>]");
  }
  const dirFlag = parsed.flags["dir"];
  const projectDir = typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd();
  const designDir = join(projectDir, "design");
  const paths = pathsForDir(designDir);

  try { refuseKitDowngrade(paths.dir); }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return useJson ? errJson(CMD, "KIT_DOWNGRADE", msg) : errText(`ui: ${msg}\n`);
  }

  const nameFlag = parsed.flags["name"];
  const name = typeof nameFlag === "string" ? nameFlag : "imported-ds";
  if (!NAME_RE.test(name) || name.length > 64) return err("BAD_NAME", `invalid --name '${name}' — must match ^[a-z][a-z0-9-]*$`);

  const registryFlag = parsed.flags["registry"];
  if (registryFlag !== undefined && (typeof registryFlag !== "string" || registryFlag.length === 0)) return err("BAD_ARG", "--registry needs a file path: the component-registry.json that ui ingest-figma-ds wrote");

  const force = parsed.flags["force"] === true;
  if (!force && existsSync(paths.tokens)) return err("EXISTS", `${paths.tokens} already exists (use --force to overwrite)`);

  // --force alone must not silently wipe a non-empty registry (dana lost 3 components + 102 changelog entries this
  // way); --reset-registry is the explicit opt-in. The same guard stands in front of --registry: a sealed registry is
  // never replaced by another, and there is no merge. A sealed registry that cannot be read is refused, not counted as empty.
  const resetRegistry = parsed.flags["reset-registry"] === true;
  let existingCount = 0;
  try { existingCount = sealedRegistryCount(paths.registry); }
  catch (e) {
    if (!(e instanceof ImportRegistryError)) throw e;
    if (!resetRegistry) return err(e.code, e.message);
  }
  if ((force || registryFlag !== undefined) && !resetRegistry && existingCount > 0) {
    return err(
      "REGISTRY_NOT_EMPTY",
      `${registryFlag !== undefined ? "--registry" : "--force"} would wipe ${existingCount} registered component(s) at '${paths.registry}' — ` +
        "pass --reset-registry to confirm, or use 'ui registry register' to add without wiping",
    );
  }

  let imported: Registry | null = null;
  if (typeof registryFlag === "string") {
    try { imported = loadImportRegistry(resolve(registryFlag)); }
    catch (e) {
      if (e instanceof ImportRegistryError) return err(e.code, e.message);
      throw e;
    }
  }

  // Read + plan: every question the file raises is computed before anything is written.
  let flat: unknown;
  try {
    flat = JSON.parse(readFileSync(src, "utf8"));
  } catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (notFound) return err("FILE_NOT_FOUND", `file not found: '${src}'`);
    return err("BAD_JSON", `cannot read/parse '${src}': ${e instanceof Error ? e.message : String(e)}`);
  }

  let plan: ImportPlan;
  try {
    plan = planImport(flat, readRulingStore(projectDir).rulings);
    if (imported !== null) assertBindingsInFile(imported, plan.sourcePaths);
  } catch (e) {
    if (e instanceof RulingStoreError || e instanceof ImportRegistryError) return err(e.code, e.message);
    return err("BAD_JSON", `import failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const blocked = blockOnOpenClusters({
    command: CMD, projectDir, detections: plan.detections, ownKinds: ["untypeable-tokens", "ambiguous-roles", "token-path-collision"], runsProjectDetectors: true, json: useJson,
  });
  if (blocked !== null) return blocked;
  const result = plan.result;
  if (result === null) throw new Error("the import has no open question and no result: this is a bug in the import plan");
  const { stats } = result;
  if (stats.imported === 0) return err("EMPTY_IMPORT", `no typeable tokens found in '${src}' — nothing to import`);

  // Self-check: the emitted DTCG must parse.
  try {
    parseTokenFile(result.tree);
  } catch (e) {
    return err("BAD_JSON", `internal: emitted DTCG did not validate: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Bake role recognition (spec 011 Phase 2) BEFORE sealing, so the seal covers the annotated tree: deterministic, so
  // the hash is stable. Lossless: only $extensions["design-os.role"] is added (see role-recognition.ts). Every role the
  // owner gave is validated against that tree first, so a refusal leaves nothing written.
  const recognition = recognizeRoles(result.tree);
  const annotated = recognition.annotated;
  try { validateRoles(annotated, result.roles); }
  catch (e) {
    if (e instanceof SetRoleError) return err(e.code, `${e.message}. Nothing was written.`);
    throw e;
  }

  // A binding is written only when its token is written: the ones an answer left out are named and counted.
  const { registry, leftOut } = imported === null ? { registry: createEmptyRegistry(), leftOut: [] } : dropBindingsOutsideTree(imported, annotated);
  try {
    sealImportStore({ paths, designDir, name, src, tree: annotated, registry, imported: imported !== null, reset: resetRegistry });
  } catch (e) {
    return err("WRITE_ERROR", `could not write DS store: ${e instanceof Error ? e.message : String(e)}`);
  }
  let applied;
  try { applied = applyRoles(paths, result.roles); }
  catch (e) {
    if (e instanceof SetRoleError) return err(e.code, e.message);
    throw e;
  }
  const givenRoles = new Set(applied.map((a) => a.role));

  // Wire the learning-loop fuel line (spec 012 P2): soul scaffold + default heartbeat + harvest-inbox. Never clobbers
  // an existing soul.md or heartbeat.json.
  const fuelLine = wireFuelLine(designDir);
  const harvest = runHarvest(projectDir);

  const gaps = recognition.gaps.filter((g) => !givenRoles.has(g));
  const asked = hadQuestions(result) || leftOut.length > 0;
  const summary = {
    name, dir: designDir, ...stats, categories: Object.keys(annotated).length,
    rolesRecognized: recognition.recognized + applied.filter((a) => a.changed).length, roleGaps: gaps,
    ...(imported === null ? {} : { registry: { path: paths.registry, components: registry.components.length } }),
    soul: fuelLine.soul, heartbeat: fuelLine.heartbeat, harvest,
    ...(asked ? extraSummary(result, applied, leftOut) : {}),
  };
  if (useJson) return okJsonWithExit(CMD, summary, 0);
  const typeLine = Object.entries(stats.byType).map(([t, n]) => `${n} ${t}`).join(", ");
  const lines = [
    `ds import: ${stats.imported} token(s) [${typeLine}] across ${summary.categories} categories → ${designDir}`,
    `  ${summary.rolesRecognized} roles recognized, ${gaps.length} gaps: ${gaps.join(", ")}`,
    ...(imported === null ? [] : [`  registry: ${registry.components.length} component(s) sealed with the tokens → ${paths.registry}`]),
    ...(asked ? ledgerLines(result, applied, leftOut) : []),
    `  soul: ${fuelLine.soul.path} (draft — edit then set status: ratified)`,
    `  heartbeat: ${fuelLine.heartbeat.path}`,
    "error" in harvest
      ? `  warning: harvest skipped — ${harvest.error}`
      : `  harvest: ${harvest.probesAtZero} probes at 0 → ${harvest.proposals} proposals (review: ui ds harvest-bans --source ${projectDir} --dir ${projectDir})`,
    `  next: ui ds a11y --dir ${parsed.flags["dir"] ?? "."}  ·  ui ds status --dir ${parsed.flags["dir"] ?? "."}`,
  ];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}
