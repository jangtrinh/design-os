/**
 * `ui ds guidelines build|check [--dir <project>] [--out <pack-dir>] [--rulings <file>] [--now <ISO>] [--json]`
 *
 * build  compile the sealed design system into design/guidelines/ (overview, vocabulary,
 *        components + guidelines.manifest.json). Deterministic: same store + same --now
 *        → identical bytes. Nothing is written unless the store loads and verifies.
 * check  lint a built pack: every `token:` / `component:` span must exist in the store,
 *        and no generated block may have been edited. Exit 1 on any error finding.
 *
 * This file is I/O + dispatch only; the pack itself is built in src/core/ds-guidelines-*.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir, DSError } from "../core/design-system.js";
import type { DesignSystem } from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { buildPack } from "../core/ds-guidelines-pack.js";
import { GuidelinesInputError } from "../core/ds-guidelines-model.js";
import type { PackInputs, StoreSourcePaths } from "../core/ds-guidelines-model.js";
import { runCheckOn } from "./ds-guidelines-check-impl.js";
import { readPackInputs } from "./ds-guidelines-inputs.js";

const CMD = "ds guidelines";
const posix = (p: string): string => p.split("\\").join("/");

type Err = (code: string, msg: string) => CommandResult;
type Loaded = { ds: DesignSystem; src: StoreSourcePaths; packDir: string; inputs: PackInputs };

/** Resolve the project, load + verify the sealed store, and pick the pack directory. */
function loadProject(parsed: ParsedArgs, err: Err): Loaded | CommandResult {
  const dirFlag = parsed.flags["dir"];
  const outFlag = parsed.flags["out"];
  const rulingsFlag = parsed.flags["rulings"];
  if (dirFlag === true || outFlag === true || rulingsFlag === true) return err("BAD_ARG", "--dir, --out and --rulings each need a path");
  const unsealedFlag = parsed.flags["allow-unsealed"];
  let ds: DesignSystem;
  try {
    const paths = typeof dirFlag === "string" ? pathsForDir(resolve(dirFlag, "design")) : discoverDesignSystem(undefined);
    ds = loadDesignSystem(paths, { allowUnsealed: unsealedFlag === true });
  } catch (e) {
    const code = e instanceof DSError || e instanceof DSManifestError ? e.code : "BAD_DS";
    return err(code, e instanceof Error ? e.message : String(e));
  }
  const projectDir = dirname(ds.paths.dir);
  const src = { tokens: posix(relative(projectDir, ds.paths.tokens)), registry: posix(relative(projectDir, ds.paths.registry)) };
  const packDir = typeof outFlag === "string" ? resolve(outFlag) : join(ds.paths.dir, "guidelines");
  let inputs: PackInputs;
  try {
    inputs = readPackInputs(projectDir, ds.paths.dir, typeof rulingsFlag === "string" ? rulingsFlag : undefined);
  } catch (e) {
    if (e instanceof GuidelinesInputError) return err(e.code, e.message);
    throw e;
  }
  return { ds, src, packDir, inputs };
}

function parseNow(flag: string | boolean | undefined): string | { error: string } {
  if (flag === undefined) return new Date().toISOString();
  if (typeof flag !== "string" || Number.isNaN(Date.parse(flag))) {
    return { error: `--now must be an ISO-8601 timestamp, got '${String(flag)}'` };
  }
  return flag;
}

function runBuild(parsed: ParsedArgs, err: Err): CommandResult {
  const now = parseNow(parsed.flags["now"]);
  if (typeof now !== "string") return err("BAD_ARG", now.error);
  const loaded = loadProject(parsed, err);
  if ("exitCode" in loaded) return loaded;

  let pack;
  try {
    pack = buildPack(loaded.ds, loaded.src, now, loaded.inputs);
  } catch (e) {
    if (e instanceof GuidelinesInputError) return err(e.code, e.message);
    throw e;
  }
  try {
    for (const f of pack.files) {
      const target = join(loaded.packDir, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.content, "utf8");
    }
  } catch (e) {
    return err("WRITE_ERROR", `cannot write the pack to '${loaded.packDir}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const markdownFiles = pack.files.map((f) => f.path).filter((p) => p.endsWith(".md"));
  if (parsed.json) {
    return okJson(CMD, {
      out: loaded.packDir, files: markdownFiles, ruleCount: pack.ruleCount,
      openQuestions: pack.openQuestions, skippedSources: pack.skipped, seal: pack.seal, generatedAt: now,
    });
  }
  return ok([
    `ds guidelines build: wrote ${pack.files.length} file(s) → ${loaded.packDir}`,
    `  ${markdownFiles.length} guideline file(s), ${pack.ruleCount} rule(s), ${pack.openQuestions} open question(s)`,
    ...pack.skipped.map((s) => `skipped ${s.path}: ${s.reason}`),
    ...(pack.seal.drifted ?? []).map((d) => `seal: unverified — ${d.file} drifted from its sealed hash`),
  ].join("\n") + "\n");
}

function runCheck(parsed: ParsedArgs, err: Err): CommandResult {
  if (parsed.flags["now"] !== undefined) return err("BAD_ARG", "--now applies to 'build' only");
  const loaded = loadProject(parsed, err);
  if ("exitCode" in loaded) return loaded;
  const result = runCheckOn(loaded.ds, loaded.src, loaded.packDir, loaded.inputs, parsed.json);
  return "exitCode" in result ? result : err(result.code, result.message);
}

export function runGuidelines(parsed: ParsedArgs): CommandResult {
  const err: Err = (code, msg) => (parsed.json ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));
  const swallowed = parsed.flags["allow-unsealed"];
  if (typeof swallowed === "string") {
    return err("BAD_ARG", `--allow-unsealed takes no value (it swallowed '${swallowed}') — put it after the action, e.g. 'build --allow-unsealed'`);
  }
  const [action, ...extra] = parsed.positionals;
  if (action === undefined) return err("BAD_ARG", "ui ds guidelines requires an action: build | check. Run 'ui ds --help'.");
  if (extra.length > 0) return err("BAD_ARG", `unexpected argument '${extra[0]}' after '${action}'`);
  switch (action) {
    case "build": return runBuild(parsed, err);
    case "check": return runCheck(parsed, err);
    default: return err("BAD_ARG", `unknown action '${action}' (expected build | check). Run 'ui ds --help'.`);
  }
}
