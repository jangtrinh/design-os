/**
 * dumb-punctuation (warning) — the smart-punctuation floor for shipped copy
 * (interfaces.dev cheat sheet: curly quotes, the single ellipsis character).
 * Typeset copy uses `…` `’` `“ ”`; typewriter substitutes (`...`, `'`, `"`) read
 * as unfinished. Only VISIBLE prose is scanned: scripts, styles, tags, attribute
 * values AND the code containers `<pre>/<code>/<kbd>/<samp>` are blanked first
 * (newline-preserving, so reported line numbers point at the ORIGINAL source —
 * the same offset discipline as stripCommentsPreservingOffsets). Prime/inch
 * marks after a digit (8"x10") are correct straight-quote usage and never flag;
 * a quote pair may not span a sentence boundary (.!? inside disqualifies it).
 * Split from content-checks.ts to keep that module under the 200-line guideline;
 * registered alongside the rest in `allContentChecks`.
 */
import { lineAt } from "./a11y-lint.js";
import type { ContentFinding } from "./content-checks.js";

/** Blank a region to spaces, keeping newlines so byte offsets stay line-true. */
const blank = (m: string): string => m.replace(/[^\n]/g, " ");

/** Visible prose with scripts/styles/code containers/tags blanked, offsets preserved. */
function visibleProse(html: string): string {
  return html
    .replace(/<(script|style|pre|code|kbd|samp)\b[\s\S]*?<\/\1\s*>/gi, blank)
    .replace(/<[^>]*>/g, blank);
}

/** A straight apostrophe doing a contraction's job: letter'(s|t|re|ll|ve|d|m). */
const STRAIGHT_CONTRACTION = /[a-z]'(?=(?:s|t|re|ll|ve|d|m)\b)/gi;
/**
 * A straight-double-quoted phrase in copy: short, single line, no sentence
 * boundary inside, and not a prime mark (opening quote never follows a digit).
 */
const STRAIGHT_QUOTE_PAIR = /(?<!\d)"[^"\n<>.!?]{1,60}"/g;

export function checkDumbPunctuation(html: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = visibleProse(html);
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
