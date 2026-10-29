/**
 * polyglot-ui-scans.ts - single-pass text scans behind the polyglot UI extractor.
 *
 * Each scan walks the text once and never restarts at every opener, so an unterminated comment, `<style`,
 * `${` or `style={{` costs one pass. A scan that blanks or reads a span returns the text with the span
 * replaced by same-length filler, so offsets and line numbers hold; a span it skips is carried forward
 * unchanged (text that went missing would move every later finding).
 */

const JSX_OPEN_RE = /\bstyle\s*=\s*\{\{/g;
/** A property declaration inside a brace-free block: `name: value` with at least one value character. */
const DECLARATION_RE = /[\w-]\s*:[^;]/;

const underscores = (m: string): string => m.replace(/[^\n]/g, "_");
export const spaces = (m: string): string => m.replace(/[^\n]/g, " ");

/** Blank every `open…close` span; an opener with no closer is left as it is. One pass. */
export function blankDelimited(text: string, open: string, close: string, fill: (span: string) => string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const a = text.indexOf(open, from);
    if (a === -1) break;
    const b = text.indexOf(close, a + open.length);
    if (b === -1) break;
    out += text.slice(from, a) + fill(text.slice(a, b + close.length));
    from = b + close.length;
  }
  return out + text.slice(from);
}

/** Replace each `${…}` (up to the first `}`) with underscores of the same length. One pass. */
export function blankInterpolations(text: string): string {
  let out = "";
  let from = 0;
  let close = -1;
  for (;;) {
    const a = text.indexOf("${", from);
    if (a === -1) break;
    if (close < a + 2) {
      close = text.indexOf("}", a + 2);
      if (close === -1) break;
    }
    out += text.slice(from, a) + underscores(text.slice(a, close + 1));
    from = close + 1;
  }
  return out + text.slice(from);
}

/** Read every `<tag>…</tag>` (`style`, `script`) through `read`, and return the text with those spans blanked. One pass. */
export function readElementBodies(text: string, tag: "style" | "script", read: (offset: number, body: string) => void): string {
  const OPEN_RE = new RegExp(`<${tag}\\b`, "gi");
  const CLOSE_RE = new RegExp(`</${tag}\\s*>`, "gi");
  let out = "";
  let from = 0;
  let gt = -1;
  for (;;) {
    OPEN_RE.lastIndex = from;
    const open = OPEN_RE.exec(text);
    if (open === null) break;
    if (gt < open.index) {
      gt = text.indexOf(">", open.index);
      if (gt === -1) break;
    }
    CLOSE_RE.lastIndex = gt + 1;
    const close = CLOSE_RE.exec(text);
    if (close === null) break; // no closer after this opener means none after any later one either
    const css = text.slice(gt + 1, close.index);
    if (css.trim() !== "") read(gt + 1, css);
    const end = close.index + close[0].length;
    out += text.slice(from, open.index) + spaces(text.slice(open.index, end));
    from = end;
  }
  return out + text.slice(from);
}

/** Read every `<style>…</style>` through `read`, and return the text with those spans blanked. One pass. */
export const readStyleBlocks = (text: string, read: (offset: number, css: string) => void): string => readElementBodies(text, "style", read);

/** Read every `style={{ … }}` through `read` and blank it. The body is whatever precedes the first `}`. One pass. */
export function readJsxStyleObjects(text: string, read: (offset: number, body: string) => void): string {
  let out = "";
  let from = 0;
  let brace = -1;
  for (;;) {
    JSX_OPEN_RE.lastIndex = from;
    const open = JSX_OPEN_RE.exec(text);
    if (open === null) break;
    const bodyStart = open.index + open[0].length;
    if (brace < bodyStart) {
      brace = text.indexOf("}", bodyStart);
      if (brace === -1) break;
    }
    if (text[brace + 1] !== "}") {
      out += text.slice(from, bodyStart); // not an object literal (`{ ... } as T`, a nested brace): keep the text, move on
      from = bodyStart;
      continue;
    }
    read(open.index, text.slice(bodyStart, brace));
    out += text.slice(from, open.index) + spaces(text.slice(open.index, brace + 2));
    from = brace + 2;
  }
  return out + text.slice(from);
}

/** Index just past the backtick that closes the template literal opened before `from`, or -1 when none does. */
function templateEnd(text: string, from: number): number {
  let j = from;
  while (j < text.length && text[j] !== "`") j += text[j] === "\\" ? 2 : 1;
  return j >= text.length ? -1 : j;
}

/** Contents and offsets of the template literals in `text`. An unterminated one ends the scan. One pass. */
export function templateLiterals(text: string): { at: number; value: string }[] {
  const found: { at: number; value: string }[] = [];
  let i = text.indexOf("`");
  while (i !== -1) {
    const end = templateEnd(text, i + 1);
    if (end === -1) break;
    found.push({ at: i + 1, value: text.slice(i + 1, end) });
    i = text.indexOf("`", end + 1);
  }
  return found;
}

/** String and template literals in `text`, left to right, each as its inner text. One pass. */
export function* stringLiterals(text: string): Generator<{ at: number; value: string }> {
  let i = 0;
  let nl = -2; // next "\n" at or after the last search; -1 = none left; -2 = not searched yet
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      const end = templateEnd(text, i + 1);
      if (end === -1) return;
      yield { at: i, value: text.slice(i + 1, end) };
      i = end + 1;
    } else if (c === '"' || c === "'") {
      if (nl !== -1 && nl <= i) nl = text.indexOf("\n", i + 1);
      const end = text.indexOf(c, i + 1);
      if (end !== -1 && (nl === -1 || end < nl)) {
        yield { at: i, value: text.slice(i + 1, end) };
        i = end + 1;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
}

/** True when `text` holds a `{ … }` block, free of nested braces, with a `name: value` declaration. One pass. */
export function looksLikeCss(text: string): boolean {
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") open = i;
    else if (c === "}" && open !== -1) {
      if (DECLARATION_RE.test(text.slice(open + 1, i))) return true;
      open = -1;
    }
  }
  return false;
}

/** Class tokens of one attribute/string value; punctuation around a token (`'a'`, `{b`) is shed. */
export function classTokens(value: string): string[] {
  return value.split(/[\s,]+/)
    .map((t) => t.replace(/^[^\w!:-]+|[^\w\]-]+$/g, ""))
    .map((t) => (t.includes("[") ? t : t.replace(/\]+$/, "")))
    .filter((t) => t !== "" && !/^_+$/.test(t));
}
