/**
 * Match one selector against a document, in time linear in the document.
 *
 * `css-select` walks a descendant combinator by trying every ancestor for the
 * previous compound, recursively and with no memo. A chain of k descendant
 * combinators over a tree of depth D therefore costs about C(D, k) per element,
 * and a selector whose leftmost compound never matches is the worst case, because
 * every path must be explored before giving up: `.nope div div div div div` over
 * 100 nested divs took 12 s, and 200 never finished. That is hostile-looking but
 * entirely ordinary input for a page-builder export, and `ui gate` reads the same
 * cascade, so the blow-up could stall the whole CLI.
 *
 * The fix keeps `css-select` as the one authority for what a compound (and a `>`
 * / `+` chain, which are O(1) per step) means, and replaces only the unbounded
 * part: the selector is cut at its top-level descendant combinators, each segment
 * is compiled by `css-select`, and "is there an ancestor satisfying segment i" is
 * memoised per element, so every (segment, element) pair is evaluated once.
 */
import { compile, selectAll } from "css-select";
import type { Document, Element } from "domhandler";
import { elements } from "./html-dom.js";

/** Below this many segments the plain engine is cheap and byte-for-byte the reference. */
const MEMO_FROM_SEGMENTS = 3;

/**
 * Cut a selector at descendant combinators: whitespace at bracket depth 0 that is
 * not next to `>`, `+`, `~` (those are other combinators and stay inside their
 * segment, as does anything inside `(...)`, `[...]` or a quoted string).
 */
export function descendantSegments(selector: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let quote = "";
  const text = selector.trim();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quote !== "") {
      if (ch === "\\") { cur += ch + (text[++i] ?? ""); continue; }
      if (ch === quote) quote = "";
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\s/.test(ch)) {
      let j = i;
      while (j < text.length && /\s/.test(text[j] as string)) j++;
      const before = cur.trimEnd().slice(-1);
      const after = text[j] ?? "";
      if (before !== "" && !/[>+~]/.test(before) && !/[>+~]/.test(after) && after !== "") {
        out.push(cur);
        cur = "";
        i = j - 1;
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

const parentElement = (el: Element): Element | null => {
  const p = el.parent;
  return p !== null && p.type !== "root" ? (p as Element) : null;
};

/**
 * Every element of `doc` matching `selector`, in document order. Throws when the
 * selector cannot be compiled, exactly as `selectAll` does, so callers keep their
 * single "unsupported selector" path.
 */
export function selectMatching(selector: string, doc: Document): Element[] {
  const segments = descendantSegments(selector);
  if (segments.length < MEMO_FROM_SEGMENTS) return selectAll<Element, Element>(selector, doc as unknown as Element);

  const tests = segments.map((s) => compile<Element, Element>(s));
  const matched = segments.map(() => new Map<Element, boolean>());
  const underMatch = segments.map(() => new Map<Element, boolean>());

  /** Does `el` satisfy segment `i` with segments 0..i-1 matched somewhere above it? */
  const satisfies = (i: number, el: Element): boolean => {
    const memo = matched[i] as Map<Element, boolean>;
    const hit = memo.get(el);
    if (hit !== undefined) return hit;
    const here = (tests[i] as (e: Element) => boolean)(el);
    const result = here && (i === 0 || someAncestorSatisfies(i - 1, parentElement(el)));
    memo.set(el, result);
    return result;
  };

  /** Does `start` or any ancestor of it satisfy segment `i`? Iterative: depth can be in the thousands. */
  const someAncestorSatisfies = (i: number, start: Element | null): boolean => {
    const memo = underMatch[i] as Map<Element, boolean>;
    const trail: Element[] = [];
    let result = false;
    for (let cur = start; cur !== null; cur = parentElement(cur)) {
      const hit = memo.get(cur);
      if (hit !== undefined) { result = hit; break; }
      trail.push(cur);
      if (satisfies(i, cur)) { result = true; break; }
    }
    for (const el of trail) memo.set(el, result);
    return result;
  };

  const last = segments.length - 1;
  return elements(doc).filter((el) => satisfies(last, el));
}
