/**
 * negative-space-proposals.ts - turn a harvest into PROPOSALS, and let the owner promote one.
 *
 * A zero count is evidence, not a decision (owner ruling): a harvest writes exactly two things, the
 * `## Never (proposed)` block in design/soul.md and design/rules/_adherence.proposed.json. It never
 * writes the binding `## Never` or `_adherence.rules.json`; gates enforce promoted rules only.
 * `acceptProposal` is the one function that writes the binding rules file, and only for an id the owner names.
 *
 *   - A probe is proposed when its count is 0 over at least one scanned file AND the walk read at least one
 *     UI source file (a lone tokens file is not a codebase), and the id is not already promoted (present in
 *     `_adherence.rules.json`, or named by a binding `## Never` bullet).
 *   - A machine rule is written only where an implemented rule kind can express the ban (`token-ban` today);
 *     the other probes get the bullet and wait for their rule kind.
 *   - The proposed file holds the rules the harvester manages (`NS-nn`) plus anything the owner added; a
 *     re-run replaces the managed ones and keeps the rest.
 *   - Writes go through a temp file and a rename; nothing is written when the text did not change.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parseAdherenceRules } from "./adherence-rules.js";
import type { LoadedRule } from "./adherence-rules.js";
import { DSError } from "./design-system.js";
import { applyProposedNeverBlock, bindingNeverIds, SOUL_FILENAME, writeSoulScaffold } from "./ds-soul.js";
import { harvestNegativeSpace } from "./negative-space-harvester.js";
import type { HarvestReport } from "./negative-space-harvester.js";
import { NEGATIVE_SPACE_PROBES, probeById } from "./negative-space-probes.js";

export type ProposalStatus = "propose" | "skip-nonzero" | "skip-no-files" | "skip-promoted";
export interface ProposedRule {
  id: string; kind: "token-ban"; severity: "error"; message: string; source: string; tokens: string[]; excludeElements?: string[];
}
export interface Proposal { id: string; status: ProposalStatus; note: string; bullet?: string; rule?: ProposedRule }
export interface PromotedState { bindingRuleIds: ReadonlySet<string>; boundNeverIds: ReadonlySet<string> }
export interface ProposalWrite { path: string; changed: boolean }
export interface AcceptIO { write: (path: string, text: string) => void }

const rulesDir = (designDir: string): string => join(designDir, "rules");
export const bindingRulesPath = (designDir: string): string => join(rulesDir(designDir), "_adherence.rules.json");
export const proposedRulesPath = (designDir: string): string => join(rulesDir(designDir), "_adherence.proposed.json");

/** Write through a temp file and a rename so a reader never sees half a file. */
export function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  try { writeFileSync(tmp, text, "utf8"); renameSync(tmp, path); }
  catch (e) { rmSync(tmp, { force: true }); throw e; }
}
const readIfPresent = (path: string): string | undefined => {
  if (!existsSync(path)) return undefined;
  try { return readFileSync(path, "utf8"); }
  catch (e) { throw new DSError("READ_ERROR", `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`); }
};
const loadFile = (path: string, origin: "binding" | "proposed"): LoadedRule[] => {
  const text = readIfPresent(path);
  return text === undefined ? [] : parseAdherenceRules(text, path, origin);
};
const dump = (rules: readonly unknown[]): string => `${JSON.stringify({ rules }, null, 2)}\n`;

export function readPromotedState(designDir: string): PromotedState {
  const soul = readIfPresent(join(designDir, SOUL_FILENAME));
  return {
    bindingRuleIds: new Set(loadFile(bindingRulesPath(designDir), "binding").map((r) => r.rule.id)),
    boundNeverIds: new Set(soul === undefined ? [] : bindingNeverIds(soul)),
  };
}

