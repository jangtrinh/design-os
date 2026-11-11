/**
 * The one lexical measure of `ui ontology query`: lower-case word runs, no stemming, no model. A node is scored by the
 * number of distinct query words it carries in its name and aliases; the same words measure how near a title or an area
 * key is to a text that matched nothing.
 */
import type { OntNode } from "./ontology-types.js";

/** Split points inside a run: lower case or digit before an upper-case letter (`PrimaryButton`), and an upper-case run before a capitalised word (`HTMLTable`). */
const CASE_BOUNDARY = /(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u;

/**
 * The words of a text: every run of letters and digits is split at its case boundaries and lower-cased, and the whole
 * unsplit run is kept as a word too, so `PrimaryButton` is reached by `primary`, `button`, `primarybutton` and
 * `PrimaryButton`. Digits stay with the letters before them; an all-caps run (`FAQ`) is one word.
 */
export function wordsOf(text: string): string[] {
  const words: string[] = [];
  for (const run of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const parts = run.split(CASE_BOUNDARY).map((w) => w.toLowerCase());
    words.push(...parts, ...(parts.length > 1 ? [run.toLowerCase()] : []));
  }
  return words;
}

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
