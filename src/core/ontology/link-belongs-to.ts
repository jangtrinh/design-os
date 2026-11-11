/**
 * `belongs-to`: screen -> feature -> app -> project, from the fields of `screens.meta.json` and nothing else. A feature
 * belongs to the app of its key; an app belongs to the project; a screen belongs to the feature its entry names (to the
 * app when the entry names no feature) only when the entry ties to a screen node by its `figmaId` (screen-meta-ties.ts).
 * An entry that ties to no screen node is counted unresolved and never linked; it still contributed its app and feature.
 */
import type { NodeSources } from "./node-sources.js";
import { nodeId } from "./node-ids.js";
import { tieEntries } from "./screen-meta-ties.js";
import type { LinkReport, OntLink } from "./ontology-types.js";
import { byText } from "./ontology-types.js";

export function belongsToLinks(s: NodeSources): { links: OntLink[]; report: LinkReport } {
  const report: LinkReport = { link: "belongs-to", written: 0, unresolved: 0, notSensed: 0, details: [] };
  const links: OntLink[] = [];
  const meta = s.ring2.meta;
  if (meta === null) return { links, report };
  for (const f of meta.features) links.push({ kind: "belongs-to", from: f.id, to: nodeId("app", f.app) });
  for (const a of meta.apps) links.push({ kind: "belongs-to", from: nodeId("app", a), to: "project:root" });
  const ties = tieEntries(meta, s.nodes);
  for (const e of meta.entries) {
    const screen = ties.tied.get(e.id);
    if (screen === undefined || e.app === undefined) continue;
    links.push({ kind: "belongs-to", from: screen, to: e.feature === undefined ? nodeId("app", e.app) : nodeId("feature", `${e.app}/${e.feature}`) });
  }
  report.unresolved = ties.untied.length;
  const named = ties.untied.map((e) => `${e.id} ties to no screen (${e.figmaId === undefined ? "no figmaId" : ties.claimed.has(e.figmaId) ? `${ties.claimed.get(e.figmaId)} entries claim one figmaId, ${e.figmaId}` : `figmaId ${e.figmaId}`})`).sort(byText);
  if (named.length > 0) report.details.push(`${named.length} screens-meta entr${named.length === 1 ? "y" : "ies"} tie to no screen node: ${named.slice(0, 5).join("; ")}${named.length > 5 ? "; ..." : ""}`);
  return { links, report };
}
