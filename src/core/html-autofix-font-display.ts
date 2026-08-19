/**
 * font-display-swap — the autofix half of `font-display-missing` (the one floor
 * the born-passing A/B could not move by teaching: 6→6 across arms, because a
 * generator picks fonts before it thinks about loading behaviour). Gated by the
 * same checker that reports the finding; CSS/attribute rewrites only:
 *   - an `@font-face` block with no `font-display` descriptor gains
 *     `font-display: swap;` as its first declaration (an author's existing
 *     choice — swap/optional/fallback/block — is already respected by the
 *     checker, so this repair never sees it);
 *   - a Google-Fonts stylesheet `<link>` with no `display=` param gets
 *     `&display=swap` (or `?display=swap`) appended to its href.
 * Both edits are located on the non-markup mask, so a code sample quoting a
 * font link or an @font-face is never rewritten.
 */
import { checkFontDisplayMissing } from "./layout-checks-craft.js";

/** Blank to spaces, length- and newline-preserving (offsets stay valid). */
const blankPreserving = (m: string): string => m.replace(/[^\n]/g, " ");

/** Markup only: script/pre/code/kbd/samp regions and comments blanked. */
function markupOnly(html: string): string {
  return html
    .replace(/<(script|pre|code|kbd|samp)\b[\s\S]*?<\/\1\s*>/gi, blankPreserving)
    .replace(/<!--[\s\S]*?-->/g, blankPreserving);
}

export function fixFontDisplaySwap(html: string): { html: string; applied: boolean } {
  if (checkFontDisplayMissing(html).length === 0) return { html, applied: false };
  const mask = markupOnly(html);
  const edits: Array<{ at: number; insert: string } | { start: number; end: number; text: string }> = [];

  // @font-face blocks lacking the descriptor — insert right after the brace so
  // the edit cannot disturb existing declarations or trailing comments.
  for (const m of mask.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    if (/font-display\s*:/i.test(m[1] ?? "")) continue;
    const braceAt = m.index + m[0].indexOf("{");
    edits.push({ at: braceAt + 1, insert: " font-display: swap;" });
  }

  // Google-Fonts hrefs with no display= param.
  for (const m of mask.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/gi)) {
    const href = m[1] ?? "";
    if (/[?&]display=/i.test(href)) continue;
    const hrefStart = m.index + m[0].indexOf(href);
    const suffix = href.includes("?") ? "&display=swap" : "?display=swap";
    edits.push({ start: hrefStart, end: hrefStart + href.length, text: href + suffix });
  }

  if (edits.length === 0) return { html, applied: false };
  // Apply end-to-start so earlier offsets stay valid (mask is length-preserving).
  let fixed = html;
  const ordered = edits
    .map((e) => ("at" in e ? { pos: e.at, apply: (s: string) => s.slice(0, e.at) + e.insert + s.slice(e.at) } : { pos: e.start, apply: (s: string) => s.slice(0, e.start) + e.text + s.slice(e.end) }))
    .sort((a, b) => b.pos - a.pos);
  for (const e of ordered) fixed = e.apply(fixed);
  return { html: fixed, applied: true };
}
