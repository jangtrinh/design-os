/**
 * `ui ds guidelines build|check [--dir <project>] [--out <pack-dir>] [--now <ISO>] [--json]`
 *
 * build  compile the sealed design system into design/guidelines/ (overview, vocabulary,
 *        components + guidelines.manifest.json). Deterministic: same store + same --now
 *        → identical bytes. Nothing is written unless the store loads and verifies.
 * check  lint a built pack: every `token:` / `component:` span must exist in the store,
 *        and no generated block may have been edited. Exit 1 on any error finding.
 *
 * This file is I/O + dispatch only; the pack itself is built in src/core/ds-guidelines-*.ts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { errJson, errText, ok, okJson, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir, DSError } from "../core/design-system.js";
import type { DesignSystem } from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { buildPack } from "../core/ds-guidelines-pack.js";
import { lintGuidelinesFile } from "../core/ds-guidelines-lint.js";
import type { Finding } from "../core/ds-guidelines-lint.js";
import type { StoreSourcePaths } from "../core/ds-guidelines-model.js";

const CMD = "ds guidelines";
const posix = (p: string): string => p.split("\\").join("/");

type Err = (code: string, msg: string) => CommandResult;
type Loaded = { ds: DesignSystem; src: StoreSourcePaths; packDir: string };

/** Resolve the project, load + verify the sealed store, and pick the pack directory. */
function loadProject(parsed: ParsedArgs, err: Err): Loaded | CommandResult {
  const dirFlag = parsed.flags["dir"];
  const outFlag = parsed.flags["out"];
  if (dirFlag === true || outFlag === true) return err("BAD_ARG", "--dir and --out each need a path");
  let ds: DesignSystem;
  try {
    const paths = typeof dirFlag === "string" ? pathsForDir(resolve(dirFlag, "design")) : discoverDesignSystem(undefined);
    ds = loadDesignSystem(paths);
  } catch (e) {
    const code = e instanceof DSError || e instanceof DSManifestError ? e.code : "BAD_DS";
    return err(code, e instanceof Error ? e.message : String(e));
  }
  const projectDir = dirname(ds.paths.dir);
  const src = { tokens: posix(relative(projectDir, ds.paths.tokens)), registry: posix(relative(projectDir, ds.paths.registry)) };
  const packDir = typeof outFlag === "string" ? resolve(outFlag) : join(ds.paths.dir, "guidelines");
  return { ds, src, packDir };
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

  const pack = buildPack(loaded.ds, loaded.src, now);
  try {
    mkdirSync(loaded.packDir, { recursive: true });
    for (const f of pack.files) writeFileSync(join(loaded.packDir, f.path), f.content, "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write the pack to '${loaded.packDir}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const markdownFiles = pack.files.map((f) => f.path).filter((p) => p.endsWith(".md"));
  if (parsed.json) {
    return okJson(CMD, {
      out: loaded.packDir, files: markdownFiles, ruleCount: pack.ruleCount,
      openQuestions: pack.openQuestions, skippedSources: pack.skipped, generatedAt: now,
    });
  }
  return ok([
    `ds guidelines build: wrote ${pack.files.length} file(s) → ${loaded.packDir}`,
    `  ${markdownFiles.length} guideline file(s), ${pack.ruleCount} rule(s), ${pack.openQuestions} open question(s)`,
    ...pack.skipped.map((s) => `skipped ${s.path}: ${s.reason}`),
  ].join("\n") + "\n");
}

function listMarkdown(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => posix(relative(dir, join(e.parentPath, e.name))))
    .sort();
}

function runCheck(parsed: ParsedArgs, err: Err): CommandResult {
  if (parsed.flags["now"] !== undefined) return err("BAD_ARG", "--now applies to 'build' only");
  const loaded = loadProject(parsed, err);
  if ("exitCode" in loaded) return loaded;
  const { ds, packDir } = loaded;
  if (!existsSync(packDir)) {
    return err("PACK_NOT_FOUND", `no guidelines pack at '${packDir}' — run 'ui ds guidelines build' first`);
  }

  const known = {
    tokens: new Set(ds.resolved.map((t) => t.path)),
    components: new Set(ds.registry.components.map((c) => c.name)),
  };
  const findings: Finding[] = [];
  let termSpansUnchecked = 0;
  let files: string[];
  try {
    files = listMarkdown(packDir);
    for (const file of files) {
      const result = lintGuidelinesFile(file, readFileSync(join(packDir, file), "utf8"), known);
      findings.push(...result.findings);
      termSpansUnchecked += result.termSpansUnchecked;
    }
  } catch (e) {
    return err("READ_ERROR", `cannot read the pack at '${packDir}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const exitCode = errorCount > 0 ? 1 : 0;
  if (parsed.json) {
    return okJsonWithExit(CMD, { path: packDir, filesChecked: files.length, errorCount, findings, termSpansUnchecked }, exitCode);
  }
  const lines = [
    `ds guidelines check: ${packDir} — ${errorCount} error(s)`,
    ...findings.map((f) => `  ✗ [${f.code}] ${f.file}:${f.line}: ${f.message}`),
    ...(termSpansUnchecked > 0 ? [`  note: ${termSpansUnchecked} term: span(s) not checked — this pack has no glossary yet`] : []),
  ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

export function runGuidelines(parsed: ParsedArgs): CommandResult {
  const err: Err = (code, msg) => (parsed.json ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));
  const [action, ...extra] = parsed.positionals;
  if (action === undefined) return err("BAD_ARG", "ui ds guidelines requires an action: build | check. Run 'ui ds --help'.");
  if (extra.length > 0) return err("BAD_ARG", `unexpected argument '${extra[0]}' after '${action}'`);
  switch (action) {
    case "build": return runBuild(parsed, err);
    case "check": return runCheck(parsed, err);
    default: return err("BAD_ARG", `unknown action '${action}' (expected build | check). Run 'ui ds --help'.`);
  }
}
