/**
 * dumb-punctuation (warning) — the smart-punctuation floor for shipped copy
 * (interfaces.dev cheat sheet: curly quotes, the single ellipsis character).
 * Typeset copy uses `…` `’` `“ ”`; typewriter substitutes (`...`, `'`, `"`) read
 * as unfinished. Only VISIBLE text is scanned — scripts, styles, tags and
 * attribute values are stripped first, so code samples and HTML syntax never
 * fire. Split from content-checks.ts to keep that module under the 200-line
 * guideline; registered alongside the rest in `allContentChecks`.
 */
import { lineAt } from "./a11y-lint.js";
import type { ContentFinding } from "./content-checks.js";

/** Visible copy with tags/scripts/styles blanked (single-space per region, like all-caps-shout). */
function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

/** A straight apostrophe doing a contraction's job: letter'(s|t|re|ll|ve|d|m). */
const STRAIGHT_CONTRACTION = /[a-z]'(?=(?:s|t|re|ll|ve|d|m)\b)/gi;
/** A straight-double-quoted phrase (short, single line — a quote pair in copy, not stray marks). */
const STRAIGHT_QUOTE_PAIR = /"[^"\n<>]{1,60}"/g;

export function checkDumbPunctuation(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = visibleText(html);
  for (const m of text.matchAll(/\.{3,}/g)) {
    out.push({ checkId: "dumb-punctuation", severity: "warning",
      message: `"${m[0]}" — use the single ellipsis character (…), not consecutive dots`, line: lineAt(text, m.index) });
  }
  for (const m of text.matchAll(STRAIGHT_CONTRACTION)) {
    out.push({ checkId: "dumb-punctuation", severity: "warning",
      message: "straight apostrophe in a contraction — use the typographic apostrophe (’)", line: lineAt(text, m.index) });
  }
  for (const m of text.matchAll(STRAIGHT_QUOTE_PAIR)) {
    out.push({ checkId: "dumb-punctuation", severity: "warning",
      message: `${m[0].slice(0, 40)} — use curly quotes (“ ”), not straight quotes, in copy`, line: lineAt(text, m.index) });
  }
  return out;
}
