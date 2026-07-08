/**
 * Individual check functions for the deterministic taste linter.
 *
 * Each function takes the raw HTML string and returns zero or more findings.
 * All checks are pure string/regex heuristics — no DOM parser, no browser.
 *
 * Unlike layout-checks (which check whether a document *renders*), these check
 * whether a document *honors the mechanically-verifiable subset* of the 6+1
 * taste rubric (knowledge/taste-rubric.md). They are the deterministic floor
 * under the model's self-scored critique: a variant that trips an error here
 * breaks a rubric rule the model cannot talk its way past.
 *
 * Only rubric signals that are unambiguously checkable from static HTML are
 * implemented. Subjective axis judgment (is the composition "authored"? is the
 * motion "expressive"?) stays with the model. Each check cites the rubric line
 * it enforces. Precision over recall: when in doubt, do NOT flag — a false
 * positive that fails a good variant is worse than a missed marginal one.
 *
 * This module is the barrel for all per-axis checks. Typography / Spacing /
 * Iconography / Depth live here; the Motion and Consistency axes live in
 * taste-checks-motion.ts / taste-checks-consistency.ts (re-exported below);
 * shared string helpers live in taste-checks-shared.ts.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions, lineOf } from "./taste-checks-shared.js";

// Re-export the split-out per-axis modules so consumers (taste-lint.ts, tests)
// keep a single import surface.
export {
  checkLinearOrAllTransition,
  checkAnimationNoReducedMotion,
  checkKeyframesLayoutProps,
} from "./taste-checks-motion.js";
export { checkRawHexWhenTokenExists } from "./taste-checks-consistency.js";

// ─── Typography: body font-size ≥ 16px (rubric line 91) ─────────────────────────

/**
 * tiny-body-text: a font-size below 16px applied via inline style, a `<style>`
 * rule, or a Tailwind arbitrary value `text-[Npx]`. The rubric is explicit:
 * "Body text never below 16px" (Typography axis). Small UI chrome (captions,
 * labels) legitimately goes below 16px, so this is a *heuristic*: it flags only
 * px font-sizes ≤ 13px, the threshold below which body copy is unambiguously
 * too small. 14–15px is left to the model (often a deliberate dense-UI choice).
 */
export function checkTinyBodyText(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  // CSS font-size declarations (inline + <style>): font-size: Npx
  const cssRe = /font-size\s*:\s*(\d+(?:\.\d+)?)px/gi;
  let m: RegExpExecArray | null;
  while ((m = cssRe.exec(css)) !== null) {
    const px = parseFloat(m[1] ?? "0");
    if (px > 0 && px <= 13) {
      findings.push({
        checkId: "tiny-body-text", axis: "Typography", severity: "error",
        message: `font-size ${px}px is below the 16px body-text floor (rubric: "Body text never below 16px") — values ≤13px are too small for body copy`,
      });
    }
  }

  // Tailwind arbitrary font-size: text-[Npx]
  const twRe = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
  while ((m = twRe.exec(html)) !== null) {
    const px = parseFloat(m[1] ?? "0");
    if (px > 0 && px <= 13) {
      findings.push({
        checkId: "tiny-body-text", axis: "Typography", severity: "error",
        message: `Tailwind text-[${px}px] is below the 16px body-text floor (rubric: "Body text never below 16px")`,
        line: lineOf(html, m.index),
      });
    }
  }

  return findings;
}

// ─── Spacing: values on one base unit (rubric lines 109–114) ────────────────────

/**
 * off-grid-spacing: Tailwind arbitrary spacing utilities with a px value that
 * is not a multiple of 4 (the rubric's base-unit rule: "choose one base unit
 * (commonly 4px or 8px) and make every gap and pad a multiple of it";
 * anti-pattern: "off-grid values (13px, 27px)").
 *
 * Scope is restricted to the spacing-bearing utility prefixes so that, e.g.,
 * border-[1px] (a hairline, not spacing) is never flagged. Only flags values
 * > 4px that are not divisible by 4 — sub-4px values are hairlines/optical
 * nudges, not spacing-rhythm violations. Heuristic by design.
 */