export function planProposals(report: HarvestReport, promoted: PromotedState, label: string): Proposal[] {
  return report.probes.map((p): Proposal => {
    if (promoted.bindingRuleIds.has(p.id) || promoted.boundNeverIds.has(p.id)) return { id: p.id, status: "skip-promoted", note: "already promoted by the owner" };
    if (p.count > 0) return { id: p.id, status: "skip-nonzero", note: `found ${p.count} in ${p.scannedFiles} scanned file(s)` };
    if (p.scannedFiles === 0 || report.walk.uiFiles === 0) return { id: p.id, status: "skip-no-files", note: report.walk.uiFiles === 0 ? "no UI source file was read" : "no file was scanned for this probe" };
    const excludedTotal = p.excluded.length + p.excludedOmitted;
    const reasons = [...new Set(p.excluded.map((e) => e.reason))].join("; ");
    const evidence = `0 of ${p.scannedFiles} scanned files under ${label}`;
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

/** Write the proposals. Throws before writing anything if an existing rules file is invalid. */
export function writeProposals(designDir: string, report: HarvestReport, label: string): { plan: Proposal[]; soul: ProposalWrite; proposedRules: ProposalWrite } {
  const promoted = readPromotedState(designDir);
  const existing = loadFile(proposedRulesPath(designDir), "proposed");
  const plan = planProposals(report, promoted, label);
  const bullets = plan.flatMap((x) => (x.bullet !== undefined ? [x.bullet] : []));

  const managed = new Set(NEGATIVE_SPACE_PROBES.map((p) => p.id));
  const kept = existing.filter((r) => !managed.has(r.rule.id)).map((r) => r.rule);
  const rules = [...kept, ...plan.flatMap((x) => (x.rule !== undefined ? [x.rule] : []))];
  const rulesText = dump(rules);
  parseAdherenceRules(rulesText, proposedRulesPath(designDir), "proposed"); // the emitter's own output must load

  const soulPath = join(designDir, SOUL_FILENAME);
  let soulText = readIfPresent(soulPath);
  const soulAbsent = soulText === undefined;
  if (soulAbsent && bullets.length > 0) {
    writeSoulScaffold(designDir);
    soulText = readIfPresent(soulPath);
  }
  const soulNext = soulText === undefined ? undefined : applyProposedNeverBlock(soulText, bullets);
  const soulChanged = soulNext !== undefined && soulNext !== soulText;
  if (soulChanged) atomicWrite(soulPath, soulNext);

  const priorRules = readIfPresent(proposedRulesPath(designDir));
  const rulesChanged = priorRules === undefined ? rules.length > 0 : priorRules !== rulesText;
  if (rulesChanged) atomicWrite(proposedRulesPath(designDir), rulesText);
  return { plan, soul: { path: soulPath, changed: soulChanged || (soulAbsent && bullets.length > 0) }, proposedRules: { path: proposedRulesPath(designDir), changed: rulesChanged } };
}

const ID_RE = /^NS-(?:0[1-9]|1[0-2])$/;
export const defaultAcceptIO: AcceptIO = { write: atomicWrite };

/**
 * Promote one proposed machine rule: validate both files with the loader, append to the binding file,
 * then remove from the proposed file. Binding first: a crash between the two leaves the rule in both
 * files (recoverable, nothing lost), never in neither. A failure on the second write restores the first.
 * soul.md is not touched: the owner moves the bullet.
 */
export function acceptProposal(designDir: string, id: string, io: AcceptIO = defaultAcceptIO): { id: string; rulesPath: string; proposedPath: string } {
  const bad = (msg: string): DSError => new DSError("BAD_ARG", msg);
  const def = ID_RE.test(id) ? probeById(id) : undefined;
  if (def === undefined) throw bad(`unknown probe id '${id}'. Probe ids run NS-01 to NS-12 ('ui ds harvest-bans --source <dir>' lists them).`);
  if (def.rule === undefined) {
    throw bad(`${id} is a bullet-only proposal: its machine rule comes with its rule kind in a later phase. To promote it now, move the bullet into '## Never' by hand.`);
  }
  const rulesPath = bindingRulesPath(designDir);
  const proposedPath = proposedRulesPath(designDir);
  const rulesText = readIfPresent(rulesPath);
  const proposedText = readIfPresent(proposedPath);
  if (rulesText !== undefined) parseAdherenceRules(rulesText, rulesPath, "binding");
  if (proposedText !== undefined) parseAdherenceRules(proposedText, proposedPath, "proposed");
  const rawRules = (text: string | undefined): Record<string, unknown>[] => (text === undefined ? [] : (JSON.parse(text.replace(/^\uFEFF/, "")) as { rules: Record<string, unknown>[] }).rules);
  const proposed = rawRules(proposedText);
  const rule = proposed.find((r) => r["id"] === id);
  if (rule === undefined) throw bad(`${id} is not in ${proposedPath}. Run 'ui ds harvest-bans --source <dir> --write' first, or the probe found the cliche.`);

  const nextRules = dump([...rawRules(rulesText), rule]);
  parseAdherenceRules(nextRules, rulesPath, "binding"); // a duplicate id or an invalid merge stops here, before any write
  const nextProposed = dump(proposed.filter((r) => r !== rule));

  io.write(rulesPath, nextRules);
  try { io.write(proposedPath, nextProposed); }
  catch (e) {
    try { if (rulesText === undefined) rmSync(rulesPath, { force: true }); else io.write(rulesPath, rulesText); }
    catch (restoreError) {
      throw new DSError("WRITE_ERROR", `accepting ${id} failed (${e instanceof Error ? e.message : String(e)}) and ${rulesPath} could not be restored (${restoreError instanceof Error ? restoreError.message : String(restoreError)}); remove ${id} from it by hand`);
    }
    throw e;
  }
  return { id, rulesPath, proposedPath };
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
