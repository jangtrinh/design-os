/**
 * Floor repairs — deterministic autofixes for three interface-craft floors the
 * linters enforce. Each repair is GATED by the same check function that reports
 * the finding and only rewrites CSS or attribute values, never copy text (owner
 * decision — documentation copy in <pre>/<code> and framework values like
 * data-class/:class are out of bounds). Checker and repair share one evidence
 * source: a repair fires only on a document its checker flags, and the paired
 * test asserts the checker goes silent afterward — a repair the checker can't
 * confirm fixed nothing. Structural safety over coverage: a shape the rewriter
 * cannot transform provably-intact (CSS nesting, mixed selector lists) is
 * skipped as a miss, never guessed at.
 */
import { checkStickyHoverUnguarded, stripHoverGuardedBlocks, blankStringLiterals } from "./layout-checks-hover.js";
import { checkDataNumbersNotTabular } from "./taste-checks-typography.js";
import { checkFocusOutlineRemoved, isProgrammaticFocusTarget } from "./a11y-checks-focus-and-labels.js";

/** Blank to spaces, length- and newline-preserving (offsets stay valid). */
const blankPreserving = (m: string): string => m.replace(/[^\n]/g, " ");

/** Non-markup regions blanked — same discipline as the checkers' markupOnly. */
function blankNonMarkup(html: string): string {
  return html.replace(/<(script|pre|code|kbd|samp)\b[\s\S]*?<\/\1\s*>/gi, blankPreserving);
}

/** Each <style> block's inner span, with offsets into the whole document.
 *  Scanned over the non-markup mask, so a "<style>" inside a script string or a
 *  comment is never adopted as a rewrite target. */
function styleSpans(html: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const mask = blankNonMarkup(html).replace(/<!--[\s\S]*?-->/g, blankPreserving);
  for (const m of mask.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const inner = m[1] ?? "";
    const start = m.index + m[0].indexOf(inner);
    out.push({ start, end: start + inner.length });
  }
  return out;
}

/** Innermost flat CSS rules (selector + full span) within a masked CSS string. */
function flatRules(css: string): Array<{ selector: string; start: number; end: number }> {
  const out: Array<{ selector: string; start: number; end: number }> = [];
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const raw = m[1] ?? "";
    const lead = raw.length - raw.trimStart().length;
    out.push({ selector: raw.trim(), start: m.index + lead, end: m.index + m[0].length });
  }
  return out;
}

/**
 * hover-media-guard: wrap each unguarded `:hover` rule in place inside
 * `@media (hover: hover) { … }`. In-place wrapping preserves cascade order, and
 * a rule already inside an unrelated media query becomes valid nested media.
 * Gate + mask come from the checker's own logic (mobile-intent gate via
 * checkStickyHoverUnguarded; string literals blanked by the SAME helper the
 * checker uses, so a `}` inside `content: "…"` can never mis-pair a brace;
 * guarded blocks blanked via stripHoverGuardedBlocks).
 *
 * Skipped as misses, never guessed: a "selector" containing `;` (that is the
 * declaration run of a CSS-nested rule — wrapping it would engulf the base
 * styles), and a selector list whose comma-parts are not ALL `:hover` (wrapping
 * would move sibling state like `.is-active` behind hover capability).
 */
