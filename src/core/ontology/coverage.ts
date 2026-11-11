/**
 * The kind coverage table (`nodes`, `linked`, `orphan`, `standalone`, `source missing`), computed from an ontology alone
 * so the build summary, the lint and a test read the same numbers. "0 component nodes" is visible, never silently
 * absent, and `not-sensed`, `unresolved` and empty are counted separately.
 */
import { NODE_KINDS, STRUCTURAL_KINDS } from "./ontology-types.js";
import type { NodeKind, OntNode, Ontology } from "./ontology-types.js";

export interface CoverageRow {
  kind: NodeKind;
  nodes: number;
  linked: number;
  orphan: number;
  standalone: number;
  /** "no" when the source was read; otherwise "missing" or "not-sensed", the two being different facts. */
  sourceMissing: "no" | "missing" | "not-sensed";
}

/** A node with no incoming and no outgoing link that no owner ruling marked standalone. Kernel structure is never one. */
export function orphanNodes(o: Pick<Ontology, "nodes" | "links">): OntNode[] {
  const touched = new Set(o.links.flatMap((l) => [l.from, l.to]));
  return o.nodes.filter((n) => !touched.has(n.id) && n.standalone !== true && !STRUCTURAL_KINDS.includes(n.kind));
}

/** The words after an orphan count that had references counted as lost, or "" when none: shared by the build text and the lint. */
export function orphanReason(u: Ontology["uncovered"][number]): string {
  return u.withCountedReference === undefined ? "" : `${u.withCountedReference} of them name a target that was not found or not understood: see the ${u.kind} source line`;
}

export function coverageTable(o: Ontology): CoverageRow[] {
  const orphans = new Set(orphanNodes(o).map((n) => n.id));
  const touched = new Set(o.links.flatMap((l) => [l.from, l.to]));
  return NODE_KINDS.map((kind) => {
    const mine = o.nodes.filter((n) => n.kind === kind);
    const status = o.sources.find((s) => s.kind === kind)?.status ?? "missing";
    return {
      kind, nodes: mine.length,
      linked: mine.filter((n) => touched.has(n.id)).length,
      orphan: mine.filter((n) => orphans.has(n.id)).length,
      standalone: mine.filter((n) => n.standalone === true).length,
      sourceMissing: status === "read" ? "no" : status,
    };
  });
}
