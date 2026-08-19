/**
 * The gate check catalog — the machine-readable roster of every check the
 * composed judge (`ui gate`) can run, per family, with what each requires.
 * This is the evidence source triage derives from (triage-by-attempted-
 * compilation: a router that reads THIS registry can never go stale as floors
 * ship, because shipping a floor updates the registry it routes on).
 *
 * PAIRED with its linter: tests/check-catalog.test.ts re-derives the id sets
 * from the family source files at test time and asserts set equality in BOTH
 * directions — an id added to a family module without a catalog row (or a
 * catalog row whose check was deleted) is a red test, not silent drift.
 *
 * `requires` names the context a check needs to be ACTIVE for a project:
 *   none   — always runs on any HTML artifact;
 *   tokens — needs the DS token file (only the taste raw-hex Consistency check).
 * Checks that are content-conditional (GSAP/video checks self-silence when the
 * library/element is absent) still list as "none": they are available, their
 * subject just may not appear in a given artifact.
 */
import type { GateFamily } from "./gate.js";

export interface CatalogEntry {
  id: string;
  family: GateFamily;
  requires: "none" | "tokens";
}

export const CHECK_CATALOG: readonly CatalogEntry[] = [
  { id: "absolute-without-relative", family: "layout", requires: "none" },
  { id: "avoidable-screenshot-crop", family: "layout", requires: "none" },
  { id: "clickable-no-pointer", family: "layout", requires: "none" },
  { id: "css-100vw-width", family: "layout", requires: "none" },
  { id: "dvh-over-100vh", family: "layout", requires: "none" },
  { id: "edge-bar-no-safe-area", family: "layout", requires: "none" },
  { id: "empty-flex-grid", family: "layout", requires: "none" },
  { id: "fixed-width-overflow", family: "layout", requires: "none" },
  { id: "font-display-missing", family: "layout", requires: "none" },
  { id: "img-no-dimensions", family: "layout", requires: "none" },
  { id: "input-font-below-16", family: "layout", requires: "none" },
  { id: "missing-body", family: "layout", requires: "none" },
  { id: "missing-doctype", family: "layout", requires: "none" },
  { id: "missing-html-root", family: "layout", requires: "none" },
  { id: "nested-scroll-container", family: "layout", requires: "none" },
  { id: "root-overflow-x-hidden", family: "layout", requires: "none" },
  { id: "sticky-hover-unguarded", family: "layout", requires: "none" },
  { id: "tap-spacing-cramped", family: "layout", requires: "none" },
  { id: "unclosed-structural-tag", family: "layout", requires: "none" },
  { id: "viewport-unit-on-body", family: "layout", requires: "none" },
  { id: "document-title", family: "a11y", requires: "none" },
  { id: "focus-outline-removed", family: "a11y", requires: "none" },
  { id: "heading-empty", family: "a11y", requires: "none" },
  { id: "heading-no-h1", family: "a11y", requires: "none" },
  { id: "heading-skip", family: "a11y", requires: "none" },
  { id: "html-lang", family: "a11y", requires: "none" },
  { id: "icon-control-unnamed", family: "a11y", requires: "none" },
  { id: "img-missing-alt", family: "a11y", requires: "none" },
  { id: "input-unlabeled", family: "a11y", requires: "none" },
  { id: "paste-blocked", family: "a11y", requires: "none" },
  { id: "positive-tabindex", family: "a11y", requires: "none" },
  { id: "viewport-meta-missing", family: "a11y", requires: "none" },
  { id: "viewport-zoom-blocked", family: "a11y", requires: "none" },
  { id: "animation-no-reduced-motion", family: "taste", requires: "none" },
  { id: "data-numbers-not-tabular", family: "taste", requires: "none" },
  { id: "equal-nested-radii", family: "taste", requires: "none" },
  { id: "focus-ring-animates-in", family: "taste", requires: "none" },
  { id: "gsap-dev-markers-shipped", family: "taste", requires: "none" },
  { id: "gsap-no-reduced-motion", family: "taste", requires: "none" },
  { id: "gsap-permanent-will-change", family: "taste", requires: "none" },
  { id: "gsap-plugin-unregistered", family: "taste", requires: "none" },
  { id: "gsap-scrub-and-toggle", family: "taste", requires: "none" },
  { id: "gsap-transforms-pinned-el", family: "taste", requires: "none" },
  { id: "italic-display-heading", family: "taste", requires: "none" },
  { id: "keyframes-layout-props", family: "taste", requires: "none" },
  { id: "linear-easing", family: "taste", requires: "none" },
  { id: "mixed-icon-families", family: "taste", requires: "none" },
  { id: "off-grid-spacing", family: "taste", requires: "none" },
  { id: "overshoot-easing", family: "taste", requires: "none" },
  { id: "pure-black-shadow", family: "taste", requires: "none" },
  { id: "raw-hex-when-token-exists", family: "taste", requires: "tokens" },
  { id: "safe-area-viewport-fit", family: "taste", requires: "none" },
  { id: "text-arrow-as-interface-icon", family: "taste", requires: "none" },
  { id: "tiny-body-text", family: "taste", requires: "none" },
  { id: "transition-all", family: "taste", requires: "none" },
  { id: "uppercase-tight-line-height", family: "taste", requires: "none" },
  { id: "video-poster-missing", family: "taste", requires: "none" },
  { id: "video-scrub-attrs", family: "taste", requires: "none" },
  { id: "video-scrub-no-reduced-motion", family: "taste", requires: "none" },
  { id: "z-index-inflation", family: "taste", requires: "none" },
  { id: "z-index-off-ladder", family: "taste", requires: "none" },
  { id: "all-caps-shout", family: "content", requires: "none" },
  { id: "bare-confirm-button", family: "content", requires: "none" },
  { id: "click-here-link", family: "content", requires: "none" },
  { id: "dumb-punctuation", family: "content", requires: "none" },
  { id: "error-code-alone", family: "content", requires: "none" },
  { id: "exclamation-overload", family: "content", requires: "none" },
  { id: "insensitive-terms", family: "content", requires: "none" },
  { id: "lorem-ipsum", family: "content", requires: "none" },
  { id: "placeholder-copy", family: "content", requires: "none" },
  { id: "placeholder-name", family: "content", requires: "none" },
  { id: "plural-s-hack", family: "content", requires: "none" },
  { id: "text-in-image", family: "content", requires: "none" },
  // Autofix rules — the repairs whose pending state the gate's autofix family
  // reports as `autofix-not-clean`; listed so coverage shows what the system
  // can FIX, not only what it can flag.
  { id: "viewport-meta", family: "autofix", requires: "none" },
  { id: "img-onerror", family: "autofix", requires: "none" },
  { id: "lucide-createicons", family: "autofix", requires: "none" },
  { id: "cdn-urls", family: "autofix", requires: "none" },
  { id: "duplicate-ids", family: "autofix", requires: "none" },
  { id: "hover-media-guard", family: "autofix", requires: "none" },
  { id: "table-tabular-nums", family: "autofix", requires: "none" },
  { id: "focus-outline-restore", family: "autofix", requires: "none" },
  { id: "autofix-not-clean", family: "autofix", requires: "none" },
] as const;
