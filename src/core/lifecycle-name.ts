/**
 * Lifecycle markers in component names — one definition for every consumer that must not
 * recommend a retired component (convention synthesis lists them as "don't"; the reuse-plan
 * checker refuses them).
 *
 * `retired`: the name says the component is deprecated, legacy, archived or marked ❌.
 * `review`: the name says it is still under review — usable, but worth a warning.
 */

/** Free-text deprecation vocabulary used across the repo (matches anywhere in a name). */
export const DEPRECATED_RE = /deprecat|legacy|do-?not-?use|\bold\b|⚠/i;

/** Explicit retirement markers a design file puts in a component name. */
const RETIRED_MARKER_RE = /\[(?:archived|deprecated)\]|❌/i;
const REVIEW_MARKER_RE = /\[review\]/i;

export type NameLifecycle = "retired" | "review" | null;

export function lifecycleOf(name: string): NameLifecycle {
  if (RETIRED_MARKER_RE.test(name) || DEPRECATED_RE.test(name)) return "retired";
  return REVIEW_MARKER_RE.test(name) ? "review" : null;
}
