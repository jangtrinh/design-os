/**
 * `ui ontology query`, pure over an ontology: deterministic lexical retrieval (distinct query words in a node's name and
 * aliases, ties by node id), a 2-hop expansion over the links in both directions, then the budgeted pack. A project-wide
 * rule (one that constrains the project itself) reaches every match. A ruling with an outgoing `superseded-by` is never
 * a candidate. Under `--area`, a node outside the area is reached only as a token or a rule of an in-area node.
 */
import type { OntNode, Ontology } from "./ontology-types.js";
import { byText } from "./ontology-types.js";
import { buildPack, entryOf, GROUP_OF_KIND } from "./query-pack.js";
import type { Pack, PackEntry, ScoredNode } from "./query-pack.js";
import { nodeWords, prefixNearness, score, wordsOf } from "./query-text.js";

export interface QueryOutcome {
  query: string;
  area: string | null;
  budget: number;
  matchCount: number;
  matches: Omit<PackEntry, "line">[];
  /** The three nearest titles, present only when nothing matched. */
  nearest: { id: string; name: string }[];
  pack: Pack | null;
}

const HOPS = 2;
const PROJECT = "project:root";
const bySc = (a: ScoredNode, b: ScoredNode): number => b.score - a.score || byText(a.node.id, b.node.id);

function candidates(o: Ontology, area: string | null): OntNode[] {
  const superseded = new Set(o.links.filter((l) => l.kind === "superseded-by").map((l) => l.from));
  return o.nodes.filter((n) => !superseded.has(n.id) && (area === null || n["area"] === area));
}

/** Nodes reached within two hops of the matches, both directions; out-of-area nodes only as a token or a rule, and not expanded. */
function expand(o: Ontology, matches: readonly OntNode[], pool: ReadonlyMap<string, OntNode>, area: string | null): Set<string> {
  const near = new Map<string, string[]>();
  for (const l of o.links) { near.set(l.from, [...(near.get(l.from) ?? []), l.to]); near.set(l.to, [...(near.get(l.to) ?? []), l.from]); }
  const byId = new Map(o.nodes.map((n) => [n.id, n]));
  const superseded = new Set(o.links.filter((l) => l.kind === "superseded-by").map((l) => l.from));
  const reached = new Set(matches.map((m) => m.id));
  let frontier = [...reached];
  for (let hop = 0; hop < HOPS; hop++) {
    const next: string[] = [];
    for (const id of frontier) for (const to of near.get(id) ?? []) {
      const n = byId.get(to);
      if (n === undefined || reached.has(to) || superseded.has(to)) continue;
      const inside = pool.has(to);
      if (!inside && !(area !== null && (n.kind === "token" || n.kind === "rule"))) continue;
      reached.add(to);
      if (inside) next.push(to);
    }
    frontier = next;
  }
  // A rule that constrains the whole project applies to whatever matched.
  for (const l of o.links) if (l.kind === "constrains" && l.to === PROJECT && byId.get(l.from)?.kind === "rule") reached.add(l.from);
  return reached;
}

/** Screens that share a feature with a matched screen; for a matched screen with none, screens that share a component. */
function siblingScreens(o: Ontology, matched: readonly OntNode[]): string[] {
  const kindOf = new Map(o.nodes.map((n) => [n.id, n.kind]));
  const targets = (from: string, link: string, kind: string): string[] => o.links.filter((l) => l.kind === link && l.from === from && kindOf.get(l.to) === kind).map((l) => l.to);
  const screens = o.nodes.filter((n) => n.kind === "screen").map((n) => n.id);
  const isMatch = new Set(matched.map((m) => m.id));
  const out = new Set<string>();
  for (const m of matched.filter((n) => n.kind === "screen")) {
    const features = new Set(targets(m.id, "belongs-to", "feature"));
    const byFeature = screens.filter((s) => s !== m.id && targets(s, "belongs-to", "feature").some((f) => features.has(f)));
    const components = new Set(targets(m.id, "uses-component", "component"));
    const found = byFeature.length > 0 ? byFeature : screens.filter((s) => s !== m.id && targets(s, "uses-component", "component").some((c) => components.has(c)));
    for (const s of found) if (!isMatch.has(s)) out.add(s);
  }
  return [...out].sort(byText);
}

/** The three titles nearest to a text that matched nothing: shared word prefix first, then node id. */
function nearestTitles(pool: readonly OntNode[], words: ReadonlySet<string>): { id: string; name: string }[] {
  return pool.filter((n) => n.kind !== "project")
    .map((n) => ({ id: n.id, name: n.name, near: prefixNearness(words, nodeWords(n)) }))
    .sort((a, b) => b.near - a.near || byText(a.id, b.id)).slice(0, 3).map(({ id, name }) => ({ id, name }));
}

export function queryOntology(o: Ontology, text: string, area: string | null, budget: number): QueryOutcome {
  const words = new Set(wordsOf(text));
  const pool = candidates(o, area);
  const poolById = new Map(pool.map((n) => [n.id, n]));
  const scored = pool.map((node): ScoredNode => ({ node, score: score(words, nodeWords(node)) })).filter((s) => s.score > 0).sort(bySc);
  const head = { query: text, area, budget };
  if (scored.length === 0) return { ...head, matchCount: 0, matches: [], nearest: nearestTitles(pool, words), pack: null };
  const matched = scored.map((s) => s.node);
  const reachedIds = expand(o, matched, poolById, area);
  const scoreOf = new Map(scored.map((s) => [s.node.id, s.score]));
  const byId = new Map(o.nodes.map((n) => [n.id, n]));
  const reached = [...reachedIds].map((id) => ({ node: byId.get(id) as OntNode, score: scoreOf.get(id) ?? 0 })).filter((r) => GROUP_OF_KIND[r.node.kind] !== undefined);
  const siblings = area === null ? siblingScreens(o, matched).map((id) => ({ node: byId.get(id) as OntNode, score: 0 })) : [];
  return {
    ...head, matchCount: scored.length, nearest: [],
    matches: scored.map((s) => { const e = entryOf(s); return { id: e.id, name: e.name, kind: e.kind, source: e.source, score: e.score }; }),
    pack: buildPack(reached, siblings, budget),
  };
}
