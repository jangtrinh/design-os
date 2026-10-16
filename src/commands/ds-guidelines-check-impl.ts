/**
 * `ui ds guidelines check` — lint a built pack against the sealed design system.
 * Reads the pack's markdown + manifest and the optional rulings file (for superseded ids);
 * every judgement itself lives in src/core/ds-guidelines-lint*.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { DesignSystem } from "../core/design-system.js";
import { lintGuidelinesFile } from "../core/ds-guidelines-lint.js";
import type { Finding } from "../core/ds-guidelines-lint.js";
import { checkCompleteness, findDuplicateRules } from "../core/ds-guidelines-lint-pack.js";
import { lintSlots } from "../core/ds-guidelines-lint-slots.js";
import { orphanEntryCount, ORPHANS_FILE } from "../core/ds-guidelines-slots.js";
import { GuidelinesInputError, PACK_MANIFEST_NAME } from "../core/ds-guidelines-model.js";
import type { PackInputs, StoreSourcePaths } from "../core/ds-guidelines-model.js";
import { parseRulings, supersededRulingIds } from "../core/ds-guidelines-rulings-reader.js";
import { avoidedWords, loadTerminology } from "../core/ds-guidelines-terminology-sections.js";

const posix = (p: string): string => p.split("\\").join("/");

function listMarkdown(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => posix(relative(dir, join(e.parentPath, e.name))))
    // The orphans file is a holding area for answers whose names may be stale: it is never linted.
    .filter((p) => p !== ORPHANS_FILE)
    .sort();
}

/** Gap ids the manifest recorded; undefined when the manifest cannot be read (completeness reports that). */
function recordedGapIds(manifestText: string | undefined): Set<string> | undefined {
  if (manifestText === undefined) return undefined;
  try {
    const gaps = (JSON.parse(manifestText) as { gaps?: { id?: unknown }[] }).gaps;
    return new Set((gaps ?? []).flatMap((g) => (typeof g.id === "string" ? [g.id] : [])));
  } catch {
    return undefined;
  }
}

export interface CheckFailure { code: string; message: string }

/** Run every check; returns the CommandResult, or a failure the caller reports as an error envelope. */
export function runCheckOn(
  ds: DesignSystem, src: StoreSourcePaths, packDir: string, inputs: PackInputs, useJson: boolean,
): CommandResult | CheckFailure {
  if (!existsSync(packDir)) {
    return { code: "PACK_NOT_FOUND", message: `no guidelines pack at '${packDir}' — run 'ui ds guidelines build' first` };
  }
  let supersededIds = new Set<string>();
  try {
    if (inputs.rulings.text !== undefined) supersededIds = supersededRulingIds(parseRulings(inputs.rulings.text, inputs.rulings.path));
  } catch (e) {
    if (e instanceof GuidelinesInputError) return { code: e.code, message: e.message };
    throw e;
  }

  const { terms } = loadTerminology(inputs.context, inputs.glossary);
  const ctx = {
    ...(terms.length > 0 ? { glossary: { terms: new Set(terms.map((t) => t.term)), avoided: avoidedWords(terms) } } : {}),
    known: {
      tokens: new Set(ds.resolved.map((t) => t.path)),
      components: new Set(ds.registry.components.map((c) => c.name)),
    },
    supersededIds,
  };
  const findings: Finding[] = [];
  let termSpansUnchecked = 0;
  let files: { path: string; text: string }[];
  let manifestText: string | undefined;
  let orphansText: string | undefined;
  try {
    files = listMarkdown(packDir).map((path) => ({ path, text: readFileSync(join(packDir, path), "utf8") }));
    const manifestPath = join(packDir, PACK_MANIFEST_NAME);
    manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : undefined;
    const orphansPath = join(packDir, ORPHANS_FILE);
    orphansText = existsSync(orphansPath) ? readFileSync(orphansPath, "utf8") : undefined;
  } catch (e) {
    return { code: "READ_ERROR", message: `cannot read the pack at '${packDir}': ${e instanceof Error ? e.message : String(e)}` };
  }
  const gapIds = recordedGapIds(manifestText);
  let openQuestions = 0;
  for (const f of files) {
    const result = lintGuidelinesFile(f.path, f.text, ctx);
    findings.push(...result.findings);
    termSpansUnchecked += result.termSpansUnchecked;
    const slots = lintSlots(f.path, f.text, gapIds);
    findings.push(...slots.findings);
    openQuestions += slots.openQuestions;
  }
  const orphaned = orphansText === undefined ? 0 : orphanEntryCount(orphansText);
  if (orphaned > 0) {
    findings.push({
      code: "ORPHANED_ANSWERS", severity: "warning", file: ORPHANS_FILE, line: 1,
      message: `${orphaned} answer(s) wait in ${ORPHANS_FILE} — move each into a current slot or delete it`,
    });
  }
  findings.push(...findDuplicateRules(files), ...checkCompleteness(manifestText, files));
  // --allow-unsealed accepted a drifted store: say so once per drifted file (a warning, never an error).
  for (const d of ds.unsealedDrift ?? []) {
    const file = d.file === "tokens" ? src.tokens : src.registry;
    findings.push({
      code: "SEAL_UNVERIFIED", severity: "warning", file, line: 1,
      message: `${file} no longer matches its sealed hash (manifest ${d.expected}, file ${d.actual}) — names were resolved against the unverified store`,
    });
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const exitCode = errorCount > 0 ? 1 : 0;
  if (useJson) {
    return okJsonWithExit("ds guidelines", { path: packDir, filesChecked: files.length, errorCount, warningCount, openQuestions, findings, termSpansUnchecked }, exitCode);
  }
  const lines = [
    `ds guidelines check: ${packDir} — ${errorCount} error(s)${warningCount > 0 ? `, ${warningCount} warning(s)` : ""}`,
    ...findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.code}] ${f.file}:${f.line}: ${f.message}`),
    ...(termSpansUnchecked > 0 ? [`  note: ${termSpansUnchecked} term: span(s) not checked — this project has no glossary terms`] : []),
  ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}
