/**
 * polyglot-ui-extractor.ts — a zero-dependency style/class/markup stripper for UI source files.
 *
 * Spec 031 FR-007. Not a framework compiler: it never boots Vite/Next/SvelteKit and never builds an
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

const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const INLINE_STYLE_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const JSX_STYLE_OBJECT_RE = /\bstyle\s*=\s*\{\{([^}]*)\}\}/g;
const OBJECT_PAIR_RE = /\b([A-Za-z]+)\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g;
const FONT_FAMILY_PROP_RE = /\bfontFamily\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g;
const TEMPLATE_LITERAL_RE = /`((?:\\.|[^`\\])*)`/g;
const CSS_LOOKING_RE = /\{[^{}]*[\w-]\s*:\s*[^{};]+;?[^{}]*\}/;
const CLASS_ATTR_RE = /\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const STRING_LITERAL_RE = /"([^"\n]*)"|'([^'\n]*)'|`((?:\\.|[^`\\])*)`/g;

const underscores = (m: string): string => m.replace(/[^\n]/g, "_");
const spaces = (m: string): string => m.replace(/[^\n]/g, " ");
const kebab = (camel: string): string => camel.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const firstDefined = (m: RegExpMatchArray, from = 1): string => m.slice(from).find((g) => g !== undefined) ?? "";

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
  let text = source.replace(/<!--[\s\S]*?-->/g, spaces).replace(/\/\*[\s\S]*?\*\//g, spaces);
  if (ext !== ".html") text = text.replace(/\$\{[^}]*\}/g, underscores);
  if (isScript) text = text.replace(/(^|\s)\/\/[^\n]*/g, (m) => spaces(m));
  const lines = createLineIndex(source);
  const records: UiRecord[] = [{ file, line: 1, styles: "", classes: [], markup: source }];
  const push = (at: number, patch: Partial<Pick<UiRecord, "styles" | "classes">>): void => {
    records.push({ file, line: lines.lineOf(at), styles: "", classes: [], markup: "", ...patch });
  };

  for (const m of text.matchAll(STYLE_BLOCK_RE)) {
    if ((m[1] ?? "").trim() !== "") push((m.index ?? 0) + m[0].indexOf(">") + 1, { styles: m[1] as string });
  }
  for (const m of text.matchAll(INLINE_STYLE_RE)) push(m.index ?? 0, { styles: `*{${firstDefined(m)}}` });
  if (isScript || ext === ".svelte" || ext === ".vue") {
    // Read, then blank: the same pairs must not be read again as bare CSS-in-JS properties below.
    text = text.replace(JSX_STYLE_OBJECT_RE, (whole: string, body: string, offset: number) => {
      const decls = [...body.matchAll(OBJECT_PAIR_RE)].map((p) => `${kebab(p[1] as string)}: ${firstDefined(p, 2)};`);
      if (decls.length > 0) push(offset, { styles: `*{${decls.join(" ")}}` });
      return spaces(whole);
    });
  }
  if (isScript) {
    for (const m of text.matchAll(TEMPLATE_LITERAL_RE)) {
      if (CSS_LOOKING_RE.test(m[1] as string)) push((m.index ?? 0) + 1, { styles: m[1] as string });
    }
    for (const m of text.matchAll(FONT_FAMILY_PROP_RE)) push(m.index ?? 0, { styles: `*{font-family: ${firstDefined(m)};}` });
  }
  // Read, then blank: a class attribute's string must not be read again as a bare string literal below.
  text = text.replace(CLASS_ATTR_RE, (whole: string, d: string, s: string, t: string, offset: number) => {
    push(offset, { classes: classTokens(d ?? s ?? t ?? "") });
    return spaces(whole);
  });
  if (ext !== ".html") {
    for (const m of text.matchAll(STRING_LITERAL_RE)) {
      const tokens = classTokens(firstDefined(m));
      if (tokens.length > 0) push(m.index ?? 0, { classes: tokens });
    }
  }
  return records.sort((a, b) => a.line - b.line);
}
