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
