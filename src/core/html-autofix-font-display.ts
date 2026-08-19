/**
 * font-display-swap — the autofix half of `font-display-missing` (the one floor
 * the born-passing A/B could not move by teaching: 6→6 per arm, because a
 * generator picks fonts before it thinks about loading behaviour; the same 12
 * A/B files went 12→0 findings in one pass of this repair).
 *
 * ONE mask contract with the checker (stage-4 ruling): both sides read
 * `blankDeadMarkup` — scripts and comments are dead, elements inside
 * <pre>/<code> are LIVE (the HTML parser instantiates them). The repair's
 * surfaces are exactly the checker's:
 *   - @font-face inside real CSS regions ONLY (<style> blocks + style=""
 *     attributes — never prose that quotes CSS in a paragraph) gains
 *     `font-display: swap;` as its first declaration; an author's existing
 *     choice is respected by the shared checker gate.
 *   - a Google-Fonts STYLESHEET <link> (rel~=stylesheet — a preconnect hint to
 *     the fonts origin is correct markup and untouchable) with no
 *     `display=`/`&amp;display=` param gets `display=swap` appended, located
 *     via /d capture indices so a duplicate URL in another attribute can never
 *     receive the edit.
 */
import { checkFontDisplayMissing } from "./layout-checks-craft.js";
import { blankDeadMarkup } from "./taste-checks-shared.js";

interface Edit { start: number; end: number; text: string }

/** Real CSS spans (offsets into the document): <style> inners + style="" values. */
function cssSpans(mask: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of mask.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const inner = m[1] ?? "";
    const start = m.index + m[0].indexOf(inner);
    out.push({ start, end: start + inner.length });
  }
  for (const m of mask.matchAll(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gid)) {
    const idx = (m as RegExpMatchArray & { indices: Array<[number, number]> }).indices;
    const group = m[2] !== undefined ? 2 : 3;
    const span = idx[group];
    if (span !== undefined) out.push({ start: span[0], end: span[1] });
  }
  return out;
}

export function fixFontDisplaySwap(html: string): { html: string; applied: boolean } {
  if (checkFontDisplayMissing(html).length === 0) return { html, applied: false };
  const mask = blankDeadMarkup(html);
  const edits: Edit[] = [];

  // @font-face blocks lacking the descriptor — real CSS regions only. Insert
  // right after the brace so existing declarations are never disturbed.
  for (const span of cssSpans(mask)) {
    const css = mask.slice(span.start, span.end);
    for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      if (/font-display\s*:/i.test(m[1] ?? "")) continue;
      const braceAt = span.start + m.index + m[0].indexOf("{");
      edits.push({ start: braceAt + 1, end: braceAt + 1, text: " font-display: swap;" });
    }
  }

  // Google-Fonts stylesheet hrefs with no display= param. /d capture indices
  // locate the href VALUE itself — a duplicate URL elsewhere in the tag can
  // never receive the edit (the indexOf class of bug, reviewed out).
  for (const m of mask.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/gid)) {
    if (!/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(m[0])) continue;
    const href = m[1] ?? "";
    if (/[?&](?:amp;)?display=/i.test(href)) continue;
    const span = (m as RegExpMatchArray & { indices: Array<[number, number]> }).indices[1];
    if (span === undefined) continue;
    const suffix = href.includes("?") ? "&display=swap" : "?display=swap";
    edits.push({ start: span[0], end: span[1], text: href + suffix });
  }

  if (edits.length === 0) return { html, applied: false };
  // Apply end-to-start; skip any edit overlapping one already applied (defensive
  // — overlaps would mean two rules claimed one span; a miss beats corruption).
  edits.sort((a, b) => b.start - a.start);
  let fixed = html;
  let appliedFloor = Number.POSITIVE_INFINITY;
  let applied = false;
  for (const e of edits) {
    if (e.end > appliedFloor) continue;
    fixed = fixed.slice(0, e.start) + e.text + fixed.slice(e.end);
    appliedFloor = e.start;
    applied = true;
  }
  return { html: applied ? fixed : html, applied };
}
