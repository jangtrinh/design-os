/**
 * The ontology from what was read: nodes, exact links, the `defines` links the owner ruled, and the `inferred-links`
 * detections for the terms named like a node. Pure over `NodeSources` and the stored rulings: no file, no clock.
 */
import { governedOutcomes, indexRulings, resolveDetections } from "../owner-rulings/resolve-detections.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { inferredLinksEmitter, parsePair } from "../owner-rulings/kind-inferred-links.js";
import type { InferredTerm } from "../owner-rulings/kind-inferred-links.js";
import type { KindDetection } from "../owner-rulings/kind-emitter.js";
import { BUILD_LABEL } from "./blocking-clusters.js";
import { orphanNodes } from "./coverage.js";
import { appliedDefines, termCandidates } from "./inferred-candidates.js";
import { buildLinks } from "./link-rules.js";
import { nodeId } from "./node-ids.js";
import { withRepeats } from "./repeated-values.js";
import type { NodeSources } from "./node-sources.js";
import { ONTOLOGY_SCHEMA, byText } from "./ontology-types.js";
import type { LinkReport, NodeKind, Ontology } from "./ontology-types.js";

export interface Built { ontology: Ontology; detections: KindDetection[]; terms: InferredTerm[] }

export function buildOntology(s: NodeSources, rulings: readonly Ruling[]): Built {
  const terms = termCandidates(s.nodes);
  const detections = inferredLinksEmitter.detectAll?.({ terms }) ?? [];
  const applied = appliedDefines(terms, governedOutcomes(indexRulings(rulings), "inferred-links"));
  const result = buildLinks(s);
  const links = [...result.links, ...applied.links];
  const touched = new Set(links.flatMap((l) => [l.from, l.to]));
  const nodes = s.nodes.map((n) => (applied.standalone.has(n.id) || (applied.standaloneNodes.has(n.id) && !touched.has(n.id)) ? { ...n, standalone: true as const } : n));
  const openPairs = resolveDetections(detections, rulings, BUILD_LABEL).open.flatMap((c) => c.members);
  const details = [
    ...(openPairs.length > 0 ? [`${openPairs.length} candidate pair(s) await an owner ruling (ui onboard questions)`] : []),
    ...(applied.stale.length > 0 ? [`${applied.stale.length} owner-ruled pair(s) no longer match a candidate: ${applied.stale.slice(0, 5).join("; ")}${applied.stale.length > 5 ? "; ..." : ""}`] : []),
  ];
  const defines: LinkReport = { link: "defines", written: applied.links.length, unresolved: applied.stale.length, notSensed: 0, details };
  const linkReports = [...result.reports, defines].sort((a, b) => byText(a.link, b.link));

  const ontology: Ontology = {
    schema: ONTOLOGY_SCHEMA, nodes, links, sources: withRepeats(s.reports, result.repeats), linkReports,
    proposals: s.rules.proposals, uncovered: [],
  };
  // An orphan is covered only while an open question reaches it: the term or the node of a pair still awaiting a ruling.
  const asked = new Set(openPairs.flatMap((m) => { const pair = parsePair(m); return pair === null ? [] : [pair.term, pair.node]; }));
  // A node with a reference counted unresolved (the link layer) or not understood (the reader) is the one the source line counts: the same facts, per node.
  const counted = new Set([...result.unresolvedFrom, ...s.ring2.rulings.filter((r) => r.notUnderstood > 0).map((r) => nodeId("ruling", r.id)), ...s.ring2.principles.filter((p) => p.notUnderstood > 0).map((p) => nodeId("principle", p.id))]);
  const per = new Map<NodeKind, { count: number; withCountedReference: number }>();
  for (const n of orphanNodes(ontology)) {
    if (asked.has(n.id)) continue;
    const row = per.get(n.kind) ?? { count: 0, withCountedReference: 0 };
    row.count++;
    if (counted.has(n.id)) row.withCountedReference++;
    per.set(n.kind, row);
  }
  ontology.uncovered = [...per].map(([kind, row]) => ({ kind, count: row.count, ...(row.withCountedReference > 0 ? { withCountedReference: row.withCountedReference } : {}) })).sort((a, b) => byText(a.kind, b.kind));
  return { ontology, detections, terms };
}
