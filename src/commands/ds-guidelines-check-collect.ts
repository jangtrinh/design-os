/**
 * `ui ds guidelines check` / `export` — read a built pack and collect every finding (fs read only).
 *
 * The pack is the manifest's file list: markdown the manifest does not list is STALE (a warning,
 * never linted, never exported). The orphans file is a holding area and is never linted either.
 * Every judgement itself lives in src/core/ds-guidelines-lint*.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

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

export interface CheckFailure { code: string; message: string }

export interface Collected {
  findings: Finding[];
  /** The linted pack files (manifest-listed markdown). */
  files: { path: string; text: string }[];
  manifestText?: string;
  openQuestions: number;
  termSpansUnchecked: number;
}

function listAll(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => posix(relative(dir, join(e.parentPath, e.name))))
    .sort();
}

/** The manifest's id lists; undefined when the manifest cannot be read (completeness reports that). */
function manifestIds(text: string | undefined): { gaps: Set<string>; listed: Set<string> } | undefined {
  if (text === undefined) return undefined;
  try {
    const m = JSON.parse(text) as { gaps?: { id?: unknown }[]; files?: { path?: unknown }[] };
    const strings = (xs: { id?: unknown; path?: unknown }[] | undefined, key: "id" | "path"): string[] =>
      (xs ?? []).flatMap((x) => (typeof x[key] === "string" ? [x[key] as string] : []));
    return { gaps: new Set(strings(m.gaps, "id")), listed: new Set(strings(m.files, "path")) };
  } catch {
    return undefined;
  }
}

export function collectCheck(ds: DesignSystem, src: StoreSourcePaths, packDir: string, inputs: PackInputs): Collected | CheckFailure {
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
    known: { tokens: new Set(ds.resolved.map((t) => t.path)), components: new Set(ds.registry.components.map((c) => c.name)) },
    supersededIds,
  };

  let all: string[];
  let manifestText: string | undefined;
  let orphansText: string | undefined;
  try {
    all = listAll(packDir);
    const manifestPath = join(packDir, PACK_MANIFEST_NAME);
    manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : undefined;
    const orphansPath = join(packDir, ORPHANS_FILE);
    orphansText = existsSync(orphansPath) ? readFileSync(orphansPath, "utf8") : undefined;
  } catch (e) {
    return { code: "READ_ERROR", message: `cannot read the pack at '${packDir}': ${e instanceof Error ? e.message : String(e)}` };
  }
  const ids = manifestIds(manifestText);
  const markdown = all.filter((p) => p.endsWith(".md") && p !== ORPHANS_FILE);
  const linted = ids !== undefined ? markdown.filter((p) => ids.listed.has(p)) : markdown;
  let files: { path: string; text: string }[];
  try {
    files = linted.map((path) => ({ path, text: readFileSync(join(packDir, path), "utf8") }));
  } catch (e) {
    return { code: "READ_ERROR", message: `cannot read the pack at '${packDir}': ${e instanceof Error ? e.message : String(e)}` };
  }

  const findings: Finding[] = [];
  let termSpansUnchecked = 0;
  let openQuestions = 0;
  for (const f of files) {
    const result = lintGuidelinesFile(f.path, f.text, ctx);
    findings.push(...result.findings);
    termSpansUnchecked += result.termSpansUnchecked;
    const slots = lintSlots(f.path, f.text, ids?.gaps);
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
  for (const path of ids !== undefined ? all.filter((p) => p !== PACK_MANIFEST_NAME && p !== ORPHANS_FILE && !ids.listed.has(p)) : []) {
    findings.push({
      code: "STALE_FILE", severity: "warning", file: path, line: 1,
      message: "not listed in the manifest: the last build did not produce it — delete it (Figma export and checks ignore it)",
    });
  }
  findings.push(...findDuplicateRules(files), ...checkCompleteness(manifestText, files));
  for (const d of ds.unsealedDrift ?? []) {
    const file = d.file === "tokens" ? src.tokens : src.registry;
    findings.push({
      code: "SEAL_UNVERIFIED", severity: "warning", file, line: 1,
      message: `${file} no longer matches its sealed hash (manifest ${d.expected}, file ${d.actual}) — names were resolved against the unverified store`,
    });
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return { findings, files, ...(manifestText !== undefined ? { manifestText } : {}), openQuestions, termSpansUnchecked };
}
