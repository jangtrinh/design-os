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
 */
import type { TasteFinding } from "./taste-lint.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return 1-based line number for a match at byte offset `idx`. */
function lineOf(html: string, idx: number): number {
  return html.slice(0, idx).split("\n").length;
}

/**
 * Extract the text inside `<style>…</style>` blocks plus all `style="…"`
 * inline attribute values — i.e. everywhere a CSS declaration can live.
 * Used by checks that must not match CSS-like substrings in body copy.
 */
function cssRegions(html: string): string {
  const parts: string[] = [];
  const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleBlock.exec(html)) !== null) parts.push(m[1] ?? "");
  const inline = /style\s*=\s*["']([^"']*)["']/gi;
  while ((m = inline.exec(html)) !== null) parts.push(m[1] ?? "");
  return parts.join("\n");
}

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

// ─── Motion: directional easing, never linear (rubric lines 147, 153) ───────────

/**
 * linear-or-all-transition: a CSS transition using `linear` easing or the
 * `transition: all` shorthand. Rubric: "never linear for UI transitions
 * (linear reads mechanical)"; "Animate transform and opacity, not layout
 * properties" (transition:all animates every property, including layout).
 * Only inspects CSS regions so the word "linear"/"all" in body copy is safe.
 */
export function checkLinearOrAllTransition(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  // transition-timing-function: linear  OR  transition: ... linear ...
  const linearRe = /transition(?:-timing-function)?\s*:\s*[^;}"']*\blinear\b/gi;
  if (linearRe.test(css)) {
    findings.push({
      checkId: "linear-easing", axis: "Motion", severity: "error",
      message: `transition uses linear easing (rubric: "never linear for UI transitions — linear reads mechanical") — use ease-out for enter, ease-in for exit`,
    });
  }

  // transition: all ...  (shorthand that animates layout props)
  const allRe = /transition(?:-property)?\s*:\s*(?:[^;}"']*\s)?all\b/gi;
  if (allRe.test(css)) {
    findings.push({
      checkId: "transition-all", axis: "Motion", severity: "error",
      message: `transition targets "all" properties (rubric: "Animate transform and opacity, not layout properties") — name the specific properties to transition`,
    });
  }

  return findings;
}

// ─── Motion: every animation honors reduced-motion (rubric lines 151, 153) ──────

/**
 * animation-no-reduced-motion: a document that ships real animation — a CSS
 * `@keyframes` rule, an `animation:` shorthand, or a T4–T6 animation-library
 * `<script src>` (gsap / motion / anime / lottie / dotlottie) — yet nowhere
 * honors `prefers-reduced-motion`. Rubric Motion rule: "Respect a reduced-motion
 * preference"; anti-pattern: "motion with no reduced-motion fallback".
 *
 * Precision: a plain `transition:` alone never triggers (a transition is neither
 * a keyframes animation nor a library). The `@keyframes`/`animation:` signals are
 * scoped to CSS regions, so the word "animation" in body copy is safe; the library
 * signal requires a `<script src>` URL match. A reduced-motion guard ANYWHERE in
 * the document — a `@media (prefers-reduced-motion…)` block or a JS
 * `matchMedia("(prefers-reduced-motion…")` check — clears the finding.
 */
export function checkAnimationNoReducedMotion(html: string): TasteFinding[] {
  const css = cssRegions(html);
  const hasKeyframes = /@keyframes\b/i.test(css);
  const hasAnimationDecl = /animation\s*:/i.test(css);
  // A CDN animation library loaded via <script src="…gsap|motion|anime|lottie…">.
  const libScript =
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:gsap|motion|anime|lottie|dotlottie)[^"']*["']/i.test(html);

  if (!hasKeyframes && !hasAnimationDecl && !libScript) return [];
  // A reduced-motion fallback anywhere (CSS media query OR JS matchMedia) suffices.
  if (/prefers-reduced-motion/i.test(html)) return [];

  return [{
    checkId: "animation-no-reduced-motion", axis: "Motion", severity: "error",
    message: `animation present (@keyframes / animation / animation library) with no prefers-reduced-motion fallback anywhere (rubric Motion: "motion with no reduced-motion fallback" is an anti-pattern) — add an @media (prefers-reduced-motion: reduce) block or a matchMedia guard`,
  }];
}

// ─── Motion: keyframes animate transform/opacity, not layout (rubric line 150) ──

/** Layout properties that reflow when animated — anchored to a declaration start
 *  (`{`/`;`) so `max-width`, `line-height`, `border-right` do NOT false-positive. */
const LAYOUT_PROP_RE =
  /(?:[{;]|^)\s*(width|height|top|left|right|bottom|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?)\s*:/gi;

/**
 * Extract each `@keyframes NAME { … }` block from CSS, returning its name and
 * inner body (declarations across all stops). Brace-depth aware so the nested
 * per-stop blocks (`0% { … }`) do not terminate the scan early.
 */
function keyframesBlocks(css: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const head = /@keyframes\s+([\w-]+)\s*\{/gi;
  let m: RegExpExecArray | null;
  while ((m = head.exec(css)) !== null) {
    const name = m[1] ?? "";
    let depth = 1;
    let i = head.lastIndex;
    const start = i;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    out.push({ name, body: css.slice(start, i - 1) }); // exclude the closing brace
    head.lastIndex = i;
  }
  return out;
}

/**
 * keyframes-layout-props: a `@keyframes` block that animates a layout property
 * (`width`/`height`/`top`/`left`/`right`/`bottom`/`margin*`/`padding*`). Rubric
 * Motion: "Animate transform and opacity, not layout properties"; anti-pattern:
 * "animating width/height/top/left". `transform`, `opacity`, `background`,
 * `color` and the like never trigger. One finding per keyframes block, naming
 * the first offending property and the keyframes name.
 */
export function checkKeyframesLayoutProps(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  for (const { name, body } of keyframesBlocks(css)) {
    LAYOUT_PROP_RE.lastIndex = 0;
    const m = LAYOUT_PROP_RE.exec(body);
    if (m) {
      const prop = m[1] ?? "";
      findings.push({
        checkId: "keyframes-layout-props", axis: "Motion", severity: "error",
        message: `@keyframes "${name}" animates layout property "${prop}" (rubric Motion: "Animate transform and opacity, not layout properties") — animate transform/opacity instead`,
      });
    }
  }
  return findings;
}

// ─── Consistency: no raw hex when a token exists (rubric lines 139–144) ─────────

/**
 * raw-hex-when-token-exists: a Tailwind arbitrary-hex utility (bg-[#…],
 * text-[#…], border-[#…]) OR an inline `color:`/`background:` hex literal, when
 * the project's design tokens are supplied via `knownHexes`. Rubric Consistency
 * axis: "every color … resolves to a DS token. Raw #3b82f6 … when the project
 * already defines color-primary [is] a violation. Tailwind arbitrary-value
 * utilities count as raw literals when an equivalent token exists."
 *
 * Requires the caller to pass the set of token hex values (lower-cased, no
 * alpha) — without it the check is skipped (no DS context → nothing to enforce
 * against, matching the rubric's "only applies when the project has a system").
 * A hex that equals a token value is NOT flagged (the model used the right
 * color, just spelled it as a literal — that's a separate, softer concern the
 * model handles); a hex NOT among the tokens is the violation (an invented
 * color that ignores the palette).
 */
export function checkRawHexWhenTokenExists(
  html: string,
  knownHexes: Set<string> | undefined,
): TasteFinding[] {
  if (knownHexes === undefined || knownHexes.size === 0) return [];
  const findings: TasteFinding[] = [];

  const norm = (hex: string): string => {
    let h = hex.toLowerCase().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join(""); // #abc → #aabbcc
    return `#${h}`;
  };

  // Tailwind arbitrary-hex color utilities.
  const twRe = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|divide|accent|caret)-\[(#[0-9a-fA-F]{3,8})\]/g;
  let m: RegExpExecArray | null;
  while ((m = twRe.exec(html)) !== null) {
    const hex = norm((m[1] ?? "").slice(0, 7)); // drop any 8-digit alpha for compare
    if (!knownHexes.has(hex)) {
      findings.push({
        checkId: "raw-hex-when-token-exists", axis: "Consistency", severity: "error",
        message: `arbitrary color ${m[1]} is not a design-system token (rubric Consistency: every color must resolve to a token) — use the nearest token utility or register the color`,
        line: lineOf(html, m.index),
      });
    }
  }

  // Inline CSS hex literals on color/background.
  const css = cssRegions(html);
  const cssRe = /(?:color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,8})\b/gi;
  while ((m = cssRe.exec(css)) !== null) {
    const hex = norm((m[1] ?? "").slice(0, 7));
    if (!knownHexes.has(hex)) {
      findings.push({
        checkId: "raw-hex-when-token-exists", axis: "Consistency", severity: "error",
        message: `inline color ${m[1]} is not a design-system token (rubric Consistency: every color must resolve to a token) — use a token-backed utility`,
      });
    }
  }

  return findings;
}
