/**
 * Motion axis, scroll-scrub subset — the machine-checkable half of
 * `knowledge/scroll-cinema-direction.md`.
 *
 * A scrubbed flight drives `video.currentTime` from scroll. Three of that file's
 * floors are decidable from static source, and each one guards a failure that a
 * desktop review cannot see: an iOS-only blank frame, a phone-only clipped
 * caption, a reduced-motion user given continuous camera movement anyway.
 *
 * Pure string/regex heuristics over the raw HTML, like every other taste check —
 * no DOM parser, no browser. Precision over recall: each check requires actual
 * scrub wiring to be present before it says anything, so an ordinary page with a
 * decorative <video> stays silent.
 *
 *   video-scrub-no-reduced-motion  error  scroll drives currentTime, nothing branches on reduce
 *   video-scrub-attrs              error  a scrubbed video missing muted / playsinline
 *   safe-area-viewport-fit         error  env(safe-area-inset-*) without viewport-fit=cover
 */
import type { TasteFinding } from "./taste-lint.js";
import { lineOf } from "./taste-checks-shared.js";

const AXIS = "Motion";

/** Strip comments so a rule quoted in prose does not read as live code. */
function code(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Scroll actually drives video time here — the gate every check below sits behind.
 * Requires BOTH an assignment to `currentTime` and a scroll-ish source, so a page
 * that merely seeks on a button click is not treated as a scrubbed flight.
 */
export function usesScrollScrub(html: string): boolean {
  const src = code(html);
  const seeks = /\.\s*currentTime\s*=/.test(src);
  const scrollDriven =
    /addEventListener\s*\(\s*["'`]scroll["'`]/.test(src) ||
    /\bonscroll\b/.test(src) ||
    /\bscrollY\b|\bpageYOffset\b|\bscrollTop\b/.test(src) ||
    /getBoundingClientRect\s*\(\s*\)/.test(src) ||
    /\bIntersectionObserver\b/.test(src);
  return seeks && scrollDriven;
}

/**
 * video-scrub-no-reduced-motion — a scrubbed flight is continuous camera motion,
 * so `motion-craft.md`'s reduced-motion floor is not waivable at this tier. The
 * sibling check for CSS/GSAP already exists; video scrub had no equivalent, which
 * is exactly how a port that dropped the branch stayed green.
 *
 * A CSS `@media (prefers-reduced-motion)` block counts: what is owed is a settled
 * state, not a particular API.
 */
export function checkVideoScrubNoReducedMotion(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesScrollScrub(src)) return [];
  if (/prefers-reduced-motion/.test(src)) return [];
  const at = /\.\s*currentTime\s*=/.exec(src);
  return [{
    checkId: "video-scrub-no-reduced-motion", axis: AXIS, severity: "error",
    line: at === null ? 1 : lineOf(src, at.index),
    message: "scroll drives video.currentTime with no prefers-reduced-motion branch — a scrubbed flight is continuous camera motion, and reduced motion is owed a settled state that still carries the content (scroll-cinema-direction.md, phone floors)",
  }];
}

/**
 * video-scrub-attrs — iOS Safari will not paint a seeked frame on a video that has
 * never played, and an unmuted or non-inline video cannot autoplay-prime at all.
 * Dropping either attribute yields a blank scene on iOS while desktop looks perfect.
 */
export function checkVideoScrubAttrs(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesScrollScrub(src)) return [];
  const findings: TasteFinding[] = [];
  const tag = /<video\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src)) !== null) {
    const attrs = m[0];
    const missing: string[] = [];
    if (!/\bmuted\b/i.test(attrs)) missing.push("muted");
    if (!/\bplaysinline\b/i.test(attrs)) missing.push("playsinline");
    if (missing.length === 0) continue;
    findings.push({
      checkId: "video-scrub-attrs", axis: AXIS, severity: "error",
      line: lineOf(src, m.index),
      message: `scrubbed <video> is missing ${missing.join(" and ")} — without both, iOS Safari paints a blank box instead of the seeked frame (scroll-cinema-direction.md, phone floors)`,
    });
  }
  return findings;
}

/**
 * safe-area-viewport-fit — `env(safe-area-inset-*)` resolves to ZERO unless the
 * viewport meta opts in with `viewport-fit=cover`. The code reads as correct and
 * the copy still sits under the home indicator, which is why this one survives
 * review so reliably.
 *
 * Not gated on scrub: the trap belongs to any page that reaches for safe areas.
 */
export function checkSafeAreaViewportFit(html: string): TasteFinding[] {
  const src = code(html);
  const use = /env\s*\(\s*safe-area-inset-/i.exec(src);
  if (use === null) return [];
  const meta = /<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i.exec(src);
  if (meta !== null && /viewport-fit\s*=\s*cover/i.test(meta[0])) return [];
  return [{
    checkId: "safe-area-viewport-fit", axis: AXIS, severity: "error",
    line: lineOf(src, use.index),
    message: "env(safe-area-inset-*) is used without viewport-fit=cover in the viewport meta — the insets resolve to zero, so the layout looks correct and the copy still sits under the notch or home indicator (scroll-cinema-direction.md, phone floors)",
  }];
}

/** Every scroll-scrub check, in checkId order. */
export function videoScrubChecks(html: string): TasteFinding[] {
  return [
    ...checkSafeAreaViewportFit(html),
    ...checkVideoScrubAttrs(html),
    ...checkVideoScrubNoReducedMotion(html),
  ];
}
