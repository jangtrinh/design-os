/**
 * The text a person reads for `ui ontology build` and `ui ontology lint`: the meaning leads and a code follows it, and
 * a line names a next action only when that action would succeed. The coverage table is always printed.
 */
import { coverageTable } from "../core/ontology/coverage.js";
import type { LintFinding } from "../core/ontology/lint-ontology.js";
import type { LinkReport, Ontology } from "../core/ontology/ontology-types.js";

const pad = (s: string | number, n: number): string => String(s).padEnd(n);

export function coverageText(o: Ontology): string {
  const rows = coverageTable(o);
  const lines = [`  ${pad("kind", 10)}${pad("nodes", 7)}${pad("linked", 8)}${pad("orphan", 8)}${pad("standalone", 12)}source missing`];
  for (const r of rows) lines.push(`  ${pad(r.kind, 10)}${pad(r.nodes, 7)}${pad(r.linked, 8)}${pad(r.orphan, 8)}${pad(r.standalone, 12)}${r.sourceMissing}`);
  return lines.join("\n");
}

/** What each link kind found: written, unresolved, not sensed (with its reason), not checked, and the detail lines. */
export function linksText(reports: readonly LinkReport[]): string {
  const lines = ["Links"];
  for (const l of reports) {
    const parts = [`${l.written} written`, `${l.unresolved} unresolved`, `${l.notSensed} not sensed`, ...(l.notChecked === undefined ? [] : [`${l.notChecked} not checked`])];
    lines.push(`  ${pad(l.link, 16)}${parts.join(" · ")}`);
    if (l.notSensedReason !== undefined) lines.push(`    not sensed: ${l.notSensedReason}`);
    for (const d of l.details) lines.push(`    ${d}`);
  }
  return lines.join("\n");
}

/** The summary shared by a written build and a blocked one: what is in the graph and what could not be linked. */
export function summaryText(o: Ontology): string {
  const lines: string[] = [];
  lines.push("Sources");
  for (const s of o.sources) {
    lines.push(`  ${pad(s.kind, 10)}${pad(s.status, 11)}${s.note}`);
    for (const d of s.doors ?? []) lines.push(`    ${pad(d.door === "figma" ? "Figma" : "code", 8)}${pad(d.status, 11)}${d.note}`);
  }
  lines.push("", "Coverage", coverageText(o), "", linksText(o.linkReports));
  if (o.uncovered.length > 0) lines.push("", `Orphans no question covers: ${o.uncovered.map((u) => `${u.count} ${u.kind}`).join(", ")} (no candidate to ask about; they stay orphans)`);
  const waiting = [o.proposals.rules > 0 ? `${o.proposals.rules} adherence rule(s)` : "", o.proposals.soul > 0 ? `${o.proposals.soul} soul rule(s)` : ""].filter((s) => s !== "");
  if (waiting.length > 0) lines.push("", `Proposals waiting, not nodes: ${waiting.join(", ")}`);
  return lines.join("\n");
}

export function buildText(o: Ontology, outRel: string): string {
  return `Ontology written: ${o.nodes.length} node(s), ${o.links.length} link(s) in ${outRel}\n\n${summaryText(o)}\n\nNext: ui ontology lint\n`;
}

export function blockedSummaryText(o: Ontology): string {
  return `\nWhat would be written once the questions are answered: ${o.nodes.length} node(s), ${o.links.length} link(s)\n\n${summaryText(o)}\n`;
}

export function lintText(findings: readonly LintFinding[], o: Ontology | null): string {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const lines = [errors.length === 0 ? `The ontology is consistent: ${warnings.length} warning(s)` : `The ontology has ${errors.length} error(s) and ${warnings.length} warning(s)`];
  for (const f of errors) lines.push(`  error: ${f.message} (${f.code})`);
  for (const f of warnings) lines.push(`  warning: ${f.message} (${f.code})`);
  lines.push("", "Coverage", o === null ? "  no ontology to count: run ui ontology build" : coverageText(o));
  if (o !== null) lines.push("", linksText(o.linkReports ?? []));
  return `${lines.join("\n")}\n`;
}
