/**
 * ds-usage-css-checks.ts - the v1 ds-usage algorithm over ONE CSS-bearing text: undeclared-token,
 * off-system-token and hardcoded-color (see ds-usage-lint.ts for the contract and its honesty floor).
 *
 *   1. Locate every `{ ... }` block (css-selector-blocks.ts) and classify each selector (the shared
 *      base/mode table, css-selector-mode.ts): `:root` / `@theme` / `html` / `body` / `[data-theme=...]` /
 *      `.dark` are token-DECLARATION blocks - they legitimately hold colour/dimension LITERALS (they
 *      ARE the token definitions). Their custom-property NAMES still count as "declared on the page"
 *      (for the off-system check); their bodies are excluded from every check.
 *   2. In the remaining (component) CSS:
 *      - undeclared-token (error):   var(--x) declared nowhere - not a DS token, not on the page.
 *      - off-system-token (warning): var(--x) the PAGE declares itself but the DS does not - the
 *        model invented a token; visible, not build-breaking (an incomplete DS legitimately forces
 *        invention - the linter's job is to surface it, not fail the build).
 *      - hardcoded-color (error): a hex / rgb() / rgba() / hsl() / hsla() literal in a colour-bearing
 *        property (color, background(-color), border(-color), outline-color, fill, stroke, box-shadow,
 *        text-shadow).
 */
import { computeSelectorBlocks } from "./css-selector-blocks.js";
import type { CssBlock } from "./css-selector-blocks.js";
import { classifySelector } from "./css-selector-mode.js";
import { lineOf } from "./line-index.js";
import { readElementBodies } from "./polyglot-ui-scans.js";
import type { DsUsageFinding } from "./ds-usage-lint.js";

// Longest-alternative-first so "background-color"/"border-color" win over their
// shorter prefix siblings at the same start position.
const COLOR_PROP_RE =
  /\b(box-shadow|text-shadow|background-color|outline-color|border-color|background|border|color|fill|stroke)\s*:/gi;
const INLINE_STYLE_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/**
 * The ranges `[start, end)` of an HTML text where CSS lives, sorted by start: the bodies of `<style>`
 * and `<script>` elements and the values of `style="..."` attributes. A colour-looking `color: #xxx`
 * anywhere else is page text, an attribute's prose or a code sample, not styling.
 */
function cssBearingRanges(scan: string): [number, number][] {
  const ranges: [number, number][] = [];
  const add = (offset: number, body: string): void => void ranges.push([offset, offset + body.length]);
  readElementBodies(scan, "style", add);
  readElementBodies(scan, "script", add);
  for (const m of scan.matchAll(INLINE_STYLE_RE)) {
    const value = m[1] ?? m[2] ?? "";
    const end = (m.index ?? 0) + m[0].length - 1; // the closing quote
    ranges.push([end - value.length, end]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * Where the value that starts at `from` ends. It stops at `;`, `{` or `}`; at a `<` or `>` outside
 * parentheses (a value never runs on into the next tag: without that bound `style="color:var(--x)"`
 * read through the tag into the page text up to the next `;`, an `&middot;` entity, and took a hex in
 * a swatch label for a hardcoded colour); and at `limit`, the end of the CSS-bearing range it sits in. A
 * quote anywhere else is part of the value (`url("a.png")`, a script object's `'#fff'`). One pass.
 */
function valueEnd(scan: string, from: number, limit: number): number {
  let depth = 0;
  for (let i = from; i < limit; i++) {
    const c = scan[i];
    if (c === ";" || c === "{" || c === "}") return i;
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === "<" || c === ">")) return i;
  }
  return limit;
}

/** An interpolated name (`var(--${x})`) reaches the linters as a run of underscores; no real token has three in a row. */
const isDynamicName = (name: string): boolean => name.includes("___");
const VAR_RE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[^)]*)?\)/g;
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/;
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\s*\([^)]*\)/i;
const CUSTOM_PROP_DECL_RE = /(--[a-zA-Z0-9_-]+)\s*:/g;

/** Blank a matched span to same-length spaces so byte offsets survive (mirrors taste-lint). */
function blank(s: string, re: RegExp): string {
  return s.replace(re, (m) => " ".repeat(m.length));
}

/** :root / @theme / [data-theme=…] / .dark — the shared base/mode table (css-selector-mode.ts)
 * doubles as "is this a token-declaration block", since those are exactly the selectors a
 * compiled DS (or its own semantic-alias layer) declares custom properties under. */
