/**
 * The token references of one component's own source (spec 033 FR-019, CD-5). A reference is resolved only EXACTLY:
 *  - `var(--name)` in a style, an inline style object or a class value names one custom property; it resolves when
 *    exactly one token of the sealed store carries that name (`--color-primary` is `color.primary`, and a store ingested
 *    from CSS names the same token `color.color-primary`: both spellings are tried and more than one hit is no hit);
 *  - a theme-key utility (`bg-primary`, `text-ink`) resolves to the colour token `--color-<key>` when exactly one
 *    token has that name; a utility that names no token (`px-4`, `text-sm`) is not a reference and is not counted.
 * A reference that resolves to no token is counted in `unresolvedStyles`, never mapped to the nearest token. Classes
 * composed through a helper call (`cn(...)`, `clsx(...)`, `cva(...)`, `twMerge(...)`) are counted as one unresolved
 * style per call and resolve nothing: this spec sets no resolution rule for them. Without a store nothing resolves.
 */
import type { TokenTree } from "../token-model.js";
import { extractUiRecords } from "../polyglot-ui-extractor.js";
import { spaces } from "../polyglot-ui-scans.js";

export interface TokenLookup {
  /** The one token path a custom-property name resolves to, or null (none, or more than one). Name without the dashes. */
  resolve(customProperty: string): string | null;
}

export function buildTokenLookup(tree: TokenTree | undefined): TokenLookup {
  const byName = new Map<string, Set<string>>();
  const note = (name: string, path: string): void => { const s = byName.get(name) ?? new Set<string>(); s.add(path); byName.set(name, s); };
  for (const [group, leaves] of Object.entries(tree ?? {})) {
    for (const leaf of Object.keys(leaves)) {
      note(leaf, `${group}.${leaf}`);
      note(`${group}-${leaf}`, `${group}.${leaf}`);
    }
  }
  return { resolve: (name) => { const hit = byName.get(name); return hit !== undefined && hit.size === 1 ? ([...hit][0] as string) : null; } };
}

const HELPER = /\b(?:cn|clsx|cva|twMerge|twJoin|classNames|classnames)\s*\(/g;
const THEME_KEY = /^(?:bg|text|border|fill|stroke|ring|outline|divide|from|via|to|accent|caret|decoration|placeholder|shadow)-([A-Za-z][A-Za-z0-9-]*)$/;
const VAR_REF = /var\(\s*--([A-Za-z0-9_-]+)/g;

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

/** The source with every helper call blanked (same length and lines), and how many calls were blanked. */
export function blankHelperCalls(source: string): { text: string; calls: number } {
  let text = source;
  let calls = 0;
  for (let from = 0; ;) {
    HELPER.lastIndex = from;
    const m = HELPER.exec(text);
    if (m === null) break;
    const open = m.index + m[0].length - 1;
    const end = closeOf(text, open);
    if (end === -1) { from = open + 1; continue; }
    text = text.slice(0, m.index) + spaces(text.slice(m.index, end)) + text.slice(end);
    calls++;
    from = end;
  }
  return { text, calls };
}

export interface StyleReading { tokens: string[]; unresolvedStyles: number }

export function readStyleReferences(file: string, source: string, lookup: TokenLookup): StyleReading {
  const { text, calls } = blankHelperCalls(source);
  const tokens = new Set<string>();
  let unresolved = calls;
  // The first record of the extractor is the whole source as markup; only the style and class records are read here.
  for (const rec of extractUiRecords(file, text).filter((r) => r.markup === "")) {
    const candidates = [rec.styles, ...rec.classes];
    for (const piece of candidates) {
      for (const m of piece.matchAll(VAR_REF)) {
        const path = lookup.resolve(m[1] as string);
        if (path === null) unresolved++; else tokens.add(path);
      }
    }
    for (const cls of rec.classes) {
      if (cls.includes("var(") || cls.includes("[")) continue;
      const key = THEME_KEY.exec((cls.split(":").pop() as string).replace(/^!/, "").replace(/\/\d+$/, ""))?.[1];
      const path = key === undefined ? null : lookup.resolve(`color-${key}`);
      if (path !== null) tokens.add(path);
    }
  }
  return { tokens: [...tokens].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), unresolvedStyles: unresolved };
}
