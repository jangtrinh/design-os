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
import type { DsUsageFinding } from "./ds-usage-lint.js";

// Longest-alternative-first so "background-color"/"border-color" win over their
// shorter prefix siblings at the same start position.
//
// A value runs to the next `;` or `}` or, in an inline `style="..."` that ends without a `;`, to the
// closing quote. It never crosses `<` or `>`: without that bound `style="color:var(--x)"` ran on through
// the tag into page text up to the next `;` (a `&middot;` entity) and read a hex in a swatch label as a
// hardcoded colour. `cutValue` then ends the value at the quote that closes the attribute.
const COLOR_PROPS_RE = new RegExp(
  String.raw`\b(box-shadow|text-shadow|background-color|outline-color|border-color|background|border|color|fill|stroke)\s*:\s*([^;{}<>]+)(?=[;}<>])`,
  "gi",
);

/**
 * The part of a matched value that belongs to the declaration. A value that opens with a quote is a
 * string literal (`color:'#8A93A3'` in a JS object) and is that string. Otherwise the value ends at the
 * first quote outside parentheses: that is the quote closing an inline `style="..."`, and whatever
 * follows it (`title="#ff0000"`) is another attribute. A quote inside parentheses (`url("a.png")`)
 * belongs to the value, at any nesting depth.
 */
function cutValue(raw: string): string {
  const v = raw.trimStart();
  const first = v[0];
  if (first === '"' || first === "'") {
    const end = v.indexOf(first, 1);
    return end === -1 ? v : v.slice(0, end + 1);
  }
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if ((c === '"' || c === "'") && depth === 0) return v.slice(0, i);
  }
  return v;
}
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
}

export function analyse(text: string, isHtml: boolean): Analysed {
  // Blank both comment kinds (CSS /* */ and HTML <!-- -->) so a commented-out
  // reference or hex never trips a check. Same-length spans; offsets hold.
  const scan = blank(blank(text, /<!--[\s\S]*?-->/g), /\/\*[\s\S]*?\*\//g);
  const blocks = computeSelectorBlocks(scan, isHtml);
  const declRanges = blocks.filter((b) => isDeclarationSelector(b.selector));
  return { text, scan, blocks, declRanges, inDeclRange: (idx) => declRanges.some((b) => b.start <= idx && idx < b.end) };
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
export function colourAndTokenFindings(a: Analysed, declaredVars: ReadonlySet<string>, pageVars: ReadonlySet<string>): DsUsageFinding[] {
  const { text, scan, inDeclRange } = a;
  const findings: DsUsageFinding[] = [];

  // ── var(--x) usage, component CSS only (decl-block usage is the alias layer itself) ──
  for (const m of scan.matchAll(VAR_RE)) {
    const idx = m.index ?? 0;
    if (inDeclRange(idx)) continue;
    const name = m[1] as string;
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
  for (const m of scan.matchAll(COLOR_PROPS_RE)) {
    const idx = m.index ?? 0;
    if (inDeclRange(idx)) continue;
    const prop = (m[1] as string).toLowerCase();
    const value = cutValue(m[2] as string).trim();
    const hexHit = HEX_RE.exec(value)?.[0];
    const fnHit = COLOR_FN_RE.exec(value)?.[0];
    const literal = hexHit ?? fnHit;
    if (literal === undefined) continue;
    findings.push({
      checkId: "hardcoded-color",
      severity: "error",
      message: `hardcoded colour '${literal}' in '${prop}' — the DS covers colour; style with a token instead.`,
      line: lineOf(text, idx),
    });
  }
  return findings;
}
