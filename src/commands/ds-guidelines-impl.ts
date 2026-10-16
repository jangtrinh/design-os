/**
 * `ui ds guidelines build|check|export` — dispatch, flag rules and the build action.
 *
 * build  compile the sealed design system into design/guidelines/ (overview, vocabulary,
 *        components + guidelines.manifest.json). Deterministic: same store + same --now
 *        → identical bytes. Nothing is written unless the store loads and verifies.
 * check  lint a built pack: every `token:` / `component:` span must exist in the store,
 *        and no generated block may have been edited. Exit 1 on any error finding.
 *        With `--profile figma --bundle <dir>` it validates an exported Figma bundle instead.
 * export (src/commands/ds-guidelines-export-impl.ts) writes the Figma bundle + UPLOAD.md.
 *
 * This file is I/O + dispatch only; the pack itself is built in src/core/ds-guidelines-*.ts.
 */
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { buildPack } from "../core/ds-guidelines-pack.js";
import { GuidelinesInputError } from "../core/ds-guidelines-model.js";
import { runCheckOn, runFigmaProfileCheck } from "./ds-guidelines-check-impl.js";
import { runExport } from "./ds-guidelines-export-impl.js";
import { readExistingPack } from "./ds-guidelines-inputs.js";
import { writePackStaged } from "./ds-guidelines-write.js";
import { loadProject } from "./ds-guidelines-load.js";
import type { Err } from "./ds-guidelines-load.js";

const CMD = "ds guidelines";

/** Flags each action accepts besides the globals; any other flag is a BAD_ARG, never silently ignored. */
const ACTION_FLAGS: Readonly<Record<string, readonly string[]>> = {
  build: ["dir", "out", "rulings", "allow-unsealed", "now"],
  check: ["dir", "out", "rulings", "allow-unsealed", "profile", "bundle"],
  export: ["dir", "pack", "out", "rulings", "allow-unsealed", "target", "budget"],
};
const GLOBAL_FLAGS = ["help", "version", "json"];

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
    pack = buildPack(loaded.ds, loaded.src, now, loaded.inputs, readExistingPack(loaded.packDir));
  } catch (e) {
    if (e instanceof GuidelinesInputError) return err(e.code, e.message);
    // Anything else is a defect in the pack builder: say so as a structured error, with the cause.
    return err("BUILD_FAILED", `could not build the pack: ${e instanceof Error ? e.message : String(e)}`);
  }
  let notes: string[];
  try {
    notes = writePackStaged(loaded.packDir, pack.files);
  } catch (e) {
    return err("WRITE_ERROR", `cannot write the pack to '${loaded.packDir}' (parked answers are written first; every answer is in the old or the new files): ${e instanceof Error ? e.message : String(e)}`);
  }

  const markdownFiles = pack.files.map((f) => f.path).filter((p) => p.endsWith(".md"));
  if (parsed.json) {
    return okJson(CMD, {
      out: loaded.packDir, files: markdownFiles, ruleCount: pack.ruleCount,
      openQuestions: pack.openQuestions, orphanedAnswers: pack.orphanedAnswers, staleFiles: pack.staleFiles, skippedSources: pack.skipped, seal: pack.seal, generatedAt: now,
      warnings: notes,
    });
  }
  return ok([
    `ds guidelines build: wrote ${pack.files.length} file(s) → ${loaded.packDir}`,
    `  ${markdownFiles.length} guideline file(s), ${pack.ruleCount} rule(s), ${pack.openQuestions} open question(s)`,
    ...pack.skipped.map((s) => `skipped ${s.path}: ${s.reason}`),
    ...pack.staleFiles.map((p) => `stale ${p}: not produced by this build`),
    ...(pack.seal.drifted ?? []).map((d) => `seal: unverified — ${d.file} drifted from its sealed hash`),
    ...notes.map((n) => `warning: ${n}`),
  ].join("\n") + "\n");
}

function runCheck(parsed: ParsedArgs, err: Err): CommandResult {
  const profile = parsed.flags["profile"];
  const bundle = parsed.flags["bundle"];
  if (profile !== undefined || bundle !== undefined) {
    if (profile !== "figma") return err("BAD_ARG", "--profile takes 'figma' (the only profile) and goes with --bundle <dir>");
    if (typeof bundle !== "string") return err("BAD_ARG", "--profile figma needs --bundle <the exported figma-guidelines folder>");
    return runFigmaProfileCheck(bundle, parsed.json);
  }
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
  if (action === undefined) return err("BAD_ARG", "ui ds guidelines requires an action: build | check | export. Run 'ui ds --help'.");
  if (extra.length > 0) return err("BAD_ARG", `unexpected argument '${extra[0]}' after '${action}'`);
  const allowed = ACTION_FLAGS[action];
  if (allowed === undefined) return err("BAD_ARG", `unknown action '${action}' (expected build | check | export). Run 'ui ds --help'.`);
  const stray = Object.keys(parsed.flags).find((f) => !allowed.includes(f) && !GLOBAL_FLAGS.includes(f));
  if (stray !== undefined) return err("BAD_ARG", `--${stray} does not apply to '${action}' (it takes: ${allowed.map((f) => `--${f}`).join(", ")})`);
  switch (action) {
    case "build": return runBuild(parsed, err);
    case "check": return runCheck(parsed, err);
    default: return runExport(parsed, err);
  }
}
