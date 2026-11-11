/**
 * Ring-2 links, each from its own exact field: `belongs-to` (screen -> feature -> app -> project, from
 * `screens.meta.json`), `governs` (a ruling's `scope`: "global" is the project, `{ apps, features }` are those nodes; a
 * backticked mention `component:<name>`, `token:<path>` or `pattern:<name>` in a ruling or principle), and
 * `superseded-by` (a ruling's `superseded_by`). A name that matches no node is counted unresolved, never matched to a
 * near one. A ruling that names no target gets no link and stays an orphan.
 */
import type { NodeSources } from "./node-sources.js";
import { nodeId } from "./node-ids.js";
import type { LinkReport, OntLink } from "./ontology-types.js";
import { byText } from "./ontology-types.js";

const MENTION = /`(component|token|pattern):([^`\n]+)`/g;

const fresh = (link: LinkReport["link"]): LinkReport => ({ link, written: 0, unresolved: 0, notSensed: 0, details: [] });

export function ringTwoLinks(s: NodeSources): { links: OntLink[]; reports: LinkReport[] } {
  const ids = new Set(s.nodes.map((n) => n.id));
  const belongs = fresh("belongs-to");
  const governs = fresh("governs");
  const superseded = fresh("superseded-by");
  const links: OntLink[] = [];
  const lost = (r: LinkReport, what: string, list: Set<string>): void => { r.unresolved++; list.add(what); };
  const belongsLost = new Set<string>();
  const governsLost = new Set<string>();
  const supersededLost = new Set<string>();
  const add = (kind: OntLink["kind"], from: string, to: string, r: LinkReport, what: string, list: Set<string>): void => {
    if (ids.has(to)) links.push({ kind, from, to }); else lost(r, what, list);
  };

  const meta = s.ring2.meta;
  if (meta !== null) {
    for (const f of meta.features) if (f.app !== undefined) add("belongs-to", nodeId("feature", f.id), nodeId("app", f.app), belongs, `feature ${f.id} names app ${f.app}`, belongsLost);
    for (const n of s.nodes.filter((x) => x.kind === "app")) links.push({ kind: "belongs-to", from: n.id, to: "project:root" });
    for (const sc of meta.screens) {
      if (!ids.has(sc.screen)) { lost(belongs, `${sc.screen} is no screen`, belongsLost); continue; }
      if (sc.feature !== undefined) add("belongs-to", sc.screen, nodeId("feature", sc.feature), belongs, `screen ${sc.screen} names feature ${sc.feature}`, belongsLost);
      else if (sc.app !== undefined) add("belongs-to", sc.screen, nodeId("app", sc.app), belongs, `screen ${sc.screen} names app ${sc.app}`, belongsLost);
    }
  }

  for (const r of s.ring2.rulings) {
    const from = nodeId("ruling", r.id);
    if (r.scope === "global") links.push({ kind: "governs", from, to: "project:root" });
    else if (r.scope !== null) {
      for (const a of r.scope.apps) add("governs", from, nodeId("app", a), governs, `ruling ${r.id} names app ${a}`, governsLost);
      for (const f of r.scope.features) add("governs", from, nodeId("feature", f), governs, `ruling ${r.id} names feature ${f}`, governsLost);
    }
    if (r.supersededBy !== undefined) add("superseded-by", from, nodeId("ruling", r.supersededBy), superseded, `ruling ${r.id} names ${r.supersededBy}`, supersededLost);
  }
  const mentions: { from: string; text: string }[] = [
    ...s.ring2.rulings.map((r) => ({ from: nodeId("ruling", r.id), text: r.text })),
    ...s.ring2.principles.map((p) => ({ from: nodeId("principle", p.id), text: p.text })),
  ];
  for (const m of mentions) for (const hit of m.text.matchAll(MENTION)) add("governs", m.from, `${hit[1]}:${(hit[2] ?? "").trim()}`, governs, `${m.from} mentions ${hit[1]}:${hit[2]}`, governsLost);

  for (const [r, list, label] of [[belongs, belongsLost, "reference(s) in screens.meta.json"], [governs, governsLost, "scope or mention reference(s)"], [superseded, supersededLost, "superseded_by reference(s)"]] as const) {
    if (list.size > 0) r.details.push(`${r.unresolved} ${label} match no node: ${[...list].sort(byText).slice(0, 5).join("; ")}${list.size > 5 ? "; ..." : ""}`);
  }
  return { links, reports: [belongs, governs, superseded] };
}
