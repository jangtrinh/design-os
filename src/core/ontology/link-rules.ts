/**
 * The links of FR-023, each only from its exact source. A link is exact or it is asked: a reference that matches nothing
 * is counted under `unresolved` (never matched to the nearest name), a link whose source field was never sensed is
 * counted under `notSensed` with the command that would sense it, and `defines` is never written here (it comes from an
 * owner ruling, see `inferred-candidates.ts`).
 *
 * Ring 1: uses-component (link-uses-component.ts), consumes-token, constrains, checked-by.
 * Ring 2: belongs-to, governs (a ruling's scope, a backticked mention), superseded-by.
 */
import { gateFamilyFor } from "./gate-table.js";
import type { RuleOrigin } from "./gate-table.js";
import { scanEntries, usesComponentLinks } from "./link-uses-component.js";
import { ringTwoLinks } from "./link-ring2.js";
import type { Repeats } from "./link-ring2.js";
import { nodeId } from "./node-ids.js";
import type { NodeSources } from "./node-sources.js";
import { SCAN_REL } from "./source-screens-figma.js";
import type { LinkReport, OntLink } from "./ontology-types.js";
import { byText } from "./ontology-types.js";

const report = (link: LinkReport["link"]): LinkReport => ({ link, written: 0, unresolved: 0, notSensed: 0, details: [] });
const RESCAN = `figma-agent scan-design-system --out ${SCAN_REL}`;

/** Why the Figma scan cannot say what a component binds; undefined when it can (or when no Figma door is in play). */
function bindingGap(s: NodeSources): string | undefined {
  if (s.scan === null) return `no Figma scan at ${SCAN_REL}, so bound variables were never sensed: ${RESCAN}`;
  if (s.scan.sensing?.status === "skipped") return `the host skipped sensing${s.scan.sensing.reason === undefined ? "" : ` (${s.scan.sensing.reason})`}: re-scan with ${RESCAN}`;
  return undefined;
}

function consumesToken(s: NodeSources): { links: OntLink[]; report: LinkReport } {
  const out: OntLink[] = [];
  const r = report("consumes-token");
  const gap = bindingGap(s);
  const lost = new Set<string>();
  const entries = scanEntries(s.scan?.components ?? [], s.stores.records, s.keptDeprecated);
  for (const rec of s.stores.records) {
    for (const path of rec.tokensUsed) {
      if (s.stores.tokenPaths.has(path)) out.push({ kind: "consumes-token", from: nodeId("component", rec.name), to: nodeId("token", path) });
      else { r.unresolved++; lost.add(`${rec.name} names ${path}`); }
    }
    const codeSensed = rec.provenance?.kind === "code" || rec.code !== undefined;
    if (rec.tokensUsed.length === 0 && !codeSensed && rec.provenance?.kind !== "synthetic-approved") {
      // A Figma-door record with no tokens: "consumes none" only when the scan says it sensed bindings for it.
      const entry = entries.get(rec.name);
      if (gap !== undefined || entry === undefined || entry.boundVariables === undefined) r.notSensed++;
    }
  }
  if (r.notSensed > 0) r.notSensedReason = gap ?? `${r.notSensed} component(s) have no bound-variable entry in the scan: re-scan with ${RESCAN}`;
  if (lost.size > 0) r.details.push(`${r.unresolved} token name(s) match no token of the store: ${[...lost].sort(byText).slice(0, 5).join("; ")}${lost.size > 5 ? "; ..." : ""}`);
  return { links: out, report: r };
}

export interface LinkResult {
  links: OntLink[];
  reports: LinkReport[];
  /** Values of rulings and principles that name a target already linked: counted by the caller in the source line. */
  repeats: Repeats;
  /** Ruling and principle nodes with a reference counted unresolved. */
  unresolvedFrom: Set<string>;
  /** Links the final de-duplication removed: a safety net that no reader should ever need (0 in every fixture). */
  deduped: number;
}

/** Every ring-1 and ring-2 link; `defines` is added by the caller from the owner's rulings. */
export function buildLinks(s: NodeSources): LinkResult {
  const reports: LinkReport[] = [];
  const links: OntLink[] = [];
  // A Figma scan never sensed for frames keeps its reason on the report whether or not the code door was read.
  const figmaDoor = s.reports.find((x) => x.kind === "screen")?.doors?.find((d) => d.door === "figma");
  const uses = usesComponentLinks(s.figma, s.code, s.stores.records, s.keptDeprecated, figmaDoor?.status === "not-sensed" ? figmaDoor.note : undefined);
  const consumes = consumesToken(s);

  const constrains = report("constrains");
  const checked = report("checked-by");
  checked.notChecked = 0;
  const ruleLinks: OntLink[] = [];
  for (const f of s.rules.facts) {
    ruleLinks.push({ kind: "constrains", from: f.id, to: "project:root" });
    const family = gateFamilyFor(f.origin as RuleOrigin, f.kind);
    if (family === undefined) checked.notChecked = (checked.notChecked ?? 0) + 1;
    else ruleLinks.push({ kind: "checked-by", from: f.id, to: nodeId("gate", family) });
  }
  if ((checked.notChecked ?? 0) > 0) checked.details.push(`${checked.notChecked} rule(s) are evaluated by no gate family: they get no checked-by link`);
  const ring2 = ringTwoLinks(s);

  links.push(...uses.links, ...consumes.links, ...ruleLinks, ...ring2.links);
  reports.push(uses.report, consumes.report, constrains, checked, ...ring2.reports);
  const seen = new Set<string>();
  const unique = links.filter((l) => { const k = `${l.kind}\u0000${l.from}\u0000${l.to}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const rep of reports) rep.written = unique.filter((l) => l.kind === rep.link).length;
  return { links: unique, reports, repeats: ring2.repeats, unresolvedFrom: ring2.unresolvedFrom, deduped: links.length - unique.length };
}
