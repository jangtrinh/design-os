/**
 * What `ui ds import` cannot turn into a typed token, member by member (spec 033 FR-011). The flat importer
 * (`importFlatTokens`) skips these and counts them; this module names each one with a stable identity and the reason,
 * so the owner is asked about every one and nothing is dropped with only a printed sample.
 *
 * Seven reasons: unmappable type, null leaf, bad colour, ignored `_` key, not a token group (found in the source
 * file), and dangling alias, alias cycle (found in the tokens the import would write, because an alias is written only
 * when its target is). Pure: no IO.
 *
 * A source member's id is its JSON pointer into the file (`/colors/accent`), which a rename of a key changes and a
 * reorder does not; an alias member's id is its token path (`colors.accent`), the path it would have been written at.
 */
import { isAlias, isTokenLeaf } from "./token-model.js";
import type { Token, TokenTree } from "./token-model.js";
import { inferToken, pointerOf } from "./token-import.js";

export type ImportSkipReason = "unmappable-type" | "null-leaf" | "dangling-alias" | "alias-cycle" | "bad-colour" | "ignored-key" | "not-token-group";

export interface ImportSkip {
  /** Stable identity: a JSON pointer into the file, or (alias reasons) the token path. */
  id: string;
  /** What a person recognises: the dotted source path, or the token path. */
  name: string;
  reason: ImportSkipReason;
  /** The value a "keep as raw string token" would carry, when it is a primitive; absent otherwise. */
  raw?: string;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPrimitive = (v: unknown): v is string | number | boolean => ["string", "number", "boolean"].includes(typeof v);

function leafReason(value: unknown): ImportSkipReason {
  if (value === null) return "null-leaf";
  // A hex-looking value that is not a colour is a bad colour; every other string or scalar is an unmappable type.
  if (typeof value === "string" && value.trim().startsWith("#")) return "bad-colour";
  return "unmappable-type";
}

/**
 * The members of the source file the flat importer skips or ignores. It walks the file the way `importFlatTokens`
 * does (a nested group hoists into its own category, an already-DTCG leaf passes through) and asks `inferToken`, the
 * importer's own decision, so the two cannot disagree about what is skipped.
 */
export function findSourceSkips(flat: unknown): ImportSkip[] {
  const out: ImportSkip[] = [];
  const add = (ptr: string[], reason: ImportSkipReason, value: unknown): void => {
    out.push({ id: pointerOf(ptr), name: ptr.join("."), reason, ...(isPrimitive(value) ? { raw: String(value) } : {}) });
  };
  const visit = (cat: string, entries: [string, unknown][], ptr: string[]): void => {
    for (const [name, value] of entries) {
      const at = [...ptr, name];
      if (isTokenLeaf(value) && (typeof value.$value === "string" || typeof value.$value === "number")) continue;
      if (isPlainObject(value)) { visit(`${cat}-${name}`, Object.entries(value), at); continue; }
      const r = inferToken(cat, name, value);
      if ("skip" in r) add(at, leafReason(value), value);
    }
  };
  if (!isPlainObject(flat)) return out;
  for (const [category, group] of Object.entries(flat)) {
    if (category.startsWith("_")) { add([category], "ignored-key", group); continue; }
    if (!isPlainObject(group)) { add([category], "not-token-group", group); continue; }
    visit(category, Object.entries(group), [category]);
  }
  return out;
}

const targetOf = (token: Token): string | null => (isAlias(token.$value) ? token.$value.slice(1, -1) : null);

/**
 * The aliases of `tree` that cannot be written: a dangling alias (its target is not a token of the tree, or is itself a
 * dangling alias or an alias that cannot resolve; `unreachable` names the aliases whose target the import left out) and an alias cycle (the tokens on a loop; a token that merely leads
 * into a loop is dangling, not part of it).
 */
export function findAliasSkips(tree: TokenTree, unreachable: ReadonlySet<string> = new Set()): ImportSkip[] {
  const alias = new Map<string, string>();
  const exists = new Set<string>();
  for (const [cat, group] of Object.entries(tree)) {
    for (const [name, token] of Object.entries(group)) {
      exists.add(`${cat}.${name}`);
      const target = targetOf(token);
      if (target !== null) alias.set(`${cat}.${name}`, target);
    }
  }
  const verdict = new Map<string, "ok" | "dangling" | "cycle">();
  const resolve = (start: string): void => {
    const chain: string[] = [];
    let at = start;
    while (true) {
      const known = verdict.get(at);
      if (known !== undefined) { for (const p of chain) verdict.set(p, known === "ok" ? "ok" : "dangling"); return; }
      const loopAt = chain.indexOf(at);
      if (loopAt >= 0) {
        for (const p of chain.slice(loopAt)) verdict.set(p, "cycle");
        for (const p of chain.slice(0, loopAt)) verdict.set(p, "dangling");
        return;
      }
      if (unreachable.has(at)) { chain.push(at); for (const p of chain) verdict.set(p, "dangling"); return; }
      const target = alias.get(at);
      if (target === undefined) { for (const p of chain) verdict.set(p, "ok"); return; } // a literal ends the chain
      chain.push(at);
      if (!exists.has(target)) { for (const p of chain) verdict.set(p, "dangling"); return; }
      at = target;
    }
  };
  for (const path of [...alias.keys()].sort()) resolve(path);
  return [...alias.keys()].sort().flatMap((path): ImportSkip[] => {
    const v = verdict.get(path);
    return v === "dangling" || v === "cycle" ? [{ id: path, name: path, reason: v === "cycle" ? "alias-cycle" : "dangling-alias" }] : [];
  });
}
