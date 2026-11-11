/**
 * Ring-2 links, each from its own exact field: `belongs-to` (link-belongs-to.ts), `governs` (a ruling's `scope`: "global" is the project, `{ apps, features, screens }` are those nodes; a
 * backticked mention `component:<name>`, `token:<path>` or `pattern:<name>` in a ruling or principle), and
 * `superseded-by` (a ruling's `superseded_by`). A name that matches no node is counted unresolved, never matched to a
 * near one. A ruling that names no target gets no link and stays an orphan.
 */
import { belongsToLinks } from "./link-belongs-to.js";
import type { NodeSources } from "./node-sources.js";
import { tieEntries } from "./screen-meta-ties.js";
import { nodeId } from "./node-ids.js";
import type { LinkReport, OntLink } from "./ontology-types.js";
import { byText } from "./ontology-types.js";

const MENTION = /`(component|token|pattern):([^`\n]+)`/g;

/** A feature named by a scope: inside the scope's apps; with no app named, in the one app that has a feature of that name (several: unresolved). */
function featureIn(features: readonly { app: string; name: string; id: string }[], apps: readonly string[], name: string): string | undefined {
  const found = features.filter((f) => f.name === name && (apps.length === 0 || apps.includes(f.app)));
  return found.length === 1 ? found[0]?.id : undefined;
}

const fresh = (link: LinkReport["link"]): LinkReport => ({ link, written: 0, unresolved: 0, notSensed: 0, details: [] });

export function ringTwoLinks(s: NodeSources): { links: OntLink[]; reports: LinkReport[] } {
  const ids = new Set(s.nodes.map((n) => n.id));
  const belongsTo = belongsToLinks(s);
  const governs = fresh("governs");
  const superseded = fresh("superseded-by");
  const links: OntLink[] = [];
  const lost = (r: LinkReport, what: string, list: Set<string>): void => { r.unresolved++; list.add(what); };
  const governsLost = new Set<string>();
  const supersededLost = new Set<string>();
  const add = (kind: OntLink["kind"], from: string, to: string, r: LinkReport, what: string, list: Set<string>): void => {
    if (ids.has(to)) links.push({ kind, from, to }); else lost(r, what, list);
  };

  const screenIds = new Set(s.nodes.filter((n) => n.kind === "screen").map((n) => n.id));
  const ties = s.ring2.meta === null ? new Map<string, string>() : tieEntries(s.ring2.meta, s.nodes).tied;
  for (const r of s.ring2.rulings) {
    const from = nodeId("ruling", r.id);
    if (r.scope === "global") links.push({ kind: "governs", from, to: "project:root" });
    else if (r.scope !== null) {
      for (const a of r.scope.apps) add("governs", from, nodeId("app", a), governs, `ruling ${r.id} names app ${a}`, governsLost);
      for (const sc of r.scope.screens) {
        const hit = screenIds.has(sc) ? sc : ties.get(sc);
        if (hit === undefined) lost(governs, `ruling ${r.id} names screen ${sc}, which is no screen node and no screens-meta entry tied to one`, governsLost);
        else links.push({ kind: "governs", from, to: hit });
      }
      for (const f of r.scope.features) {
        const hit = featureIn(s.ring2.meta?.features ?? [], r.scope.apps, f);
        if (hit === undefined) lost(governs, `ruling ${r.id} names feature ${f}, which no single app of its scope has`, governsLost);
        else links.push({ kind: "governs", from, to: hit });
      }
    }
    if (r.supersededBy !== undefined) add("superseded-by", from, nodeId("ruling", r.supersededBy), superseded, `ruling ${r.id} names ${r.supersededBy}`, supersededLost);
  }
  const mentions: { from: string; text: string }[] = [
    ...s.ring2.rulings.map((r) => ({ from: nodeId("ruling", r.id), text: r.text })),
    ...s.ring2.principles.map((p) => ({ from: nodeId("principle", p.id), text: p.text })),
  ];
  for (const m of mentions) for (const hit of m.text.matchAll(MENTION)) add("governs", m.from, `${hit[1]}:${hit[2] ?? ""}`, governs, `${m.from} mentions ${hit[1]}:${hit[2]}`, governsLost);

  for (const [r, list, label] of [[governs, governsLost, "scope or mention reference(s)"], [superseded, supersededLost, "superseded_by reference(s)"]] as const) {
    if (list.size > 0) r.details.push(`${r.unresolved} ${label} match no node: ${[...list].sort(byText).slice(0, 5).join("; ")}${list.size > 5 ? "; ..." : ""}`);
  }
  return { links: [...belongsTo.links, ...links], reports: [belongsTo.report, governs, superseded] };
}
