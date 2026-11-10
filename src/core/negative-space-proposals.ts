/**
 * negative-space-proposals.ts - turn a harvest into PROPOSALS (the owner promotes; see negative-space-accept.ts).
 *
 * A zero count is evidence, not a decision (owner ruling): a harvest writes exactly two things, the generated
 * region of the `## Never (proposed)` section in design/soul.md (ds-soul-proposed-region.ts) and
 * design/rules/_adherence.proposed.json. It never writes the binding `## Never` or `_adherence.rules.json`.
 *
 *   - A probe is proposed when its count is 0 over at least one file of the kinds it judges AND the walk read at
 *     least one UI source or stylesheet file (a lone tokens file is not a codebase), and the id is not already
 *     promoted. Every bullet and rule `source` states the files read, the files not read and the other
 *     template or style files met and not read. There is no minimum file count: the owner reads the number.
 *   - A promoted id (its rule is in `_adherence.rules.json`) keeps its bullet in the region, marked accepted,
 *     until a line under the binding `## Never` names it; then it leaves the region.
 *   - A machine rule is written only where an implemented rule kind can express the ban (`token-ban` today);
 *     the other probes get the bullet and wait for their rule kind.
 *   - The proposed file holds the rules the harvester manages (`NS-nn`) plus anything the owner added; a
 *     re-run replaces the managed ones and keeps the rest.
 *   - Nothing is written when the text did not change; a refused soul write (text edited inside the markers)
 *     happens before either file is touched.
 */
import { join, relative, resolve, isAbsolute, basename } from "node:path";

import { parseAdherenceRules } from "./adherence-rules.js";
import { SOUL_FILENAME, SOUL_SCAFFOLD } from "./ds-soul.js";
import { applyProposedRegion, bindingNeverIds } from "./ds-soul-proposed-region.js";
import { harvestNegativeSpace } from "./negative-space-harvester.js";
import type { HarvestReport, ProbeResult } from "./negative-space-harvester.js";
import { NEGATIVE_SPACE_PROBES, probeById } from "./negative-space-probes.js";
import { atomicWrite, bindingRulesPath, dumpRules, loadFile, proposedRulesPath, readIfPresent } from "./negative-space-rule-files.js";

export { acceptProposal, defaultAcceptIO } from "./negative-space-accept.js";
export type { AcceptIO } from "./negative-space-accept.js";
export { atomicWrite, bindingRulesPath, proposedRulesPath } from "./negative-space-rule-files.js";

export type ProposalStatus = "propose" | "accepted" | "skip-nonzero" | "skip-no-files" | "skip-promoted";
export interface ProposedRule {
  id: string; kind: "token-ban"; severity: "error"; message: string; source: string; tokens: string[]; excludeElements?: string[];
}
export interface Proposal { id: string; status: ProposalStatus; note: string; bullet?: string; rule?: ProposedRule }
export interface PromotedState { bindingRuleIds: ReadonlySet<string>; boundNeverIds: ReadonlySet<string> }
export interface ProposalWrite { path: string; changed: boolean }

export function readPromotedState(designDir: string): PromotedState {
  const soul = readIfPresent(join(designDir, SOUL_FILENAME));
  return {
    bindingRuleIds: new Set(loadFile(bindingRulesPath(designDir), "binding").map((r) => r.rule.id)),
    boundNeverIds: new Set(soul === undefined ? [] : bindingNeverIds(soul)),
  };
}

/** The evidence a bullet and a rule `source` carry: what was read, what was not, and what was met and left unread. */
export function evidenceText(p: ProbeResult, report: HarvestReport, label: string): string {
  const unread = Object.entries(report.walk.unread).map(([ext, n]) => `${ext} ${n}`).join(", ");
  return `0 hits in ${p.scannedFiles} file(s) read under ${label}; ${p.skippedFiles} file(s) not read (skipped: unreadable, oversized or symlink); other template/style files met and not read: ${unread === "" ? "none" : unread}`;
}

