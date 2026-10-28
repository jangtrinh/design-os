/**
 * Selector TEXT, read just far enough to speed up matching without deciding what
 * any part of it means: `css-select` stays the one authority on that.
 *
 *  - `splitCompoundChain` cuts a complex selector into its compounds and the
 *    combinators between them (`a.b > c ~ d` → `a.b`, `c`, `d` / `>`, `~`).
 *  - `subjectKey` names one class, id or type the rightmost compound REQUIRES, so
 *    only elements that carry it need to be tested.
 *
 * Both refuse (return undefined) whenever the text is outside the plain shapes they
 * read, and the caller then falls back to testing the whole selector with
 * `css-select` on every element. A refusal costs speed, never correctness.
 */

export type Combinator = " " | ">" | "+" | "~";

/** `combinators[i]` joins `compounds[i]` (left) and `compounds[i + 1]` (right). */
export interface CompoundChain {
  compounds: string[];
  combinators: Combinator[];
}

/** CSS whitespace. Not `\s`: a no-break space is part of an identifier, not a combinator. */
const isCssSpace = (ch: string): boolean => ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
const isHex = (ch: string): boolean => /^[0-9a-fA-F]$/.test(ch);

/**
 * Length of the escape starting at `text[i]` (a backslash): `\` + one character, or
 * `\` + up to six hex digits + one optional whitespace, which belongs to the escape.
 */
function escapeLength(text: string, i: number): number {
  let j = i + 1;
  if (j >= text.length) return 1;
  if (!isHex(text[j] as string)) return 2;
  while (j < text.length && j - i <= 6 && isHex(text[j] as string)) j++;
  if (j < text.length && isCssSpace(text[j] as string)) j++;
  return j - i;
}

/**
 * Walk `text` with escapes, quotes and `(...)` / `[...]` nesting accounted for, calling
 * `top(ch, i)` for every character at depth 0 outside a string. `top` returns the
 * index to continue from, or undefined to continue normally.
 */
function scanTopLevel(text: string, top: (ch: string, i: number) => number | undefined): void {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === "\\") { i += escapeLength(text, i) - 1; continue; }
    if (quote !== "") { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "(" || ch === "[") { depth++; continue; }
    if ((ch === ")" || ch === "]") && depth > 0) { depth--; continue; }
    if (depth === 0) {
      const next = top(ch, i);
      if (next !== undefined) i = next;
    }
  }
}

/** Shapes whose meaning depends on more than one compound at a time, or that `css-select` reads specially. */
const UNSPLITTABLE = /:scope\b|[|&]/i;

export function splitCompoundChain(selector: string): CompoundChain | undefined {
  const text = selector.trim();
  if (text === "" || UNSPLITTABLE.test(text)) return undefined;
  const compounds: string[] = [];
  const combinators: Combinator[] = [];
  let start = 0;
  let refused = false;
  scanTopLevel(text, (ch, i) => {
    if (ch === ",") { refused = true; return text.length; } // a selector LIST is not one chain
    if (!isCssSpace(ch) && ch !== ">" && ch !== "+" && ch !== "~") return undefined;
    let j = i;
    let symbol = "";
    for (; j < text.length; j++) {
      const c = text[j] as string;
      if (isCssSpace(c)) continue;
      if (c !== ">" && c !== "+" && c !== "~") break;
      if (symbol !== "") { refused = true; return text.length; } // `a > > b`
      symbol = c;
    }
    const compound = text.slice(start, i);
    if (compound === "" || j >= text.length) { refused = true; return text.length; } // leading or trailing combinator
    compounds.push(compound);
    combinators.push((symbol === "" ? " " : symbol) as Combinator);
    start = j;
    return j - 1;
  });
  if (refused) return undefined;
  compounds.push(text.slice(start));
  return compounds.every((c) => c !== "") ? { compounds, combinators } : undefined;
}

export interface SubjectKey {
  kind: "id" | "class" | "tag";
  value: string;
}

const IDENT = /^-?[A-Za-z_][A-Za-z0-9_-]*/;
/** What may follow a plain identifier inside a compound. Anything else (an escape, a non-ASCII letter, `|`) means it was not the whole name. */
const ENDS_IDENT = (ch: string | undefined): boolean => ch === undefined || ch === "." || ch === "#" || ch === "[" || ch === ":";

/**
 * A class, id or type that every element matching `compound` must carry; an id is
 * preferred (the smallest bucket), then a class, then the type. Only plain ASCII
 * identifiers at the top level of the compound count: one inside `:not(...)` is
 * not a requirement, and one with an escape is not read here.
 */
export function subjectKey(compound: string): SubjectKey | undefined {
  let id: string | undefined;
  let cls: string | undefined;
  scanTopLevel(compound, (ch, i) => {
    if (ch !== "." && ch !== "#") return undefined;
    const m = IDENT.exec(compound.slice(i + 1));
    if (m === null || !ENDS_IDENT(compound[i + 1 + m[0].length])) return undefined;
    if (ch === "#") id ??= m[0];
    else cls ??= m[0];
    return i + m[0].length;
  });
  if (id !== undefined) return { kind: "id", value: id };
  if (cls !== undefined) return { kind: "class", value: cls };
  const tag = IDENT.exec(compound);
  return tag !== null && /^[A-Za-z]/.test(tag[0]) && ENDS_IDENT(compound[tag[0].length])
    ? { kind: "tag", value: tag[0].toLowerCase() }
    : undefined;
}
