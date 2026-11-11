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

/** A value that names a target a second time: one link is written, the extra value is counted under its own reason. */
export interface Repeats { rulingScope: number; rulingSuperseded: number; rulingMention: number; principleMention: number }

export interface RingTwoResult {
  links: OntLink[];
  reports: LinkReport[];
  repeats: Repeats;
  /** The ruling and principle nodes that have at least one reference counted unresolved. */
  unresolvedFrom: Set<string>;
}

export function ringTwoLinks(s: NodeSources): RingTwoResult {
  const ids = new Set(s.nodes.map((n) => n.id));
  const belongsTo = belongsToLinks(s);
  const governs = fresh("governs");
  const superseded = fresh("superseded-by");
  const links: OntLink[] = [];
  const unresolvedFrom = new Set<string>();
  const repeats: Repeats = { rulingScope: 0, rulingSuperseded: 0, rulingMention: 0, principleMention: 0 };
  const written = new Set<string>();
  const lost = (r: LinkReport, what: string, list: Set<string>, from: string): void => { r.unresolved++; list.add(what); unresolvedFrom.add(from); };
  const governsLost = new Set<string>();
  const supersededLost = new Set<string>();
  /** Writes a link once; a value that names the same target again is counted, never dropped silently. */
  const put = (kind: OntLink["kind"], from: string, to: string, again: keyof Repeats): void => {
    const key = `${kind}\u0000${from}\u0000${to}`;
    if (written.has(key)) { repeats[again]++; return; }
    written.add(key);
    links.push({ kind, from, to });
  };
  const add = (kind: OntLink["kind"], from: string, to: string, r: LinkReport, what: string, list: Set<string>, again: keyof Repeats): void => {
    if (ids.has(to)) put(kind, from, to, again); else lost(r, what, list, from);
  };

  const screenIds = new Set(s.nodes.filter((n) => n.kind === "screen").map((n) => n.id));
  const ties = s.ring2.meta === null ? new Map<string, string>() : tieEntries(s.ring2.meta, s.nodes).tied;
  for (const r of s.ring2.rulings) {
    const from = nodeId("ruling", r.id);
    if (r.scope === "global") put("governs", from, "project:root", "rulingScope");
    else if (r.scope !== null) {
      for (const a of r.scope.apps) add("governs", from, nodeId("app", a), governs, `ruling ${r.id} names app ${a}`, governsLost, "rulingScope");
      for (const sc of r.scope.screens) {
        const hit = screenIds.has(sc) ? sc : ties.get(sc);
        if (hit === undefined) lost(governs, `ruling ${r.id} names screen ${sc}, which is no screen node and no screens-meta entry tied to one`, governsLost, from);
        else put("governs", from, hit, "rulingScope");
      }
      for (const f of r.scope.features) {
        const hit = featureIn(s.ring2.meta?.features ?? [], r.scope.apps, f);
        if (hit === undefined) lost(governs, `ruling ${r.id} names feature ${f}, which no single app of its scope has`, governsLost, from);
        else put("governs", from, hit, "rulingScope");
      }
    }
    if (r.supersededBy !== undefined) add("superseded-by", from, nodeId("ruling", r.supersededBy), superseded, `ruling ${r.id} names ${r.supersededBy}`, supersededLost, "rulingSuperseded");
  }
  const mentions: { from: string; text: string; again: keyof Repeats }[] = [
    ...s.ring2.rulings.map((r) => ({ from: nodeId("ruling", r.id), text: r.text, again: "rulingMention" as const })),
    ...s.ring2.principles.map((p) => ({ from: nodeId("principle", p.id), text: p.text, again: "principleMention" as const })),
  ];
  for (const m of mentions) for (const hit of m.text.matchAll(MENTION)) add("governs", m.from, `${hit[1]}:${hit[2] ?? ""}`, governs, `${m.from} mentions ${hit[1]}:${hit[2]}`, governsLost, m.again);

  for (const [r, list, label] of [[governs, governsLost, "scope or mention reference(s)"], [superseded, supersededLost, "superseded_by reference(s)"]] as const) {
    if (list.size > 0) r.details.push(`${r.unresolved} ${label} match no node: ${[...list].sort(byText).slice(0, 5).join("; ")}${list.size > 5 ? "; ..." : ""}`);
  }
  return { links: [...belongsTo.links, ...links], reports: [belongsTo.report, governs, superseded], repeats, unresolvedFrom };
}
