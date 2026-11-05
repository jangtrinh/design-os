/**
 * Motion axis, scroll-handler subset (knowledge/landing-conversion-craft.md §9,
 * knowledge/motion-craft.md): scroll work belongs in `requestAnimationFrame` or an
 * `IntersectionObserver`, because a scroll event fires faster than frames are painted and a
 * handler that touches layout on every one of them is the cheapest way to make a landing
 * page stutter on a phone.
 *
 *   scroll-listener-unthrottled  warn  a scroll listener in a script that never calls requestAnimationFrame
 *
 * A warning, not an error: a handler that only toggles a class once past a threshold is
 * cheap and legitimate, and whether a given handler is cheap is not decidable from text.
 * The check therefore asks only whether the listener's own script schedules frames. A
 * requestAnimationFrame loop in a different script (a carousel, a canvas) says nothing about
 * this handler, so it does not clear it.
 *
 * Scope is the page's INLINE scripts. A scroll listener inside an external bundle cannot be
 * read here, and a bundle that throttles for the page is invisible too, so the check stays
 * silent on pages whose scroll code is not in the markup rather than guess.
 *
 * Comments and strings are masked before the code is judged, so neither
 * `console.log("requestAnimationFrame")` clears the finding nor
 * `const s = 'addEventListener("scroll", fn)'` raises one. The event name IS a string, so
 * the listener is found in the comment-masked copy and then confirmed against the
 * string-masked copy: the call must survive masking, only its argument may not.
 */
import type { TasteFinding } from "./taste-lint.js";
import { inlineScripts } from "./js-source-mask.js";
import { lineOf } from "./taste-checks-shared.js";

const AXIS = "Motion";

/** `addEventListener("scroll"` with either quote or a backtick, or an `onscroll =` assignment (not `==`). */
const SCROLL_LISTENER = /addEventListener\s*\(\s*["'`]scroll["'`]|\bonscroll\s*=(?!=)/;
const RAF = /\brequestAnimationFrame\b/;

export function checkScrollListenerUnthrottled(html: string): TasteFinding[] {
  // Same scripts, same order, same offsets: the masker preserves positions.
  const withStrings = inlineScripts(html, false);
  const masked = inlineScripts(html, true);
  for (const [i, s] of withStrings.entries()) {
    const code = masked[i]?.code ?? "";
    const m = SCROLL_LISTENER.exec(s.code);
    if (m === null) continue;
    // A listener quoted inside a string is masked away in `code`; a real call is not.
    if (!/^(?:addEventListener|onscroll)/.test(code.slice(m.index))) continue;
    if (RAF.test(code)) continue;
    return [{
      checkId: "scroll-listener-unthrottled", axis: AXIS, severity: "warning",
      line: lineOf(html, s.start + m.index),
      message: "a scroll listener in a script that never calls requestAnimationFrame — scroll fires faster than frames paint, so work done inside it stutters on a phone; schedule the work with requestAnimationFrame or use an IntersectionObserver",
      expected: "scroll-driven work scheduled through requestAnimationFrame or an IntersectionObserver",
      actual: "scroll handler runs on every event",
      fixHint: "queue one requestAnimationFrame per frame inside the handler, or replace it with an IntersectionObserver",
    }];
  }
  return [];
}
