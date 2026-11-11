/**
 * The token references of one component's own source (spec 033 FR-019, CD-5; review fix round, section C). A reference
 * is resolved only EXACTLY, and every reference that is not resolved is counted under a key of its own:
 *  - `var(--name)` names one custom property. It resolves when exactly one token carries the name the kernel emits for
 *    it (`pathToCssVar`: `color.primary` is `--color-primary`), or the name a CSS-ingested token came from (a token
 *    `color.color-primary` was read from `--color-primary`). The bare leaf never resolves: `--primary` is not
 *    `color.primary`. An unresolved custom property is counted under `customProperty`.
 *  - a theme-key utility in a class attribute (`bg-primary`, `text-ink/50`, `bg-primary/[.5]`) resolves to the colour
 *    token `--color-<key>` when exactly one token has that name. A utility whose key names no token is NOT in the
 *    unresolved sum: `text-sm` and `text-muted` match the same pattern and the kernel cannot tell a colour from a size
 *    without the app's theme. It is counted apart, under `utilitiesNamingNoToken`.
 *  - counted as unresolved, never mapped to the nearest token: a helper call (`cn`, `clsx`, `cva`, `twMerge`, ...) as one
 *    per call (`helperCall`), an arbitrary value (`bg-[#fff]`, `arbitraryValue`), a `theme()` call (`themeCall`), a class
 *    taken from a CSS module (`cssModuleClass`), a literal colour in a style (`literalColor`).
 * `unresolvedStyles` is the sum of the six keys. Classes are read only where a class list can be: a class attribute.
 * A plain string constant resolves nothing, and a helper name inside a string or a comment counts nothing.
 * Without a store nothing resolves.
 */
import type { TokenTree } from "../token-model.js";
import { pathToCssVar } from "../token-emit.js";
import { extractUiRecords } from "../polyglot-ui-extractor.js";
import { blankDelimited, spaces } from "../polyglot-ui-scans.js";

export interface TokenLookup {
  /** The one token path a custom-property name resolves to, or null (none, or more than one). Name without the dashes. */
  resolve(customProperty: string): string | null;
  /** How many tokens carry the name: 0 (none), 1 (resolves), 2 or more (ambiguous: nothing resolves, and the name is not "no token"). */
  answers(customProperty: string): number;
}

export function buildTokenLookup(tree: TokenTree | undefined): TokenLookup {
  const byName = new Map<string, Set<string>>();
  const note = (name: string, path: string): void => { const s = byName.get(name) ?? new Set<string>(); s.add(path); byName.set(name, s); };
  for (const [group, leaves] of Object.entries(tree ?? {})) {
    for (const leaf of Object.keys(leaves)) {
      const path = `${group}.${leaf}`;
      note(pathToCssVar(path).slice(2), path);
      // A store ingested from CSS names the token after the property it was read from: `--color-primary` is `color.color-primary`.
      if (leaf.startsWith(`${group}-`)) note(leaf, path);
    }
  }
  return {
    resolve: (name) => { const hit = byName.get(name); return hit !== undefined && hit.size === 1 ? ([...hit][0] as string) : null; },
    answers: (name) => byName.get(name)?.size ?? 0,
  };
}

export interface StyleBreakdown { customProperty: number; helperCall: number; arbitraryValue: number; themeCall: number; cssModuleClass: number; literalColor: number; ambiguousToken: number }
export const emptyBreakdown = (): StyleBreakdown => ({ customProperty: 0, helperCall: 0, arbitraryValue: 0, themeCall: 0, cssModuleClass: 0, literalColor: 0, ambiguousToken: 0 });
export const sumBreakdown = (b: StyleBreakdown): number => b.customProperty + b.helperCall + b.arbitraryValue + b.themeCall + b.cssModuleClass + b.literalColor + b.ambiguousToken;

