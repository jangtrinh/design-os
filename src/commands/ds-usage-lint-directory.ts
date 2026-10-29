/**
 * Directory mode of `ui ds-usage-lint`: walk a tree of UI sources, lint every file, report what was
 * scanned, what was not, and why . Pure over a root path and lint options; the
 * command owns flags, token loading and exit codes.
 */
import { readFileSync } from "node:fs";

import { lintDsUsageOnMarkup } from "../core/ds-usage-lint.js";
import type { DsUsageFinding, DsUsageLintOptions, DsUsageLintResult } from "../core/ds-usage-lint.js";
import { walkUiSources } from "../core/polyglot-ui-walk.js";
import type { UiSkip } from "../core/polyglot-ui-walk.js";
import { inlineLinkedCss } from "../core/html-css-loader.js";
import { uiSourceExtension } from "../core/polyglot-ui-extractor.js";

export interface DsUsageFileReport extends DsUsageLintResult {
  /** Path relative to the walked root. */
  file: string;
}
export interface DsUsageDirectoryReport {
  root: string;
  scanned: number;
  total: number;
  skipped: UiSkip[];
  /** Only files with at least one finding; the rest are `scanned` minus `files.length`. */
  files: DsUsageFileReport[];
  /** Checks that did not run for the whole sweep (one design system, so one list), each with its reason. */
  skippedChecks: string[];
  errorCount: number;
  warningCount: number;
  hardcodedColorCount: number;
  offSystemTokenCount: number;
  undeclaredTokenCount: number;
  offSystemFontCount: number;
  unevaluatedFontCount: number;
}

type ReportFinding = DsUsageFinding | { checkId: string; severity: string; message: string; line?: number };

export function lintDirectory(root: string, opts: DsUsageLintOptions): DsUsageDirectoryReport {
  const walk = walkUiSources(root);
  const skipped = [...walk.skipped];
  const files: DsUsageFileReport[] = [];
  const skippedChecks = new Set<string>();
  let scanned = 0;
  const sum = { errorCount: 0, warningCount: 0, hardcodedColorCount: 0, offSystemTokenCount: 0, undeclaredTokenCount: 0, offSystemFontCount: 0, unevaluatedFontCount: 0 };
  walk.files.forEach((abs, i) => {
    const rel = walk.relative[i] as string;
    let text: string;
    try { text = readFileSync(abs, "utf8"); }
    catch (e) { skipped.push({ path: rel, reason: `cannot read: ${e instanceof Error ? e.message : String(e)}` }); return; }
    scanned++;
    // HTML goes through the shared loader like the single-file path: inline + LOCAL linked CSS are judged
    // as if inlined, and an unreadable link is an error finding, never silence.
    const loaded = uiSourceExtension(rel) === ".html" ? inlineLinkedCss(abs, text) : { html: text, errors: [] };
    const linted = lintDsUsageOnMarkup(loaded.html, { ...opts, file: rel });
    const result: DsUsageLintResult = loaded.errors.length === 0 ? linted
      : { ...linted, findings: [...loaded.errors, ...linted.findings] as DsUsageFinding[], errorCount: linted.errorCount + loaded.errors.length };
    for (const s of result.skippedChecks) skippedChecks.add(s);
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += result[k];
    if (result.findings.length > 0) files.push({ file: rel, ...result });
  });
  return { root, scanned, total: walk.total, skipped, files, skippedChecks: [...skippedChecks], ...sum };
}

export function formatDirectoryReport(r: DsUsageDirectoryReport): string {
  const lines = [
    `ds-usage-lint: ${r.root} — scanned ${r.scanned} of ${r.total} files — ${r.hardcodedColorCount} hardcoded colour(s), ` +
      `${r.offSystemTokenCount} off-system token(s), ${r.undeclaredTokenCount} undeclared reference(s), ${r.offSystemFontCount} off-system font(s)`,
  ];
  for (const s of r.skipped) lines.push(`  skipped ${s.path}: ${s.reason}`);
  for (const s of r.skippedChecks) lines.push(`  skipped ${s}`);
  if (r.unevaluatedFontCount > 0) lines.push(`  NOT EVALUATED: ${r.unevaluatedFontCount} font-family value(s) built at build time (\${...}) — read them in the built output`);
  for (const f of r.files) {
    lines.push(`  ${f.file}: ${f.errorCount} error(s), ${f.warningCount} warning(s)`);
    for (const x of f.findings as ReportFinding[]) {
      lines.push(`    ${x.severity === "error" ? "✗" : "!"} [${x.checkId}]${x.line !== undefined ? ` line ${x.line}` : ""}: ${x.message}`);
    }
  }
  lines.push(`  ${r.scanned - r.files.length} of ${r.scanned} scanned file(s) clean`);
  lines.push("  NOTE: proves token usage in the files' own CSS and class lists only — not rendered colour or font; not a conformance claim.");
  return lines.join("\n") + "\n";
}
