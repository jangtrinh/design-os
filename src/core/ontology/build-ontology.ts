/**
 * The ontology from what was read: nodes, exact links, the `defines` links the owner ruled, and the `inferred-links`
 * detections for the terms named like a node. Pure over `NodeSources` and the stored rulings: no file, no clock.
 */
import { governedOutcomes, indexRulings } from "../owner-rulings/resolve-detections.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { inferredLinksEmitter } from "../owner-rulings/kind-inferred-links.js";
import type { InferredTerm } from "../owner-rulings/kind-inferred-links.js";
import type { KindDetection } from "../owner-rulings/kind-emitter.js";
import { orphanNodes } from "./coverage.js";
import { appliedDefines, termCandidates } from "./inferred-candidates.js";
import { buildLinks } from "./link-rules.js";
import type { NodeSources } from "./node-sources.js";
import { ONTOLOGY_SCHEMA, byText } from "./ontology-types.js";
import type { LinkReport, NodeKind, Ontology } from "./ontology-types.js";

export interface Built { ontology: Ontology; detections: KindDetection[]; terms: InferredTerm[] }

export function buildOntology(s: NodeSources, rulings: readonly Ruling[]): Built {
  const terms = termCandidates(s.nodes);
  const detections = inferredLinksEmitter.detectAll?.({ terms }) ?? [];
  const { links: defined, standalone } = appliedDefines(terms, governedOutcomes(indexRulings(rulings), "inferred-links"));
  const result = buildLinks(s);
  const nodes = s.nodes.map((n) => (standalone.has(n.id) ? { ...n, standalone: true as const } : n));
  const links = [...result.links, ...defined];
  const open = detections.reduce((n, d) => n + d.members.length, 0);
  const defines: LinkReport = { link: "defines", written: defined.length, unresolved: 0, notSensed: 0, details: open > 0 ? [`${open} candidate pair(s) await an owner ruling (ui onboard questions)`] : [] };
  const linkReports = [...result.reports, defines].sort((a, b) => byText(a.link, b.link));

  const ontology: Ontology = {
    schema: ONTOLOGY_SCHEMA, nodes, links, sources: s.reports, linkReports,
    proposals: s.rules.proposals, uncovered: [],
  };
  // An orphan is covered when a question can reach it: it is a term with candidates, or a candidate of some term.
  const asked = new Set(terms.filter((t) => t.candidates.length > 0).flatMap((t) => [t.id, ...t.candidates.map((c) => c.id)]));
  const per = new Map<NodeKind, number>();
  for (const n of orphanNodes(ontology)) if (!asked.has(n.id)) per.set(n.kind, (per.get(n.kind) ?? 0) + 1);
  ontology.uncovered = [...per].map(([kind, count]) => ({ kind, count })).sort((a, b) => byText(a.kind, b.kind));
  return { ontology, detections, terms };
}
