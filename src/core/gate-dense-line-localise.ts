/**
 * Dense-line localisation for `ui gate`.
 *
 * A page captured from a running app (`page.content()` from a dev server) puts the
 * whole rendered body on ONE line: every body finding then reports the same line
 * (`<div id="root">`), which names nothing a person can fix. This layer spreads
 * such a line out before the families run, then maps each finding back to the
 * ORIGINAL line and adds a selector-style `nodeRef` for the element it hit.
 *
 * How the spread stays harmless: the newline goes INSIDE each start tag, just
 * before its closing `>` (`<div class="x"` + "\n" + `>`). Whitespace there is
 * insignificant to every HTML parser, so the DOM, its text nodes and every
 * attribute value are byte-for-byte what they were; no text gains a space. After
 * the spread each line holds at most one start-tag `<`, so a line names one element.
 *
 * Only lines that are really dense are touched (long AND tag-heavy), so a
 * hand-written file keeps its exact layout and its findings stay byte-identical.
 * Raw-text elements (`script`, `style`, `textarea`, `title`) and `pre` are copied
 * through untouched.
 */
import { parseDocument } from "htmlparser2";
import type { Element } from "domhandler";
import { elements, nodeRef } from "./extractors/html/html-dom.js";

/** A line is dense when it is at least this long… */
const DENSE_MIN_CHARS = 1000;
/** …and opens at least this many tags. */
const DENSE_MIN_TAGS = 10;
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "pre"]);

export interface DenseLineSpread {
  /** The document the families should judge (identical to the input when nothing was dense). */
  html: string;
  /** True when at least one line was spread. */
  changed: boolean;
  /** Spread line → original line. */
  originalLine(line: number): number;
  /** Spread line → locator of the element whose start tag is on it; undefined outside a spread line. */
  refAt(line: number): string | undefined;
}

/** Spread the dense lines of `html`. Pure; never throws. */
export function spreadDenseLines(html: string): DenseLineSpread {
  const lines = html.split("\n");
  const dense = lines.map((l) => l.length >= DENSE_MIN_CHARS && countStartTags(l) >= DENSE_MIN_TAGS);
  if (!dense.some(Boolean)) return identity(html);

  // Spread across the whole document in one pass, so a raw-text element that opens
  // on one line and closes on a later one is tracked correctly.
  const out: string[] = [];
  const spreadToOriginal: number[] = []; // index = spread line - 1
  const spreadLineIsDense: boolean[] = [];
  let rawUntil: string | undefined; // closing tag we are waiting for inside raw text
  lines.forEach((line, i) => {
    const res = dense[i] === true ? spreadLine(line, rawUntil) : { text: line, rawUntil: trackRaw(line, rawUntil) };
    rawUntil = res.rawUntil;
    const pieces = res.text.split("\n");
    for (const p of pieces) {
      out.push(p);
      spreadToOriginal.push(i + 1);
      spreadLineIsDense.push(dense[i] === true);
    }
  });
  const spread = out.join("\n");

  // Line → element: each spread line of a dense line holds at most one start tag.
  const lineStarts: number[] = [0];
  for (let k = 0; k < spread.length; k++) if (spread.charCodeAt(k) === 10) lineStarts.push(k + 1);
  const lineOf = (offset: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] as number) <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const refs = new Map<number, Element>();
  try {
    const doc = parseDocument(spread, { withStartIndices: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
    for (const el of elements(doc)) {
      const ln = lineOf(el.startIndex ?? 0);
      if (spreadLineIsDense[ln - 1] === true && !refs.has(ln)) refs.set(ln, el);
    }
  } catch {
    // An unparsable document keeps its original line numbers and simply gains no refs.
  }

  return {
    html: spread,
    changed: true,
    originalLine: (line) => spreadToOriginal[line - 1] ?? line,
    refAt: (line) => {
      const el = refs.get(line);
      return el === undefined ? undefined : nodeRef(el);
    },
  };
}

function identity(html: string): DenseLineSpread {
  return { html, changed: false, originalLine: (l) => l, refAt: () => undefined };
}

function countStartTags(line: string): number {
  let n = 0;
  for (let i = 0; i < line.length - 1; i++) {
    if (line.charCodeAt(i) === 60 && /[a-zA-Z]/.test(line[i + 1] as string)) n++;
  }
  return n;
}

/** Advance raw-text state across a line that is not spread. */
function trackRaw(line: string, rawUntil: string | undefined): string | undefined {
  return spreadLine(line, rawUntil, false).rawUntil;
}

/**
 * Insert "\n" before the closing `>` of every start tag outside raw text. Quotes in
 * attribute values are honoured, so a `>` inside `title="a > b"` is not a tag end.
 */
function spreadLine(line: string, rawUntilIn: string | undefined, insert = true): { text: string; rawUntil: string | undefined } {
  let rawUntil = rawUntilIn;
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (rawUntil !== undefined) {
      const close = line.toLowerCase().indexOf(`</${rawUntil}`, i);
      if (close === -1) { out += line.slice(i); return { text: out, rawUntil }; }
      out += line.slice(i, close);
      i = close;
      rawUntil = undefined;
      continue;
    }
    const ch = line[i] as string;
    if (ch === "<" && i + 1 < line.length && /[a-zA-Z]/.test(line[i + 1] as string)) {
      // A start tag: copy to its closing `>`, honouring quotes.
      let j = i + 1;
      while (j < line.length && /[\w:-]/.test(line[j] as string)) j++;
      const name = line.slice(i + 1, j).toLowerCase();
      let quote: string | undefined;
      while (j < line.length) {
        const c = line[j] as string;
        if (quote !== undefined) { if (c === quote) quote = undefined; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
        j++;
      }
      if (j >= line.length) { out += line.slice(i); return { text: out, rawUntil }; }
      const selfClosing = line[j - 1] === "/";
      const body = line.slice(i, selfClosing ? j - 1 : j);
      out += insert ? `${body}\n${selfClosing ? "/" : ""}>` : `${body}${selfClosing ? "/" : ""}>`;
      i = j + 1;
      if (RAW_TEXT.has(name) && !selfClosing) rawUntil = name;
      continue;
    }
    if (line.startsWith("<!--", i)) {
      const end = line.indexOf("-->", i + 4);
      if (end === -1) { out += line.slice(i); return { text: out, rawUntil }; }
      out += line.slice(i, end + 3);
      i = end + 3;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, rawUntil };
}