export function fixHoverMediaGuard(html: string): { html: string; applied: boolean } {
  if (checkStickyHoverUnguarded(html).length === 0) return { html, applied: false };
  let fixed = html;
  // Walk style blocks last-to-first so earlier spans stay valid while rewriting.
  for (const span of styleSpans(html).reverse()) {
    const css = html.slice(span.start, span.end);
    const mask = stripHoverGuardedBlocks(
      blankStringLiterals(css.replace(/\/\*[\s\S]*?\*\//g, blankPreserving)),
    );
    const targets = flatRules(mask)
      .filter((r) => /:hover\b/i.test(r.selector))
      .filter((r) => !r.selector.includes(";"))
      .filter((r) => r.selector.split(",").every((part) => /:hover\b/i.test(part)))
      .reverse();
    let content = css;
    for (const r of targets) {
      content = content.slice(0, r.start) +
        `@media (hover: hover) { ${content.slice(r.start, r.end)} }` +
        content.slice(r.end);
    }
    fixed = fixed.slice(0, span.start) + content + fixed.slice(span.end);
  }
  const applied = fixed !== html;
  return { html: applied ? fixed : html, applied };
}

/**
 * table-tabular-nums: when numeric table columns lack tabular figures, emit a
 * FRESH one-line <style> at the top of <head> with the declaration the lint
 * message prescribes. Never adopts an existing block: the first-<style> found
 * by a regex may live in a script string, a comment, or <noscript> — injecting
 * there corrupts code or silences the checker without fixing the page.
 */
export function fixTableTabularNums(html: string): { html: string; applied: boolean } {
  if (checkDataNumbersNotTabular(html).length === 0) return { html, applied: false };
  const head = /<head\b[^>]*>/i.exec(blankNonMarkup(html));
  if (head === null) return { html, applied: false };
  const at = head.index + head[0].length;
  return {
    html: `${html.slice(0, at)}<style>td, th { font-variant-numeric: tabular-nums; }</style>${html.slice(at)}`,
    applied: true,
  };
}

/** The outline-killing declaration — whole-value only, same anchor discipline as
 *  the checker: `outline: 0px solid transparent` is a REAL ring and must survive. */
const OUTLINE_KILL_DECL = /outline\s*:\s*(?:none|0(?:px)?)\s*(?:!important\s*)?(?:;|(?=\s*\})|$)/gi;

/**
 * focus-outline-restore: delete the outline-killing declaration from focus
 * rules (the browser default ring returns — the safest visible replacement)
 * and drop `focus*:outline-none` utility tokens from real class attributes.
 * Rules on programmatic focus targets (tabindex="-1") are left alone — the
 * checker does not count them as removals, so the repair must not touch them.
 * The class pass runs over markup only (never <pre>/<code>/script copy), only
 * on the `class` attribute itself (never data-class/:class), and rewrites an
 * attribute only when a token was actually removed — no reflow-only diffs.
 */
export function fixFocusOutlineRestore(html: string): { html: string; applied: boolean } {
  if (checkFocusOutlineRemoved(html).length === 0) return { html, applied: false };
  let fixed = html;
  for (const span of styleSpans(html).reverse()) {
    const css = html.slice(span.start, span.end);
    const mask = blankStringLiterals(css.replace(/\/\*[\s\S]*?\*\//g, blankPreserving));
    let content = css;
    for (const r of flatRules(mask).reverse()) {
      if (!/:focus(-visible|-within)?\b/i.test(r.selector)) continue;
      if (isProgrammaticFocusTarget(r.selector, html)) continue;
      const body = content.slice(r.start, r.end);
      const repaired = body.replace(OUTLINE_KILL_DECL, "");
      if (repaired !== body) content = content.slice(0, r.start) + repaired + content.slice(r.end);
    }
    fixed = fixed.slice(0, span.start) + content + fixed.slice(span.end);
  }
  // Class-token pass: find real class attributes on the non-markup mask, edit
  // the original by position so copy regions are provably untouched.
  const mask = blankNonMarkup(fixed);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const m of mask.matchAll(/(?<![-\w:])class\s*=\s*(["'])([^"']*)\1/gi)) {
    const value = m[2] ?? "";
    const cleaned = value.replace(/(?:^|\s)focus(?:-visible|-within)?:outline-none(?=\s|$)/g, " ");
    if (cleaned === value) continue; // nothing removed → attribute untouched
    const normalized = cleaned.replace(/\s{2,}/g, " ").trim();
    // m[0] ends `…"value"` — the value starts exactly value.length+1 from the end.
    const valueStart = m.index + m[0].length - 1 - value.length;
    edits.push({ start: valueStart, end: valueStart + value.length, text: normalized });
  }
  for (const e of edits.reverse()) fixed = fixed.slice(0, e.start) + e.text + fixed.slice(e.end);
  const applied = fixed !== html;
  return { html: applied ? fixed : html, applied };
}
