/**
 * runHarvestBans - `ui ds harvest-bans --source <dir> [--dir <project>] [--write] [--accept <NS-id>] [--json]`.
 *
 * Counts the SaaS cliches a codebase never uses (12 probes, each with its denominator) and proposes
 * them as bans. Proposals only: `--write` fills the generated region of `## Never (proposed)` in design/soul.md and
 * design/rules/_adherence.proposed.json; the binding `## Never` and `_adherence.rules.json` are never
 * written by a harvest. `--accept <NS-id>` is the owner's act: it moves one proposed machine rule into
 * the binding rules file. Without `--write` the run is a dry run and writes nothing.
 */
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { DSError } from "../core/design-system.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { acceptProposal, harvestProject } from "../core/negative-space-proposals.js";
import type { ProjectHarvest } from "../core/negative-space-proposals.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds harvest-bans";
const KNOWN_FLAGS = ["source", "dir", "write", "accept"] as const;
const SHOWN_EXCLUDED = 5;

function renderText(h: ProjectHarvest, write: boolean): string {
  const { report, plan } = h;
  const w = report.walk;
  const lines = [
    `ds harvest-bans: ${report.sourceDir}`,
    `  read ${w.uiFiles} UI source file(s), ${w.styleFiles} stylesheet(s) and ${w.tokenJsonFiles} token JSON file(s) (${w.total} met, ${w.skipped.length} skipped)`,
    report.figma.present
      ? `  figma inventory: ${report.figma.components} component(s) from ${report.figma.files.join(", ")} (names and sizes only)`
      : "  figma inventory: none (design/ds.json and design/canvas-inventory.json absent)",
  ];
  if (w.directories.length > 0) {
    lines.push("  where the files read came from (most first):");
    for (const d of w.directories) lines.push(`    ${d.path === "./" ? "./ (files directly in the source root)" : d.path}  ${d.files} file(s)`);
    if (w.directoriesOmitted > 0) lines.push(`    +${w.directoriesOmitted} more director${w.directoriesOmitted === 1 ? "y" : "ies"} (${w.directoriesOmittedFiles} file(s))`);
    lines.push("  to narrow the source: ui ds harvest-bans --source <dir> --write");
  }
  const unread = Object.entries(w.unread).map(([ext, n]) => `${ext} ${n}`);
  lines.push(`  other template/style files met and not read: ${unread.length === 0 ? "none" : unread.join(", ")}`);
  for (const s of w.skipped.slice(0, 5)) lines.push(`  skipped ${s.path}: ${s.reason}`);
  if (w.skipped.length > 5) lines.push(`  +${w.skipped.length - 5} more skipped`);
  for (const p of report.probes) {
    const step = plan.find((x) => x.id === p.id);
    lines.push(`${p.id} ${p.slug}: ${p.count} found in ${p.scannedFiles} scanned file(s)${step === undefined ? "" : ` -> ${step.status === "propose" ? `propose: ${step.note}` : `no proposal: ${step.note}`}`}`);
    lines.push(`    matches: ${p.matches}`);
    if (p.skippedFiles > 0) lines.push(`    ${p.skippedFiles} file(s) of the kinds this probe judges were not read (see skipped)`);
    for (const x of p.hits) lines.push(`    hit ${x.file}${x.line > 0 ? `:${x.line}` : ""}  ${x.excerpt}`);
    if (p.hitsOmitted > 0) lines.push(`    +${p.hitsOmitted} more`);
    for (const x of p.excluded.slice(0, SHOWN_EXCLUDED)) lines.push(`    excluded ${x.file}:${x.line}  ${x.reason}`);
    const hiddenExcluded = p.excluded.length - SHOWN_EXCLUDED + p.excludedOmitted;
    if (hiddenExcluded > 0) lines.push(`    +${hiddenExcluded} more excluded`);
    for (const n of p.notEvaluated) lines.push(`    not evaluated: ${n}`);
  }
  lines.push("limits (what no probe sees):", ...report.limits.map((l) => `  - ${l}`));
  const proposals = plan.filter((x) => x.status === "propose");
  const rules = proposals.filter((x) => x.rule !== undefined).length;
  lines.push(`proposals: ${proposals.length} (${proposals.length} bullet(s), ${rules} machine rule(s))`);
  const accepted = plan.filter((x) => x.status === "accepted");
  if (accepted.length > 0) lines.push(`accepted, waiting for a line under '## Never': ${accepted.map((x) => x.id).join(", ")}`);
  if (write && h.written !== undefined) {
    lines.push(`  soul: ${h.written.soul.path} ${h.written.soul.changed ? "updated" : "unchanged"} (only the generated region of '## Never (proposed)')`);
    lines.push(`  rules: ${h.written.proposedRules.path} ${h.written.proposedRules.changed ? "updated" : "unchanged"}`);
    lines.push("  binding '## Never' and _adherence.rules.json: not touched. Promote with: ui ds harvest-bans --accept <NS-id>");
  } else {
    lines.push("dry run: nothing written. Re-run with --write to record the proposals.");
  }
  return lines.join("\n") + "\n";
}

export function runHarvestBans(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => (useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const { source, dir, write, accept } = parsed.flags;
  if (dir !== undefined && typeof dir !== "string") return err("BAD_ARG", "--dir needs a path. Usage: ui ds harvest-bans --source <dir> [--dir <project>]");
  if (write !== undefined && write !== true) return err("BAD_ARG", "--write takes no value. Usage: ui ds harvest-bans --source <dir> --write");
  const projectDir = resolve(typeof dir === "string" ? dir : process.cwd());
  const designDir = join(projectDir, "design");

  try {
    if (accept !== undefined) {
      if (typeof accept !== "string") return err("BAD_ARG", "--accept needs a probe id, e.g. --accept NS-01");
      if (source !== undefined || write !== undefined) return err("BAD_ARG", "--accept promotes a proposed rule and takes no --source or --write. Usage: ui ds harvest-bans --accept <NS-id> [--dir <project>]");
      const r = acceptProposal(designDir, accept);
      if (useJson) return okJsonWithExit(CMD, { accepted: r.id, rules: r.rulesPath, proposed: r.proposedPath }, 0);
      return { exitCode: 0, stdout: `ds harvest-bans: ${r.id} promoted to ${r.rulesPath} and removed from ${r.proposedPath}.\n  soul.md was not changed: move the ${r.id} bullet from '## Never (proposed)' into '## Never' yourself.\n  Until a line under '## Never' names ${r.id}, every harvest keeps its bullet in '## Never (proposed)', marked accepted; 'ui ds soul check' warns while it is not moved.\n` };
    }
    if (typeof source !== "string" || source.length === 0) return err("BAD_ARG", "missing --source <dir>. Usage: ui ds harvest-bans --source <dir> [--dir <project>] [--write] [--json]");
    const sourceDir = resolve(source);
    if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) return err("FILE_NOT_FOUND", `source directory not found: '${source}'`);
    const h = harvestProject({ projectDir, sourceDir, write: write === true });
    if (useJson) return okJsonWithExit(CMD, { write: write === true, source: h.report.sourceDir, label: h.label, report: h.report, proposals: h.plan, written: h.written ?? null }, 0);
    return { exitCode: 0, stdout: renderText(h, write === true) };
  } catch (e) {
    if (e instanceof DSError) return err(e.code, e.message);
    return err("WRITE_ERROR", `harvest-bans failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
