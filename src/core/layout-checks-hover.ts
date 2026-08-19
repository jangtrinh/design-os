/**
 * sticky-hover-unguarded (warning) — the touch-hover machine floor (interfaces.dev
 * cheat sheet: "Put hover styling behind @media (hover: hover). On touch, :hover
 * sticks after a tap and looks selected."). A raw CSS `:hover` rule outside any
 * `@media (hover: hover)` / `(any-hover: hover)` guard, on a document that shows
 * mobile intent (viewport meta, width media query, or responsive breakpoint
 * prefix), leaves tapped controls looking permanently hovered on touch screens.
 *
 * Precision decisions: only `<style>` CSS regions are inspected — Tailwind
 * `hover:` utility classes never flag (the framework guards them); a document
 * with no mobile-intent signal never flags (a desktop-only page is out of
 * scope); one whole-document finding, counting the unguarded rules, mirroring
 * the animation-no-reduced-motion shape. Pure string/regex — no DOM, no deps.
 *
 * Known limit: the brace walk does not tokenize CSS strings, so a literal brace
 * inside a guarded block (`content: "}"`) closes the guard early and can inflate
 * the count. Warning-only and count-only, so the trade is accepted over a tokenizer.
 */
import type { LayoutFinding } from "./layout-lint.js";
import { cssRegions } from "./taste-checks-shared.js";
import { hasViewportMeta } from "./a11y-checks.js";

/** Mobile-intent signals — viewport meta shared with a11y-checks (one definition). */
const WIDTH_MEDIA = /@media[^{]*\(\s*(?:max|min)-width/i;
const MOBILE_INTENT = /\b(?:sm|md|lg|xl|2xl):[a-z[]/i;

/** Blank CSS string literals to spaces, length-preserving — a `}` inside
 *  `content: "…"` must never pair a brace. Shared by the checker's mask and the
 *  hover-media-guard repair, so both walk the same structure. */
export function blankStringLiterals(css: string): string {
  return css.replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (s) => " ".repeat(s.length));
}

/** Opening of a hover-capability media guard: @media … (hover: hover) / (any-hover: hover) … { */
const HOVER_GUARD_HEAD = /@media[^{]*\(\s*(?:any-)?hover\s*:\s*hover\s*\)[^{]*\{/gi;

/** Blank every @media (hover: hover) {…} block, brace-depth aware, offsets preserved.
 *  Exported for the paired repair (hover-media-guard) — checker and repair share one mask. */
export function stripHoverGuardedBlocks(css: string): string {
  let out = css;
  let m: RegExpExecArray | null;
  HOVER_GUARD_HEAD.lastIndex = 0;
  while ((m = HOVER_GUARD_HEAD.exec(out)) !== null) {
    let depth = 1;
    let i = HOVER_GUARD_HEAD.lastIndex;
    while (i < out.length && depth > 0) {
      const ch = out[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    out = out.slice(0, m.index) + " ".repeat(i - m.index) + out.slice(i);
    HOVER_GUARD_HEAD.lastIndex = i;
  }
  return out;
}

export function checkStickyHoverUnguarded(html: string): LayoutFinding[] {
  if (!hasViewportMeta(html) && !WIDTH_MEDIA.test(html) && !MOBILE_INTENT.test(html)) return [];
  // CSS comments and string literals are blanked first — a ":hover" mentioned in
  // prose is not a rule, and a "}" inside content:"…" must not close a guard early.
  const css = blankStringLiterals(cssRegions(html).replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length)));
  const unguarded = stripHoverGuardedBlocks(css);
  const count = [...unguarded.matchAll(/:hover\b/gi)].length;
  if (count === 0) return [];
  return [{
    checkId: "sticky-hover-unguarded", severity: "warning",
    message: `${count} CSS :hover rule${count === 1 ? "" : "s"} outside @media (hover: hover) on a mobile-intent document — on touch, :hover sticks after a tap and the control looks selected; wrap hover styling in @media (hover: hover)`,
    expected: "every real :hover rule inside @media (hover: hover)",
    actual: `${count} unguarded :hover rule${count === 1 ? "" : "s"}`,
    fixHint: "run `ui autofix --write` (hover-media-guard wraps them in place)",
    repairScope: "global",
  }];
}
