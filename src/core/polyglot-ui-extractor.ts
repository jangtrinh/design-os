/**
 * polyglot-ui-extractor.ts — a zero-dependency style/class/markup stripper for UI source files.
 *
 * Not a framework compiler: it never boots Vite/Next/SvelteKit and never builds an
 * AST. It turns a `.html .svelte .vue .jsx .tsx .js .ts` file into flat records the design-system
 * linters can read, each carrying the 1-based line where its text starts:
 *
 *   styles   CSS text: a `<style>` block, an inline `style="…"` (wrapped as `*{…}`), a JSX
 *            `style={{ fontFamily: "x" }}` object (rewritten as `font-family: x;`), a CSS-looking
 *            template literal in a script, or a bare `fontFamily: "x"` object property.
 *   classes  class tokens from `class=` / `className=` and, outside plain HTML, from every
 *            string/template literal (so `cn("font-mono")`, `clsx(...)`, Vue `:class="['a']"` count).
 *   markup   the whole source, on ONE record per file (line 1) — the text token-ban rules scan.
 *
 * Every span is read once and then blanked, so a `<style>` or `style=` written inside a template
 * literal is not read a second time as "CSS-looking" text. Scans are single passes (no regex that
 * restarts at every opener), so an unterminated comment, `<style`, `${` or `style={{` costs one pass.
 *
 * Comments are blanked first (same length, so offsets and lines hold). Template-literal `${…}`
 * interpolations become runs of `_`: an interpolated value is unknown, and the linters treat an
 * all-underscore value as "dynamic" rather than guessing at it. Honesty (Art VIII): this reads the
 * text of the file, not what a build would emit; a style assembled at runtime is not seen.
 */
import { createLineIndex } from "./line-index.js";

export interface UiRecord {
  file: string;
  /** 1-based line where this record's text starts. */
  line: number;
  styles: string;
  classes: string[];
  markup: string;
}

export const UI_SOURCE_EXTENSIONS = [".html", ".svelte", ".vue", ".jsx", ".tsx", ".js", ".ts"] as const;
const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".jsx", ".tsx", ".js", ".ts"]);

/** The supported extension of `path` (lower-cased), or undefined when the file is not UI source. */
export function uiSourceExtension(path: string): string | undefined {
  const m = /\.[A-Za-z0-9]+$/.exec(path);
  const ext = m?.[0].toLowerCase();
  return UI_SOURCE_EXTENSIONS.find((e) => e === ext);
}

