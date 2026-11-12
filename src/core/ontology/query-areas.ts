/**
 * The areas of an ontology file: every distinct `area` key with the number of nodes that carry it, sorted by key. Read
 * from the nodes alone, so the build summary, the query and the agents' area block name the same areas.
 */
import { byText } from "./ontology-types.js";
import type { Ontology } from "./ontology-types.js";
import { score, wordsOf } from "./query-text.js";

export type AreaChoice = { key: string } | { problem: "ambiguous" | "unknown"; keys: string[] };

const afterPrefix = (key: string): string => key.slice(key.indexOf(":") + 1);

/**
 * `--area` is exact: the full key, or the name after its prefix. A name two keys share is ambiguous (the full keys are
 * listed); a name no key carries is unknown (the three nearest keys by the query's own word measure are listed). No
 * trimming, no case folding, no fuzzy match.
 */
export function resolveArea(areas: readonly AreaRow[], name: string): AreaChoice {
  if (areas.some((a) => a.key === name)) return { key: name };
  const named = areas.filter((a) => afterPrefix(a.key) === name).map((a) => a.key);
  if (named.length === 1) return { key: named[0] as string };
  if (named.length > 1) return { problem: "ambiguous", keys: named };
  const query = new Set(wordsOf(name));
  const nearest = areas.map((a) => ({ key: a.key, near: score(query, new Set(wordsOf(a.key))) })).sort((a, b) => b.near - a.near || byText(a.key, b.key));
  return { problem: "unknown", keys: nearest.slice(0, 3).map((a) => a.key) };
}

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
