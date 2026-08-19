/**
 * Shared helpers for the deterministic taste-check modules
 * (taste-checks.ts, taste-checks-motion.ts, taste-checks-consistency.ts).
 * Pure string utilities — no fs, no DOM.
 */

/** Return 1-based line number for a match at byte offset `idx`. */
export function lineOf(html: string, idx: number): number {
  return html.slice(0, idx).split("\n").length;
}

/**
 * Replace each HTML comment with an equal-length run of spaces so byte offsets
 * (and line numbers) stay correct after stripping. Commented-out markup must
 * never trip a heuristic check. One definition for every linter family —
 * a11y-lint gained the third consumer, which is the extract-the-helper line.
 */
export function stripCommentsPreservingOffsets(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length));
}

/**
 * Extract the text inside `<style>…</style>` blocks plus all `style="…"`
 * inline attribute values — i.e. everywhere a CSS declaration can live.
 * Used by checks that must not match CSS-like substrings in body copy.
 */
export function cssRegions(html: string): string {
  const parts: string[] = [];
  const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleBlock.exec(html)) !== null) parts.push(m[1] ?? "");
  const inline = /style\s*=\s*["']([^"']*)["']/gi;
  while ((m = inline.exec(html)) !== null) parts.push(m[1] ?? "");
  return parts.join("\n");
}

/** One flat `selector { body }` pair from CSS text. */
export interface CssRule {
  selector: string;
  body: string;
}

/**
 * Flat rule pairs from CSS text. Because the regex body class is `[^{}]*` (never
 * crosses a brace), nested at-rules (`@media`) yield their INNER rules rather
 * than the wrapper; `@keyframes` stops (`0% { … }`) also surface as rules whose
 * "selector" is the stop — the caller filters selectors it does not care about.
 * A heuristic, not a CSS parser. Rules are returned in source order; selector
 * and body are trimmed. Empty bodies are kept (harmless).
 */
export function cssRules(css: string): CssRule[] {
  const out: CssRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out.push({ selector: (m[1] ?? "").trim(), body: (m[2] ?? "").trim() });
  }
  return out;
}

/**
 * True when the SUBJECT (rightmost compound) of any comma-separated selector is a
 * root element — `html`/`body` (with optional class/attr/pseudo, but not
 * `.body-text`) or `:root`.
 *
 * The subject is what a rule actually styles, so `html.js .ln { … }` targets
 * `.ln`, NOT the root. Matching anywhere in the selector instead reads every
 * `html…`/`body…`-prefixed DESCENDANT rule — `body.dark .card` is the common one —
 * as a root rule.
 *
 * Lives here because two checks need the same answer and each grew its own
 * prefix-matching regex: `root-overflow-x-hidden` in layout-checks-viewport, and
 * the colour-mode root scan in taste-checks-invisible-surface. Fixing one and not
 * the other is how a repaired bug walks back in through the sibling.
 *
 * Known limit: a root wrapped in a functional pseudo — `:is(body)`, `:where(html)`
 * — is not recognised. Rare enough to accept; stated so the next reader does not
 * mistake it for an oversight.
 */
export function selectorSubjectIsRoot(selector: string): boolean {
  return selector.split(",").some((part) => {
    const compounds = part.trim().split(/[\s>+~]+/);
    const subject = compounds[compounds.length - 1] ?? "";
    return /^(?:html|body)(?![\w-])/i.test(subject) || /^:root(?![\w-])/i.test(subject);
  });
}
