/**
 * token-coverage-extract.ts — pulls category-scoped CSS declarations out of a
 * page's own CSS (inline style="", <style> blocks, and — via a separate call
 * per file — linked stylesheets), the same regex-scan class as ds-usage-lint.ts
 * (not a CSS parser). Token-DECLARATION blocks (:root/@theme/[data-theme]/.dark,
 * css-selector-mode.ts's shared base/mode table) are stripped first — they hold
 * the token LITERALS themselves, not usage to grade.
 */
import { computeSelectorBlocks } from "./css-selector-blocks.js";
import { classifySelector } from "./css-selector-mode.js";
import { lineOf } from "./line-index.js";

export type TokenCoverageCategory =
  | "color"
  | "font-family"
  | "font-size"
  | "spacing"
  | "radius"
  | "shadow";

export interface CoverageDeclaration {
  category: TokenCoverageCategory;
  property: string;
  value: string;
  /** 1-based line number within the source text passed to extractDeclarations. */
  line: number;
}

// Longest-alternative-first within each group so a longer sibling
// (e.g. "background-color") wins over its shorter prefix ("background").
const CATEGORY_PROPS: ReadonlyArray<[TokenCoverageCategory, RegExp]> = [
  ["shadow", /\b(box-shadow|text-shadow)\s*:\s*([^;{}]+)[;}]/gi],
  ["color", /\b(background-color|outline-color|border-color|background|border|color|fill|stroke)\s*:\s*([^;{}]+)[;}]/gi],
  ["font-family", /\b(font-family)\s*:\s*([^;{}]+)[;}]/gi],
  ["font-size", /\b(font-size)\s*:\s*([^;{}]+)[;}]/gi],
  ["spacing", /\b(margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap)\s*:\s*([^;{}]+)[;}]/gi],
  ["radius", /\b(border-radius)\s*:\s*([^;{}]+)[;}]/gi],
];

/** Blank a matched span to same-length spaces so byte offsets survive (mirrors taste-lint / ds-usage-lint). */
function blank(s: string, re: RegExp): string {
  return s.replace(re, (m) => " ".repeat(m.length));
}

/** :root / @theme / [data-theme=…] / .dark — the shared base/mode table doubles
 * as "is this a token-declaration block" (same convention as ds-usage-lint.ts). */
function isDeclarationSelector(selector: string): boolean {
  return classifySelector(selector).kind !== "unmapped";
}

/**
 * Scan one CSS source for category declarations, excluding token-declaration
 * blocks. `isHtmlSource` selects the same isolate-to-<style>-tags behavior
 * `computeSelectorBlocks` already implements for full HTML documents — for a
 * standalone linked stylesheet file, pass false so its whole body is scanned
 * as plain CSS. Category regexes run over the WHOLE text either way (mirrors
 * ds-usage-lint.ts), so an inline `style="color: #ff0000;"` attribute value
 * is picked up incidentally when it ends in `;`.
 */
export function extractDeclarations(text: string, isHtmlSource: boolean): CoverageDeclaration[] {
  const scan = blank(blank(text, /<!--[\s\S]*?-->/g), /\/\*[\s\S]*?\*\//g);
  const blocks = computeSelectorBlocks(scan, isHtmlSource);
  const declRanges = blocks.filter((b) => isDeclarationSelector(b.selector));
  const inDeclRange = (idx: number): boolean => declRanges.some((b) => b.start <= idx && idx < b.end);

  const out: CoverageDeclaration[] = [];
  for (const [category, re] of CATEGORY_PROPS) {
    for (const m of scan.matchAll(re)) {
      const idx = m.index ?? 0;
      if (inDeclRange(idx)) continue;
      out.push({
        category,
        property: (m[1] as string).toLowerCase(),
        value: (m[2] as string).trim(),
        line: lineOf(text, idx),
      });
    }
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}
