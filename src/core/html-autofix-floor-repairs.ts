/**
 * Floor repairs — deterministic autofixes for three interface-craft floors the
 * linters enforce. Each repair is GATED by the same check function that reports
 * the finding and only rewrites CSS or attribute values, never copy text (owner
 * decision). Checker and repair share one evidence source: a repair fires only
 * on a document its checker flags, and the paired test asserts the checker goes
 * silent afterward — a repair the checker can't confirm fixed nothing.
 */
import { checkStickyHoverUnguarded, stripHoverGuardedBlocks } from "./layout-checks-hover.js";
import { checkDataNumbersNotTabular } from "./taste-checks-typography.js";
import { checkFocusOutlineRemoved, isProgrammaticFocusTarget } from "./a11y-checks-focus-and-labels.js";

/** Blank to spaces, length- and newline-preserving (offsets stay valid). */
const blankPreserving = (m: string): string => m.replace(/[^\n]/g, " ");

/** Each <style> block's inner span, with offsets into the whole document. */
function styleSpans(html: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
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
 * Gate + mask both come from the checker's own logic (mobile-intent gate via
 * checkStickyHoverUnguarded; guarded-block mask via stripHoverGuardedBlocks).
 */
export function fixHoverMediaGuard(html: string): { html: string; applied: boolean } {
  if (checkStickyHoverUnguarded(html).length === 0) return { html, applied: false };
  let fixed = html;
  // Walk style blocks last-to-first so earlier spans stay valid while rewriting.
  for (const span of styleSpans(html).reverse()) {
    const css = html.slice(span.start, span.end);
    const mask = stripHoverGuardedBlocks(css.replace(/\/\*[\s\S]*?\*\//g, blankPreserving));
    const targets = flatRules(mask).filter((r) => /:hover\b/i.test(r.selector)).reverse();
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
 * table-tabular-nums: when numeric table columns lack tabular figures, inject
 * the one declaration the lint message prescribes into the first <style> block
 * (or a new block at the top of <head>). Digits then align down the column.
 */
export function fixTableTabularNums(html: string): { html: string; applied: boolean } {
  if (checkDataNumbersNotTabular(html).length === 0) return { html, applied: false };
  const rule = "td, th { font-variant-numeric: tabular-nums; }";
  const style = /<style\b[^>]*>/i.exec(html);
  if (style !== null) {
    const at = style.index + style[0].length;
    return { html: `${html.slice(0, at)}\n${rule}${html.slice(at)}`, applied: true };
  }
  const head = /<head\b[^>]*>/i.exec(html);
  if (head === null) return { html, applied: false };
  const at = head.index + head[0].length;
  return { html: `${html.slice(0, at)}\n<style>${rule}</style>${html.slice(at)}`, applied: true };
}

/** The outline-killing declaration, as the checker defines it. */
const OUTLINE_KILL_DECL = /outline\s*:\s*(?:none|0(?:px)?)\s*(?:!important\s*)?;?/gi;

/**
 * focus-outline-restore: delete the outline-killing declaration from focus
 * rules (the browser default ring returns — the safest visible replacement)
 * and drop `focus*:outline-none` utility tokens from class attributes. Rules
 * on programmatic focus targets (tabindex="-1") are left alone — the checker
 * does not count them as removals, so the repair must not touch them either.
 */
export function fixFocusOutlineRestore(html: string): { html: string; applied: boolean } {
  if (checkFocusOutlineRemoved(html).length === 0) return { html, applied: false };
  let fixed = html;
  for (const span of styleSpans(html).reverse()) {
    const css = html.slice(span.start, span.end);
    const mask = css.replace(/\/\*[\s\S]*?\*\//g, blankPreserving);
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
  fixed = fixed.replace(/(\bclass\s*=\s*)(["'])([^"']*)\2/gi, (whole, prefix: string, q: string, v: string) => {
    const cleaned = v.replace(/(?:^|\s)focus(?:-visible|-within)?:outline-none(?=\s|$)/g, " ").replace(/\s{2,}/g, " ").trim();
    return cleaned === v.trim() ? whole : `${prefix}${q}${cleaned}${q}`;
  });
  const applied = fixed !== html;
  return { html: applied ? fixed : html, applied };
}