function isDeclarationSelector(selector: string): boolean {
  return classifySelector(selector).kind !== "unmapped";
}

/** One CSS-bearing text, comment-blanked, with its declaration blocks located. */
export interface Analysed {
  text: string;
  scan: string;
  blocks: CssBlock[];
  declRanges: CssBlock[];
  inDeclRange: (idx: number) => boolean;
  /** HTML only: where CSS lives (see {@link cssBearingRanges}); undefined = the whole text is CSS. */
  cssRanges?: [number, number][];
}

export function analyse(text: string, isHtml: boolean): Analysed {
  // Blank both comment kinds (CSS /* */ and HTML <!-- -->) so a commented-out
  // reference or hex never trips a check. Same-length spans; offsets hold.
  const scan = blank(blank(text, /<!--[\s\S]*?-->/g), /\/\*[\s\S]*?\*\//g);
  const blocks = computeSelectorBlocks(scan, isHtml);
  const declRanges = blocks.filter((b) => isDeclarationSelector(b.selector));
  return {
    text, scan, blocks, declRanges,
    inDeclRange: (idx) => declRanges.some((b) => b.start <= idx && idx < b.end),
    ...(isHtml && { cssRanges: cssBearingRanges(scan) }),
  };
}

/** Every custom-property NAME the text itself declares in a decl block — literal or
 * alias value both count; only the name matters for off-system. */
export function pageDeclaredVarsOf(a: Analysed): Set<string> {
  const names = new Set<string>();
  for (const b of a.declRanges) {
    for (const m of a.scan.slice(b.start, b.end).matchAll(CUSTOM_PROP_DECL_RE)) names.add(m[1] as string);
  }
  return names;
}

/** The v1 colour + token algorithm over one CSS-bearing text (lines are relative to it). */
export function colourAndTokenFindings(
  a: Analysed,
  declaredVars: ReadonlySet<string>,
  pageVars: ReadonlySet<string>,
): { findings: DsUsageFinding[]; dynamicVarCount: number } {
  const { text, scan, inDeclRange } = a;
  const findings: DsUsageFinding[] = [];
  let dynamicVarCount = 0;

  // ── var(--x) usage, component CSS only (decl-block usage is the alias layer itself) ──
  for (const m of scan.matchAll(VAR_RE)) {
    const idx = m.index ?? 0;
    if (inDeclRange(idx)) continue;
    const name = m[1] as string;
    if (isDynamicName(name)) { dynamicVarCount++; continue; } // built at build time: counted, not judged
    if (declaredVars.has(name)) continue; // real DS token — fine
    const line = lineOf(text, idx);
    if (pageVars.has(name)) {
      findings.push({
        checkId: "off-system-token",
        severity: "warning",
        message: `${name} is not in the project design system — add via 'ui ds change-token' or it dies with the page.`,
        line,
      });
    } else {
      findings.push({
        checkId: "undeclared-token",
        severity: "error",
        message: `var(${name}) is declared nowhere — not a DS token, not in the page's own :root/@theme/[data-theme]/.dark. Broken reference.`,
        line,
      });
    }
  }

  // ── hardcoded colour literal in a colour-bearing property, component CSS only ──
  const ranges = a.cssRanges;
  let r = 0;
  COLOR_PROP_RE.lastIndex = 0;
  for (let m = COLOR_PROP_RE.exec(scan); m !== null; m = COLOR_PROP_RE.exec(scan)) {
    const idx = m.index;
    const start = idx + m[0].length;
    let limit = scan.length;
    if (ranges !== undefined) {
      while (r < ranges.length && (ranges[r] as [number, number])[1] <= idx) r++;
      const range = ranges[r];
      if (range === undefined || range[0] > idx) continue; // page text, not styling
      limit = range[1];
    }
    const end = valueEnd(scan, start, limit);
    COLOR_PROP_RE.lastIndex = end; // the value is consumed: a property inside it is not a second declaration
    if (inDeclRange(idx)) continue;
    const prop = (m[1] as string).toLowerCase();
    const value = scan.slice(start, end).trim();
    const literal = HEX_RE.exec(value)?.[0] ?? COLOR_FN_RE.exec(value)?.[0];
    if (literal === undefined) continue;
    findings.push({
      checkId: "hardcoded-color",
      severity: "error",
      message: `hardcoded colour '${literal}' in '${prop}' — the DS covers colour; style with a token instead.`,
      line: lineOf(text, idx),
    });
  }
  return { findings, dynamicVarCount };
}
