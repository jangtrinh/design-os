/**
 * The one text masker of the `ui ds surface` readers (spec 033 CD-5): comments and string literals blanked to spaces of
 * the same length and lines, and the line helpers every reader needs. No parser: a string is recognised by a rule that
 * markup text survives, so a stray quote cannot hide what follows it.
 *
 * Comments and strings are recognised in ONE left-to-right pass: a `/*` or `//` inside a string or a template is text
 * (`import.meta.glob("./svg/*.svg")`, `accept="image/*"`, `` `a // b` ``), and a quote or backtick inside a comment is
 * text (`// don't`). A line comment opens only at a line start or after whitespace or one of `;{}(),` (so `http://x` in
 * markup text is no comment); a block comment that never closes is no comment.
 *
 *  - A `'` or `"` closes on its own line or it is not a string (an apostrophe in JSX text has no partner).
 *  - A `'` or `"` directly after a letter, a digit or `_` opens nothing (`Don't`, `it's`, `5"`), with one exception: when
 *    the word that ends directly before the quote is a JavaScript keyword an expression can follow (`return"x"`,
 *    `typeof"x"`, `case"a":`), the quote opens a string.
 *  - A template literal may span lines and may hold `${ … }` with other templates inside it; the whole span is one string.
 *    Inside `${ … }` only braces and nested templates are tracked, never quotes: a quote in a regular expression
 *    (`.replace(/"/g, '""')`) is far more common in real code than a brace inside a string of an interpolation.
 *  - A template the nested-aware scan cannot close is reported (`undecidedTemplateAt`) and masks nothing: the scan stops
 *    there and never masks to the end of the text. The caller lists the file and reads nothing from that point on.
 *
 * In a file the scan could not decide, the backtick phase can only shift on a line that holds an odd number of backticks
 * (a line with an even number opens and closes in itself). So everything before the first such line is decided, and
 * nothing from that line on is: `undecidedFromLine` gives that line and the readers list what stands on or after it.
 *
 * Known limits, not built (they need a lexer for regular-expression literals and markup text; one follow-up, gated by
 * `tests/ds-surface-oracle-typescript.test.ts`): a regular-expression literal that holds a backtick on a line that also
 * opens a real template, or an even number of backticks, shifts the mask without a signal; a bracket in a regular
 * expression skews the bracket depth of the export reader; a quote in markup text that pairs with a later quote on its
 * line masks the class attribute between them.
 */
import { spaces } from "../polyglot-ui-scans.js";

/** JavaScript keywords after which an expression can start, so a quote glued to one opens a string. */
const KEYWORD_BEFORE_QUOTE = /(?:^|[^\w$.])(?:return|typeof|case|in|of|instanceof|void|delete|new|throw|yield|await|else|do|default|export|import|from|extends)$/;
const opensString = (text: string, i: number): boolean => !isWordChar(text[i - 1]) || KEYWORD_BEFORE_QUOTE.test(text.slice(Math.max(0, i - 12), i));

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_]/.test(c);

/** Index just past the quote that closes the string opened at `open`, on the same line; -1 when none does. */
function quotedEnd(text: string, open: number): number {
  const quote = text[open];
  for (let j = open + 1; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") j++;
    else if (c === quote) return j + 1;
    else if (c === "\n") return -1;
  }
  return -1;
}

/** Index just past the backtick that closes the template opened at `open`; `${ … }` is read as code, so a template inside it does not flip the parity. -1 when none closes. */
function templateEnd(text: string, open: number): number {
  for (let j = open + 1; j < text.length;) {
    const c = text[j];
    if (c === "\\") j += 2;
    else if (c === "`") return j + 1;
    else if (c === "$" && text[j + 1] === "{") { j = interpolationEnd(text, j + 2); if (j === -1) return -1; } else j++;
  }
  return -1;
}

/** Index just past the `}` that closes the interpolation whose body starts at `from`, tracking braces and nested templates only; -1 when none does. */
function interpolationEnd(text: string, from: number): number {
  let depth = 1;
  for (let j = from; j < text.length;) {
    const c = text[j];
    if (c === "`") { j = templateEnd(text, j); if (j === -1) return -1; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return j + 1;
    j++;
  }
  return -1;
}

export interface SourceScan {
  /** `[start, end)` of every string literal, the quotes included. */
  spans: [number, number][];
  /** `[start, end)` of every comment. */
  comments: [number, number][];
  /** Offset of the template the nested-aware scan could not close (strings stop there; comments are still found), or -1. */
  undecidedTemplateAt: number;
}
export type StringScan = SourceScan;

/** Comments and strings of `text`, in one pass. */
export function scanSource(text: string): SourceScan {
  const scan: SourceScan = { spans: [], comments: [], undecidedTemplateAt: -1 };
  const stringsOff = (): boolean => scan.undecidedTemplateAt !== -1;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end !== -1) { scan.comments.push([i, end + 2]); i = end + 2; continue; }
      i++;
    } else if (c === "/" && text[i + 1] === "/" && (i === 0 || /[\s;{}(),]/.test(text[i - 1] as string))) {
      const nl = text.indexOf("\n", i);
      const end = nl === -1 ? text.length : nl;
      scan.comments.push([i, end]);
      i = end;
    } else if (stringsOff()) i++;
    else if (c === "`") {
      const end = templateEnd(text, i);
      if (end === -1) { scan.undecidedTemplateAt = i; i++; continue; } // no string is recognised after this backtick
      scan.spans.push([i, end]);
      i = end;
    } else if ((c === '"' || c === "'") && opensString(text, i)) {
      const end = quotedEnd(text, i);
      if (end === -1) i++; else { scan.spans.push([i, end]); i = end; }
    } else i++;
  }
  return scan;
}
export const scanStrings = scanSource;

/** The text with every comment of `scan` blanked, same length and same lines. */
export function blankComments(source: string, scan: SourceScan = scanSource(source)): string {
  let out = "";
  let from = 0;
  for (const [start, end] of scan.comments) { out += source.slice(from, start) + spaces(source.slice(start, end)); from = end; }
  return out + source.slice(from);
}

/** True for every character that sits inside a string or a template literal (the quotes included). */
export function stringMask(text: string, scan: SourceScan = scanSource(text)): Uint8Array {
  const mask = new Uint8Array(text.length);
  for (const [start, end] of scan.spans) mask.fill(1, start, end);
  return mask;
}

/** The text with the inside of every string blanked (quotes kept, same length and lines); a module specifier (`from "./a"`) is kept, the barrel reader needs it. */
export function blankStrings(text: string, scan: SourceScan = scanSource(text)): string {
  let out = "";
  let from = 0;
  for (const [start, end] of scan.spans) {
    out += text.slice(from, start);
    const keep = text[start] !== "`" && /\bfrom\s*$/.test(text.slice(Math.max(0, start - 200), start));
    out += keep ? text.slice(start, end) : text[start] + spaces(text.slice(start + 1, end - 1)) + text[end - 1];
    from = end;
  }
  return out + text.slice(from);
}

export const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
};
export const lineIndexOf = (starts: readonly number[], idx: number): number => {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((starts[mid] as number) <= idx) lo = mid; else hi = mid - 1; }
  return lo;
};

/** The 0-based line from which an undecided file cannot be trusted: its first line with an odd number of backticks, or the line `fallback` where the scan failed when that is earlier. */
export function undecidedFromLine(text: string, fallback: number): number {
  const lines = text.split("\n");
  const odd = lines.findIndex((l) => (l.split("`").length - 1) % 2 === 1);
  return odd === -1 ? fallback : Math.min(odd, fallback);
}
