/**
 * The one serialiser of the ontology file: sorted nodes, sorted links, every object's keys in a fixed order, 2-space
 * JSON and a final newline. No timestamp, no absolute path: the same tree gives the same bytes from any checkout.
 */
import { byText } from "./ontology-types.js";
import type { Ontology } from "./ontology-types.js";

/** Object keys sorted, recursively; arrays keep their order (the callers sort what is a set). */
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort((a, b) => byText(a[0], b[0])).map(([k, v]) => [k, sortDeep(v)]));
  }
  return value;
}

const HEAD = ["id", "kind", "name"] as const;

export function serializeOntology(o: Ontology): string {
  const nodes = [...o.nodes].sort((a, b) => byText(a.id, b.id)).map((n) => {
    const rest = Object.fromEntries(Object.entries(n).filter(([k]) => !(HEAD as readonly string[]).includes(k)).sort((a, b) => byText(a[0], b[0])).map(([k, v]) => [k, sortDeep(v)]));
    return { id: n.id, kind: n.kind, name: n.name, ...rest };
  });
  const links = [...o.links].sort((a, b) => byText(a.kind, b.kind) || byText(a.from, b.from) || byText(a.to, b.to)).map((l) => ({ kind: l.kind, from: l.from, to: l.to }));
  const doc = { schema: o.schema, nodes, links, sources: o.sources, linkReports: o.linkReports, proposals: o.proposals, uncovered: o.uncovered };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