export function planProposals(report: HarvestReport, promoted: PromotedState, label: string): Proposal[] {
  return report.probes.map((p): Proposal => {
    if (promoted.boundNeverIds.has(p.id)) return { id: p.id, status: "skip-promoted", note: "already promoted: a line under '## Never' names it" };
    if (promoted.bindingRuleIds.has(p.id)) {
      return { id: p.id, status: "accepted", note: "accepted: its bullet stays until a line under '## Never' names it", bullet: `- ${p.id} ${p.summary} — accepted: move this line under '## Never'` };
    }
    if (p.count > 0) return { id: p.id, status: "skip-nonzero", note: `found ${p.count} in ${p.scannedFiles} scanned file(s)` };
    const judgedNothing = report.walk.uiFiles + report.walk.styleFiles === 0;
    if (p.scannedFiles === 0 || judgedNothing) return { id: p.id, status: "skip-no-files", note: judgedNothing ? "no UI source or stylesheet file was read" : "no file of the kinds this probe judges was read" };
    const excludedTotal = p.excluded.length + p.excludedOmitted;
    const reasons = [...new Set(p.excluded.map((e) => e.reason))].join("; ");
    const evidence = evidenceText(p, report, label);
    const bullet = `- ${p.id} ${p.summary} — ${evidence}${excludedTotal > 0 ? ` (${excludedTotal} excluded: ${reasons})` : ""}`;
    const def = probeById(p.id);
    const rule: ProposedRule | undefined = def?.rule === undefined ? undefined : {
      id: p.id, kind: "token-ban", severity: "error", message: def.rule.message,
      source: `ui ds harvest-bans: ${evidence} (${p.id})`, tokens: [...def.rule.tokens],
      ...(def.rule.excludeElements !== undefined && { excludeElements: [...def.rule.excludeElements] }),
    };
    return { id: p.id, status: "propose", note: rule === undefined ? "bullet only, its rule kind comes in a later phase" : "bullet and token-ban rule", bullet, ...(rule !== undefined && { rule }) };
  });
}

/** Write the proposals. Throws before writing anything if an existing rules file is invalid or the soul region was edited. */
export function writeProposals(designDir: string, report: HarvestReport, label: string): { plan: Proposal[]; soul: ProposalWrite; proposedRules: ProposalWrite } {
  const promoted = readPromotedState(designDir);
  const existing = loadFile(proposedRulesPath(designDir), "proposed");
  const plan = planProposals(report, promoted, label);
  const bullets = plan.flatMap((x) => (x.bullet !== undefined ? [x.bullet] : []));

  const managed = new Set(NEGATIVE_SPACE_PROBES.map((p) => p.id));
  const kept = existing.filter((r) => !managed.has(r.rule.id)).map((r) => r.rule);
  const rules = [...kept, ...plan.flatMap((x) => (x.rule !== undefined ? [x.rule] : []))];
  const rulesText = dumpRules(rules);
  parseAdherenceRules(rulesText, proposedRulesPath(designDir), "proposed"); // the emitter's own output must load

  const soulPath = join(designDir, SOUL_FILENAME);
  const soulText = readIfPresent(soulPath);
  // a soul that is absent starts from the scaffold, so the file a harvest creates is the one `ds soul init` would
  const soulBase = soulText ?? (bullets.length > 0 ? SOUL_SCAFFOLD : undefined);
  // computed before anything is written: a refusal (text edited inside the markers) leaves both files as they were
  const soulNext = soulBase === undefined ? undefined : applyProposedRegion(soulBase, bullets, soulPath);
  const soulChanged = soulNext !== undefined && soulNext !== soulText;
  if (soulChanged) atomicWrite(soulPath, soulNext);

  const priorRules = readIfPresent(proposedRulesPath(designDir));
  const rulesChanged = priorRules === undefined ? rules.length > 0 : priorRules !== rulesText;
  if (rulesChanged) atomicWrite(proposedRulesPath(designDir), rulesText);
  return { plan, soul: { path: soulPath, changed: soulChanged }, proposedRules: { path: proposedRulesPath(designDir), changed: rulesChanged } };
}

/** How the source reads in a bullet: relative to the project, `./` for the project itself, else the folder name. */
export function sourceLabel(projectDir: string, sourceDir: string): string {
  const rel = relative(resolve(projectDir), resolve(sourceDir));
  if (rel === "") return "./";
  if (rel.startsWith("..") || isAbsolute(rel)) return `${basename(resolve(sourceDir))}/`;
  return `${rel.split("\\").join("/")}/`;
}

export interface ProjectHarvest {
  report: HarvestReport;
  plan: Proposal[];
  label: string;
  written?: { soul: ProposalWrite; proposedRules: ProposalWrite };
}
/** Harvest `sourceDir` for the project at `projectDir`; with `write`, also write the proposals. */
export function harvestProject(opts: { projectDir: string; sourceDir: string; write: boolean }): ProjectHarvest {
  const projectDir = resolve(opts.projectDir);
  const sourceDir = resolve(opts.sourceDir);
  const designDir = join(projectDir, "design");
  const report = harvestNegativeSpace({ sourceDir, designDir, skipPrefixes: sourceDir === projectDir ? ["design/"] : [] });
  const label = sourceLabel(projectDir, sourceDir);
  if (!opts.write) return { report, plan: planProposals(report, readPromotedState(designDir), label), label };
  const { plan, soul, proposedRules } = writeProposals(designDir, report, label);
  return { report, plan, label, written: { soul, proposedRules } };
}
