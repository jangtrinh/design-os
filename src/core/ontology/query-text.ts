/**
 * The one lexical measure of `ui ontology query`: lower-case word runs, no stemming, no model. A node is scored by the
 * number of distinct query words it carries in its name and aliases; the same words measure how near a title or an area
 * key is to a text that matched nothing.
 */
import type { OntNode } from "./ontology-types.js";

export const wordsOf = (text: string): string[] => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** The words a node is found by: its name, the `name` of its screens-meta entry and the `aliases` it carries. */
export function nodeWords(n: OntNode): Set<string> {
  const meta = (n["meta"] ?? {}) as Record<string, unknown>;
  const aliases = Array.isArray(meta["aliases"]) ? meta["aliases"] : [meta["aliases"]];
  const texts = [n.name, meta["name"], ...aliases].filter((t): t is string => typeof t === "string");
  return new Set(texts.flatMap(wordsOf));
}

/** The number of distinct query words present in the node's words. */
export function score(query: ReadonlySet<string>, words: ReadonlySet<string>): number {
  let n = 0;
  for (const w of query) if (words.has(w)) n++;
  return n;
}

const commonPrefix = (a: string, b: string): number => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/** How near a text that matched nothing is to a title: per query word, the longest word prefix it shares with a word of the title. */
export function prefixNearness(query: ReadonlySet<string>, words: ReadonlySet<string>): number {
  let total = 0;
  for (const q of query) { let best = 0; for (const w of words) best = Math.max(best, commonPrefix(q, w)); total += best; }
  return total;
}

/** A value as a person types it in a shell: double quotes, with the four characters a shell reads inside them escaped. */
export const shellQuote = (value: string): string => `"${value.replace(/[\\"$`]/g, "\\$&")}"`;
