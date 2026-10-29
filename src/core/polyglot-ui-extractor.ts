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
import {
  blankDelimited, blankInterpolations, classTokens, looksLikeCss, readJsxStyleObjects, readStyleBlocks, spaces,
  stringLiterals, templateLiterals,
} from "./polyglot-ui-scans.js";

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
const OBJECT_PAIR_RE = /\b([A-Za-z]+)\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g;
const FONT_FAMILY_PROP_RE = /\bfontFamily\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g;
const CLASS_ATTR_RE = /\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;

const kebab = (camel: string): string => camel.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const firstDefined = (m: RegExpMatchArray, from = 1): string => m.slice(from).find((g) => g !== undefined) ?? "";

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