export function checkOffGridSpacing(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  // Spacing utilities: margin (m,mt,mr,mb,ml,mx,my), padding (p,…), gap, space-x/y,
  // and inset (top/right/bottom/left). Matches `<prefix>-[Npx]`.
  const re = /\b(?:-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left))-\[(\d+(?:\.\d+)?)px\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const px = parseFloat(m[1] ?? "0");
    // Only whole-px values > 4 that break the 4px grid. 0–4 are nudges/hairlines.
    if (Number.isInteger(px) && px > 4 && px % 4 !== 0) {
      findings.push({
        checkId: "off-grid-spacing", axis: "Spacing", severity: "error",
        message: `spacing value ${px}px is off the 4px base grid (rubric anti-pattern: "off-grid values (13px, 27px)") — use a multiple of 4`,
        line: lineOf(html, m.index),
      });
    }
  }
  return findings;
}

// ─── Iconography: exactly one icon family (rubric lines 186, 192) ───────────────

/**
 * mixed-icon-families: more than one icon library referenced. The rubric is
 * explicit: "use exactly one icon family for the whole UI"; anti-pattern: "two
 * or more icon sets in one UI". Detects the common CDN/library signatures.
 * Lucide is the project default (autofix injects lucide.createIcons), so Lucide
 * alone never flags; Lucide + a second family does.
 */
export function checkMixedIconFamilies(html: string): TasteFinding[] {
  const families: { name: string; re: RegExp }[] = [
    { name: "Lucide",        re: /\blucide\b|data-lucide\s*=|lucide\.createIcons/i },
    { name: "Font Awesome",  re: /\bfa-(?:solid|regular|brands|light|duotone)\b|\bfas\b|\bfar\b|\bfab\b|font-?awesome/i },
    { name: "Material Icons", re: /material-icons|material-symbols/i },
    { name: "Bootstrap Icons", re: /\bbi-[a-z]|bootstrap-icons/i },
    { name: "Heroicons",     re: /heroicons/i },
    { name: "Feather",       re: /feather-icons|data-feather\s*=/i },
    { name: "Ionicons",      re: /\bion-icon\b|ionicons/i },
    { name: "Tabler",        re: /tabler-icons|\bti-[a-z]/i },
  ];
  const present = families.filter((f) => f.re.test(html)).map((f) => f.name);
  if (present.length >= 2) {
    return [{
      checkId: "mixed-icon-families", axis: "Iconography", severity: "error",
      message: `${present.length} icon families detected (${present.join(", ")}) — rubric requires "exactly one icon family for the whole UI"`,
    }];
  }
  return [];
}

// ─── Depth/Surface: shadows tinted, not pure black (rubric lines 228, 231) ──────

/**
 * pure-black-shadow: a box-shadow / drop-shadow using pure opaque-ish black.
 * The rubric: "Shadows should be tinted toward the background hue, not pure
 * black"; anti-pattern: "pure-black harsh shadows". Flags shadow declarations
 * whose color is #000/#000000 or rgb/rgba black at high alpha (≥ 0.5 — a soft
 * low-alpha black is the conventional, acceptable shadow and is NOT flagged).
 */
export function checkPureBlackShadow(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  // Find shadow declarations (box-shadow / filter: drop-shadow / Tailwind shadow-[...]).
  const shadowDecl = /(?:box-shadow|drop-shadow|--tw-shadow)\s*:\s*([^;}"']+)/gi;
  const twShadow = /\bshadow-\[([^\]]+)\]/g;

  const scan = (haystack: string, isTw: boolean) => {
    let m: RegExpExecArray | null;
    const re = isTw ? twShadow : shadowDecl;
    re.lastIndex = 0;
    while ((m = re.exec(haystack)) !== null) {
      const val = (m[1] ?? "").toLowerCase();
      // Pure black hex (#000 or #000000), or rgb black, or rgba black with alpha ≥ 0.5.
      const hexBlack = /#000(?:000)?\b/.test(val);
      const rgbBlack = /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(val);
      let rgbaHardBlack = false;
      const rgbaM = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0?\.\d+|1(?:\.0)?)\s*\)/.exec(val);
      if (rgbaM) {
        const alpha = parseFloat(rgbaM[1] ?? "0");
        rgbaHardBlack = alpha >= 0.5;
      }
      if (hexBlack || rgbBlack || rgbaHardBlack) {
        findings.push({
          checkId: "pure-black-shadow", axis: "Depth/Surface", severity: "error",
          message: `shadow uses pure/hard black (rubric: "Shadows should be tinted toward the background hue, not pure black") — tint the shadow or lower its alpha below 0.5`,
        });
      }
    }
  };
  scan(css, false);
  scan(html, true); // Tailwind shadow-[...] lives in class attributes, not CSS regions
  return findings;
}
