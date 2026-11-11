/**
 * The one text masker of the `ui ds surface` readers (spec 033 CD-5): comments and string literals blanked to spaces of
 * the same length and lines, and the line helpers every reader needs. No parser: a string is recognised by a rule that
 * markup text survives, so a stray quote cannot hide what follows it.
 *
 *  - A `'` or `"` closes on its own line or it is not a string (an apostrophe in JSX text has no partner).
 *  - A `'` or `"` directly after a letter, a digit or `_` opens nothing (`Don't`, `it's`, `5"`).
 *  - A template literal may span lines and may hold `${ … }` with strings and other templates inside it; the whole span is
 *    one string. A template that never closes is reported, and masks the rest of the text.
 */
import { blankDelimited, spaces } from "../polyglot-ui-scans.js";

/** The text with comments blanked, same length and same lines. */
export function blankComments(source: string): string {
  const noBlock = blankDelimited(source, "/*", "*/", spaces);
  return noBlock.replace(/(^|[\s;{}(),])\/\/[^\n]*/gm, (m, lead: string) => lead + spaces(m.slice(lead.length)));
}

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

/** Index just past the `}` that closes the interpolation whose body starts at `from`; -1 when none does. */
function interpolationEnd(text: string, from: number): number {
  let depth = 1;
  for (let j = from; j < text.length;) {
    const c = text[j];
    if (c === "`") { j = templateEnd(text, j); if (j === -1) return -1; continue; }
    if ((c === '"' || c === "'") && !isWordChar(text[j - 1])) { const end = quotedEnd(text, j); j = end === -1 ? j + 1 : end; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return j + 1;
    j++;
  }
  return -1;
}

export interface StringScan {
  /** `[start, end)` of every string literal, the quotes included; an unclosed template runs to the end of the text. */
  spans: [number, number][];
  /** Offset of a template literal that never closes, or -1. */
  unclosedTemplateAt: number;
}

export function scanStrings(text: string): StringScan {
  const scan: StringScan = { spans: [], unclosedTemplateAt: -1 };
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === "`") {
      const end = templateEnd(text, i);
      if (end === -1) { scan.spans.push([i, text.length]); scan.unclosedTemplateAt = i; break; }
      scan.spans.push([i, end]);
      i = end;
    } else if ((c === '"' || c === "'") && !isWordChar(text[i - 1])) {
      const end = quotedEnd(text, i);
      if (end === -1) i++; else { scan.spans.push([i, end]); i = end; }
    } else i++;
  }
  return scan;
}

/** True for every character that sits inside a string or a template literal (the quotes included). */
export function stringMask(text: string, scan: StringScan = scanStrings(text)): Uint8Array {
  const mask = new Uint8Array(text.length);
  for (const [start, end] of scan.spans) mask.fill(1, start, end);
  return mask;
}

/** The text with the inside of every string blanked (quotes kept, same length and lines); a module specifier (`from "./a"`) is kept, the barrel reader needs it. */
export function blankStrings(text: string, scan: StringScan = scanStrings(text)): string {
  let out = "";
  let from = 0;
  for (const [start, end] of scan.spans) {
    out += text.slice(from, start);
    const closed = scan.unclosedTemplateAt !== start;
    const keep = text[start] !== "`" && /\bfrom\s*$/.test(text.slice(Math.max(0, start - 200), start));
    out += keep ? text.slice(start, end) : text[start] + spaces(text.slice(start + 1, closed ? end - 1 : end)) + (closed ? text[end - 1] : "");
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
