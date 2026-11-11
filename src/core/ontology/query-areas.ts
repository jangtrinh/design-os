/**
 * The areas of an ontology file: every distinct `area` key with the number of nodes that carry it, sorted by key. Read
 * from the nodes alone, so the build summary, the query and the agents' area block name the same areas.
 */
import { byText } from "./ontology-types.js";
import type { Ontology } from "./ontology-types.js";

export interface AreaRow { key: string; nodes: number }

export function listAreas(o: Pick<Ontology, "nodes">): AreaRow[] {
  const count = new Map<string, number>();
  for (const n of o.nodes) if (typeof n["area"] === "string" && n["area"] !== "") count.set(n["area"], (count.get(n["area"]) ?? 0) + 1);
  return [...count].map(([key, nodes]) => ({ key, nodes })).sort((a, b) => byText(a.key, b.key));
}

/** The component source line's count of components with no area, and why; "" when every component has one. */
export function withoutAreaText(o: Pick<Ontology, "sources">): string {
  const gaps = Object.entries(o.sources.find((s) => s.kind === "component")?.withoutArea ?? {});
  if (gaps.length === 0) return "";
  const total = gaps.reduce((sum, [, n]) => sum + n, 0);
  return `${total} component(s) without an area (${gaps.map(([why, n]) => `${n} ${why}`).join("; ")})`;
}
