/**
 * Motion axis, scroll-handler subset (knowledge/landing-conversion-craft.md §9,
 * knowledge/motion-craft.md): scroll work belongs in `requestAnimationFrame` or an
 * `IntersectionObserver`, because a scroll event fires faster than frames are painted and a
 * handler that touches layout on every one of them is the cheapest way to make a landing
 * page stutter on a phone.
 *
 *   scroll-listener-unthrottled  warn  a scroll listener, and no requestAnimationFrame in any inline script
 *
 * A warning, not an error: a handler that only toggles a class once past a threshold is
 * cheap and legitimate, and whether a given handler is cheap is not decidable from text.
 * The check therefore asks only whether the page shows ANY awareness of frame scheduling.
 *
 * Scope is the page's INLINE scripts. A scroll listener inside an external bundle cannot be
 * read here, and a bundle that throttles for the page is invisible too, so the check stays
 * silent on pages whose scroll code is not in the markup rather than guess.
 *
 * Comments are masked before searching, so `// TODO: use requestAnimationFrame` neither
 * clears the finding nor `// window.addEventListener("scroll", …)` raises one. Strings are
 * kept: the event name IS a string.
 */
import type { TasteFinding } from "./taste-lint.js";
import { inlineScripts } from "./js-source-mask.js";
import { lineOf } from "./taste-checks-shared.js";

const AXIS = "Motion";

/** `addEventListener("scroll"` with either quote or a backtick, or an `onscroll =` assignment (not `==`). */
const SCROLL_LISTENER = /addEventListener\s*\(\s*["'`]scroll["'`]|\bonscroll\s*=(?!=)/;
const RAF = /\brequestAnimationFrame\b/;

export function checkScrollListenerUnthrottled(html: string): TasteFinding[] {
  const scripts = inlineScripts(html, false);
  if (scripts.some((s) => RAF.test(s.code))) return [];
  for (const s of scripts) {
    const m = SCROLL_LISTENER.exec(s.code);
    if (m === null) continue;
    return [{
      checkId: "scroll-listener-unthrottled", axis: AXIS, severity: "warning",
      line: lineOf(html, s.start + m.index),
      message: "a scroll listener with no requestAnimationFrame anywhere in the page's scripts — scroll fires faster than frames paint, so work done inside it stutters on a phone; schedule the work with requestAnimationFrame or use an IntersectionObserver",
      expected: "scroll-driven work scheduled through requestAnimationFrame or an IntersectionObserver",
      actual: "scroll handler runs on every event",
      fixHint: "queue one requestAnimationFrame per frame inside the handler, or replace it with an IntersectionObserver",
    }];
  }
  return [];
}