const INLINE_STYLE_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const JSX_STYLE_OPEN_RE = /\bstyle\s*=\s*\{\{/g;
const OBJECT_PAIR_RE = /\b([A-Za-z]+)\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g;
const FONT_FAMILY_PROP_RE = /\bfontFamily\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g;
const CLASS_ATTR_RE = /\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const STYLE_OPEN_RE = /<style\b/gi;
const STYLE_CLOSE_RE = /<\/style>/gi;
/** A property declaration inside a brace-free block: `name: value` with at least one value character. */
const DECLARATION_RE = /[\w-]\s*:[^;]/;

const underscores = (m: string): string => m.replace(/[^\n]/g, "_");
const spaces = (m: string): string => m.replace(/[^\n]/g, " ");
const kebab = (camel: string): string => camel.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const firstDefined = (m: RegExpMatchArray, from = 1): string => m.slice(from).find((g) => g !== undefined) ?? "";

/** Blank every `open…close` span; an opener with no closer is left as it is. One pass. */
function blankDelimited(text: string, open: string, close: string, fill: (span: string) => string): string {
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
function blankInterpolations(text: string): string {
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

/** Read every `<style>…</style>` through `read`, and return the text with those spans blanked. One pass. */
function readStyleBlocks(text: string, read: (offset: number, css: string) => void): string {
  let out = "";
  let from = 0;
  let gt = -1;
  for (;;) {
    STYLE_OPEN_RE.lastIndex = from;
    const open = STYLE_OPEN_RE.exec(text);
    if (open === null) break;
    if (gt < open.index) {
      gt = text.indexOf(">", open.index);
      if (gt === -1) break;
    }
    STYLE_CLOSE_RE.lastIndex = gt + 1;
    const close = STYLE_CLOSE_RE.exec(text);
    if (close === null) break; // no closer after this opener means none after any later one either
    const css = text.slice(gt + 1, close.index);
    if (css.trim() !== "") read(gt + 1, css);
    const end = close.index + close[0].length;
    out += text.slice(from, open.index) + spaces(text.slice(open.index, end));
    from = end;
  }
  return out + text.slice(from);
}

/** Read every `style={{ … }}` through `read` and blank it. The body is whatever precedes the first `}`. One pass. */
function readJsxStyleObjects(text: string, read: (offset: number, body: string) => void): string {
  let out = "";
  let from = 0;
  let brace = -1;
  for (;;) {
    JSX_STYLE_OPEN_RE.lastIndex = from;
    const open = JSX_STYLE_OPEN_RE.exec(text);
    if (open === null) break;
    const bodyStart = open.index + open[0].length;
    if (brace < bodyStart) {
      brace = text.indexOf("}", bodyStart);
      if (brace === -1) break;
    }
    if (text[brace + 1] !== "}") {
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
function templateLiterals(text: string): { at: number; value: string }[] {
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
function* stringLiterals(text: string): Generator<{ at: number; value: string }> {
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      const end = templateEnd(text, i + 1);
      if (end === -1) return;
      yield { at: i, value: text.slice(i + 1, end) };
      i = end + 1;
    } else if (c === '"' || c === "'") {
      const nl = text.indexOf("\n", i + 1);
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
function looksLikeCss(text: string): boolean {
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
function classTokens(value: string): string[] {
  return value.split(/[\s,]+/)
    .map((t) => t.replace(/^[^\w!:-]+|[^\w\]-]+$/g, ""))
    .map((t) => (t.includes("[") ? t : t.replace(/\]+$/, "")))
    .filter((t) => t !== "" && !/^_+$/.test(t));
}

export function extractUiRecords(file: string, source: string): UiRecord[] {
  const ext = uiSourceExtension(file);
  if (ext === undefined) return [];
  const isScript = SCRIPT_EXTENSIONS.has(ext);
  let text = blankDelimited(blankDelimited(source, "<!--", "-->", spaces), "/*", "*/", spaces);
  if (ext !== ".html") text = blankInterpolations(text);
  if (isScript) text = text.replace(/(^|\s)\/\/[^\n]*/g, (m) => spaces(m));
  const lines = createLineIndex(source);
  const records: UiRecord[] = [{ file, line: 1, styles: "", classes: [], markup: source }];
  const push = (at: number, patch: Partial<Pick<UiRecord, "styles" | "classes">>): void => {
    records.push({ file, line: lines.lineOf(at), styles: "", classes: [], markup: "", ...patch });
  };

  // Read, then blank: each span is read exactly once, however it is nested in a template literal.
  text = readStyleBlocks(text, (at, css) => push(at, { styles: css }));
  text = text.replace(INLINE_STYLE_RE, (whole: string, d: string | undefined, s: string | undefined, offset: number) => {
    push(offset, { styles: `*{${d ?? s ?? ""}}` });
    return spaces(whole);
  });
  if (isScript || ext === ".svelte" || ext === ".vue") {
    text = readJsxStyleObjects(text, (at, body) => {
      const decls = [...body.matchAll(OBJECT_PAIR_RE)].map((p) => `${kebab(p[1] as string)}: ${firstDefined(p, 2)};`);
      if (decls.length > 0) push(at, { styles: `*{${decls.join(" ")}}` });
    });
  }
  if (isScript) {
    for (const t of templateLiterals(text)) {
      if (looksLikeCss(t.value)) push(t.at, { styles: t.value });
    }
    for (const m of text.matchAll(FONT_FAMILY_PROP_RE)) push(m.index ?? 0, { styles: `*{font-family: ${firstDefined(m)};}` });
  }
  text = text.replace(CLASS_ATTR_RE, (whole: string, d: string | undefined, s: string | undefined, t: string | undefined, offset: number) => {
    push(offset, { classes: classTokens(d ?? s ?? t ?? "") });
    return spaces(whole);
  });
  if (ext !== ".html") {
    for (const lit of stringLiterals(text)) {
      const tokens = classTokens(lit.value);
      if (tokens.length > 0) push(lit.at, { classes: tokens });
    }
  }
  return records.sort((a, b) => a.line - b.line);
}
