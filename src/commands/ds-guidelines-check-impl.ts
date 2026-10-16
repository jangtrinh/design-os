/**
 * `ui ds guidelines check` — lint a built pack against the sealed design system, or (with
 * `--profile figma --bundle <dir>`) validate an exported Figma bundle against Figma's limits.
 */
import { compareText } from "../core/ds-guidelines-model.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { DesignSystem } from "../core/design-system.js";
import type { PackInputs, StoreSourcePaths } from "../core/ds-guidelines-model.js";
import type { Finding } from "../core/ds-guidelines-lint.js";
import { validateBundle } from "../core/ds-guidelines-figma-profile.js";
import { collectCheck } from "./ds-guidelines-check-collect.js";
import type { CheckFailure } from "./ds-guidelines-check-collect.js";

export type { CheckFailure } from "./ds-guidelines-check-collect.js";

const CMD = "ds guidelines";

function summarize(findings: readonly Finding[]): { errorCount: number; warningCount: number; exitCode: number } {
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return { errorCount, warningCount: findings.length - errorCount, exitCode: errorCount > 0 ? 1 : 0 };
}

const findingLines = (findings: readonly Finding[]): string[] =>
  findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.code}] ${f.file}:${f.line}: ${f.message}`);

const countLabel = (errorCount: number, warningCount: number): string =>
  `${errorCount} error(s)${warningCount > 0 ? `, ${warningCount} warning(s)` : ""}`;

/** Run every pack check; returns the CommandResult, or a failure the caller reports as an error envelope. */
export function runCheckOn(
  ds: DesignSystem, src: StoreSourcePaths, packDir: string, inputs: PackInputs, useJson: boolean,
): CommandResult | CheckFailure {
  const collected = collectCheck(ds, src, packDir, inputs);
  if ("code" in collected) return collected;
  const { findings, files, openQuestions, termSpansUnchecked } = collected;
  const { errorCount, warningCount, exitCode } = summarize(findings);
  if (useJson) {
    return okJsonWithExit(CMD, { path: packDir, filesChecked: files.length, errorCount, warningCount, openQuestions, findings, termSpansUnchecked }, exitCode);
  }
  const lines = [
    `ds guidelines check: ${packDir} — ${countLabel(errorCount, warningCount)}`,
    ...findingLines(findings),
    ...(termSpansUnchecked > 0 ? [`  note: ${termSpansUnchecked} term: span(s) not checked — this project has no glossary terms`] : []),
  ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

/** `check --profile figma --bundle <dir>`: Figma's limits on a bundle folder. No design system needed. */
export function runFigmaProfileCheck(bundleFlag: string, useJson: boolean): CommandResult {
  const bundle = resolve(bundleFlag);
  let files: { path: string; bytes: number; text: string }[];
  try {
    // Only "it is not there" (or not a folder) is BUNDLE_NOT_FOUND; a folder we cannot stat or list is READ_ERROR.
    let isDirectory = false;
    try {
      isDirectory = statSync(bundle).isDirectory();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT" && (e as NodeJS.ErrnoException).code !== "ENOTDIR") throw e;
    }
    if (!isDirectory) {
      const message = `no Figma bundle folder at '${bundle}' — run 'ui ds guidelines export --target figma' first`;
      return useJson ? errJson(CMD, "BUNDLE_NOT_FOUND", message) : errText(`ui: ${message}\n`);
    }
    files = readdirSync(bundle, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => {
      const abs = join(e.parentPath, e.name);
      const buf = readFileSync(abs);
      return { path: relative(bundle, abs).split("\\").join("/"), bytes: buf.length, text: buf.toString("utf8") };
    }).sort((a, b) => compareText(a.path, b.path));
  } catch (e) {
    const message = `cannot read the bundle at '${bundle}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "READ_ERROR", message) : errText(`ui: ${message}\n`);
  }
  const findings = validateBundle(files).sort((a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.code, b.code));
  const { errorCount, warningCount, exitCode } = summarize(findings);
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  if (useJson) {
    return okJsonWithExit(CMD, { profile: "figma", path: bundle, filesChecked: files.length, totalBytes, errorCount, warningCount, findings }, exitCode);
  }
  const lines = [`ds guidelines check --profile figma: ${bundle} — ${countLabel(errorCount, warningCount)}`, ...findingLines(findings)];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}