const HELPER = /\b(?:cn|clsx|cva|twMerge|twJoin|classNames|classnames)\s*\(/g;
const THEME_KEY = /^(?:bg|text|border|fill|stroke|ring|outline|divide|from|via|to|accent|caret|decoration|placeholder|shadow)-([A-Za-z][A-Za-z0-9-]*)$/;
const VAR_REF = /var\(\s*--([A-Za-z0-9_-]+)/g;
const THEME_CALL = /\btheme\s*\(/g;
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\s*\(/g;
const CLASS_ATTR = /(?<![\w-])(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const MODULE_IMPORT = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']*\.module\.(?:css|scss|sass|less)["']/g;

/** True for every character that sits inside a string or a template literal (the quotes included). */
function stringMask(text: string): Uint8Array {
  const mask = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c !== '"' && c !== "'" && c !== "`") continue;
    const start = i;
    for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    mask.fill(1, start, Math.min(i + 1, text.length));
  }
  return mask;
}

/** Index just past the `)` that closes the call opened at `open`, reading strings so a `)` inside one does not close it; -1 when unclosed. */
function closeOf(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return -1;
}

/** The source with comments and every helper call blanked (same length and lines), and how many calls were blanked. */
export function blankHelperCalls(source: string): { text: string; calls: number } {
  let text = blankDelimited(blankDelimited(source, "<!--", "-->", spaces), "/*", "*/", spaces).replace(/(^|\s)\/\/[^\n]*/g, (m) => spaces(m));
  const inString = stringMask(text);
  let calls = 0;
  for (let from = 0; ;) {
    HELPER.lastIndex = from;
    const m = HELPER.exec(text);
    if (m === null) break;
    if (inString[m.index] === 1) { from = m.index + m[0].length; continue; } // a helper name inside a string counts nothing
    const open = m.index + m[0].length - 1;
    const end = closeOf(text, open);
    if (end === -1) { from = open + 1; continue; }
    text = text.slice(0, m.index) + spaces(text.slice(m.index, end)) + text.slice(end);
    calls++;
    from = end;
  }
  return { text, calls };
}

export interface StyleReading { tokens: string[]; unresolvedStyles: number; unresolved: StyleBreakdown; utilitiesNamingNoToken: number }

/** A class token without its variants (`hover:`), important mark and opacity modifier (`/50`, `/[.5]`). */
const bareUtility = (token: string): string => lastOutsideBrackets(token).replace(/^!/, "").replace(/\/(?:\d+|\[[^\]]*\])$/, "");

/** The class tokens of one class list. Like the shared `classTokens`, but a leading `[` is kept: `[color:red]` is an arbitrary property. */
const classTokens = (value: string): string[] => value.split(/[\s,]+/)
  .map((t) => t.replace(/^[^\w!:[-]+|[^\w\]-]+$/g, ""))
  .map((t) => (t.includes("[") ? t : t.replace(/\]+$/, "")))
  .filter((t) => t !== "" && !/^_+$/.test(t));

/** The part after the last `:` that is not inside `[...]`: `hover:[color:red]` is the arbitrary property `[color:red]`. */
function lastOutsideBrackets(token: string): string {
  let depth = 0; let cut = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++; else if (c === "]") depth = Math.max(0, depth - 1); else if (c === ":" && depth === 0) cut = i + 1;
  }
  return token.slice(cut);
}

export function readStyleReferences(file: string, source: string, lookup: TokenLookup): StyleReading {
  const { text, calls } = blankHelperCalls(source);
  const inString = stringMask(text);
  const tokens = new Set<string>();
  const unresolved = emptyBreakdown();
  unresolved.helperCall = calls;
  let utilitiesNamingNoToken = 0;
  const resolveVars = (piece: string): void => {
    for (const m of piece.matchAll(VAR_REF)) {
      const path = lookup.resolve(m[1] as string);
      if (path === null) unresolved.customProperty++; else tokens.add(path);
    }
  };
  // Style records (a style block, an inline style, a style object): custom properties, theme() calls and literal colours.
  for (const rec of extractUiRecords(file, text).filter((r) => r.markup === "" && r.styles !== "")) {
    resolveVars(rec.styles);
    unresolved.themeCall += [...rec.styles.matchAll(THEME_CALL)].length;
    unresolved.literalColor += [...rec.styles.matchAll(LITERAL_COLOR)].length;
  }
  // Class attributes only: a plain string constant is not a class list.
  for (const m of text.matchAll(CLASS_ATTR)) {
    if (inString[m.index as number] === 1) continue; // `className="…"` written inside a string is documentation, not markup
    for (const cls of classTokens((m[1] ?? m[2] ?? m[3]) as string)) {
      if (cls.includes("var(")) { resolveVars(cls); continue; }
      if (cls.includes("theme(")) { unresolved.themeCall++; continue; }
      const utility = bareUtility(cls);
      if (utility.includes("[")) { if (/^[a-z][a-z0-9-]*-\[.+\]$/i.test(utility) || /^\[[a-z-]+:.+\]$/i.test(utility)) unresolved.arbitraryValue++; continue; }
      const key = THEME_KEY.exec(utility)?.[1];
      if (key === undefined) continue;
      const path = lookup.resolve(`color-${key}`);
      if (path !== null) tokens.add(path);
      else if (lookup.answers(`color-${key}`) > 1) unresolved.ambiguousToken++;
      else utilitiesNamingNoToken++;
    }
  }
  // A class taken from a CSS module: `className={styles.title}` names a class the module defines, which is no token.
  const bindings = [...text.matchAll(MODULE_IMPORT)].map((m) => m[1] as string);
  for (const b of bindings) unresolved.cssModuleClass += [...text.matchAll(new RegExp(`\\b(?:class|className)\\s*=\\s*\\{\\s*${b.replace(/\$/g, "\\$")}\\s*[.\\[]`, "g"))].length;
  return { tokens: [...tokens].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), unresolvedStyles: sumBreakdown(unresolved), unresolved, utilitiesNamingNoToken };
}
