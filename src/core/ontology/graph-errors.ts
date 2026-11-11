/**
 * The two error checks of the lint that need only the graph: a node id that appears more than once, a link whose
 * target does not exist. The build runs them on what it is about to write, so it never writes a graph the lint refuses.
 */
import { byText } from "./ontology-types.js";
import type { OntLink, OntNode } from "./ontology-types.js";

export const DANGLING_CODE = "ONTOLOGY_DANGLING_LINK";
export const DUPLICATE_CODE = "ONTOLOGY_DUPLICATE_ID";

export interface GraphError { code: string; message: string; ids: string[]; count: number }

export const sample = (list: readonly string[], n = 3): string => `${list.slice(0, n).join(", ")}${list.length > n ? ", ..." : ""}`;

export function duplicateIds(nodes: readonly OntNode[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const n of nodes) { if (seen.has(n.id)) dup.add(n.id); seen.add(n.id); }
  return [...dup].sort(byText);
}

export function danglingLinks(nodes: readonly OntNode[], links: readonly OntLink[]): OntLink[] {
  const ids = new Set(nodes.map((n) => n.id));
  return links.filter((l) => !ids.has(l.from) || !ids.has(l.to));
}

export function graphErrors(nodes: readonly OntNode[], links: readonly OntLink[]): GraphError[] {
  const out: GraphError[] = [];
  const dup = duplicateIds(nodes);
  if (dup.length > 0) out.push({ code: DUPLICATE_CODE, ids: dup, count: dup.length, message: `${dup.length} node id(s) appear more than once: ${sample(dup)}` });
  const lost = danglingLinks(nodes, links);
  if (lost.length > 0) {
    const named = lost.map((l) => `${l.kind} ${l.from} -> ${l.to}`);
    out.push({ code: DANGLING_CODE, ids: named, count: lost.length, message: `${lost.length} link(s) point at a node that does not exist: ${sample(named)}` });
  }
  return out;
}
