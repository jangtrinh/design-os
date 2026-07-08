/**
 * Motion-axis checks for the deterministic taste linter — the machine floor
 * under knowledge/taste-rubric.md Axis 4 and the knowledge/motion-craft.md
 * floors. Split from taste-checks.ts (which re-exports these) to keep the
 * per-axis modules under the 200-line guideline.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions } from "./taste-checks-shared.js";

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
