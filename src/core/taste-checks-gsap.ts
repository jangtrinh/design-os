/**
 * Motion axis, GSAP subset — the machine-checkable half of
 * `knowledge/gsap-motion-direction.md`.
 *
 * That file shipped as prose with no linter, which the repo's own doctrine calls
 * out: a standard that exists only as prose drifts. These are the rules from it
 * that a static reader can decide without rendering anything. Everything else in
 * the file — is the choreography *meaningful*, does the scene earn a pin — stays
 * with the model, exactly as the taste linter's other axes do.
 *
 * Pure string/regex heuristics over the raw HTML, like every other taste check:
 * no DOM parser, no browser. Precision over recall — a false positive that fails
 * a good build costs more than a missed marginal one, so each check requires GSAP
 * to actually be present before it says anything.
 *
 *   gsap-dev-markers-shipped   error   markers/GSDevTools left in a delivered file
 *   gsap-scrub-and-toggle      error   scrub + toggleActions on one ScrollTrigger
 *   gsap-plugin-unregistered   error   a plugin used with no registerPlugin call
 *   gsap-transforms-pinned-el  error   the pinned element is itself transformed
 *   gsap-no-reduced-motion     error   GSAP present, no reduced-motion branch
 *   gsap-permanent-will-change error   will-change parked in a static rule
 */
import type { TasteFinding } from "./taste-lint.js";
import { lineOf } from "./taste-checks-shared.js";

const AXIS = "Motion";

/** GSAP is in play at all — every check below is silent without this. */
export function usesGsap(rawHtml: string): boolean {
  const html = blankAttributes(rawHtml);
  return /\bgsap\s*\.\s*(to|from|fromTo|timeline|set|matchMedia|registerPlugin|context)\b/.test(html)
    || /\bScrollTrigger\s*\.\s*(create|refresh|matchMedia|batch)\b/.test(html);
}

/** Strip comments so a rule quoted in prose does not read as live code. */
function code(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Blank out tag ATTRIBUTES, keeping every offset so `lineOf` still points at the
 * right line. A real page loads plugins by file — `<script src="ScrollTrigger.min.js">`
 * — and a bare name scan reads that filename as a use of the plugin. Caught on the
 * first real-data run (Art III): the first draft flagged `gsap-plugin-unregistered`
 * on a page whose only mention of ScrollTrigger was its script tag.
 */
function blankAttributes(html: string): string {
  return html.replace(/<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g, (_all, tag: string, attrs: string) =>
    `<${tag}${" ".repeat(attrs.length)}>`);
}

/**
 * gsap-dev-markers-shipped — "Remove development markers and GSDevTools before
 * delivery" / "Use markers during construction only" (§ScrollTrigger).
 *
 * `markers: false` is fine: it is the switch in its off position, not a marker.
 */
export function checkGsapDevMarkers(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesGsap(src)) return [];
  const findings: TasteFinding[] = [];

  const markers = /\bmarkers\s*:\s*(?!false)(true|\{)/.exec(src);
  if (markers !== null) {
    findings.push({
      checkId: "gsap-dev-markers-shipped", axis: AXIS, severity: "error",
      line: lineOf(src, markers.index),
      message: "ScrollTrigger `markers` is on — construction-only debug UI, remove it before delivery (gsap-motion-direction.md, ScrollTrigger)",
    });
  }
  const devtools = /\bGSDevTools\b/.exec(src);
  if (devtools !== null) {
    findings.push({
      checkId: "gsap-dev-markers-shipped", axis: AXIS, severity: "error",
      line: lineOf(src, devtools.index),
      message: "GSDevTools is still wired in — a development tool, remove it before delivery (gsap-motion-direction.md, ScrollTrigger)",
    });
  }
  return findings;
}

/**
 * gsap-scrub-and-toggle — "Choose `scrub` for continuous progress or
 * `toggleActions` for discrete behavior, never both."
 *
 * Scoped to a single `scrollTrigger: { … }` object so two unrelated triggers in
 * one file, one scrubbed and one toggled, stay legal.
 */
export function checkGsapScrubAndToggle(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesGsap(src)) return [];
  const findings: TasteFinding[] = [];
  const block = /scrollTrigger\s*:\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(src)) !== null) {
    const body = m[1] ?? "";
    if (/\bscrub\s*:/.test(body) && /\btoggleActions\s*:/.test(body)) {
      findings.push({
        checkId: "gsap-scrub-and-toggle", axis: AXIS, severity: "error",
        line: lineOf(src, m.index),
        message: "one ScrollTrigger sets both `scrub` and `toggleActions` — continuous progress or discrete behavior, never both (gsap-motion-direction.md, ScrollTrigger)",
      });
    }
  }
  return findings;
}

/** Plugins that must be registered before use. */
const PLUGINS = ["ScrollTrigger", "ScrollSmoother", "SplitText", "Flip", "Draggable", "MotionPathPlugin", "TextPlugin", "Observer"];

/**
 * gsap-plugin-unregistered — a plugin is referenced but never passed to
 * `gsap.registerPlugin`. Silent in production until a bundler tree-shakes it,
 * which is exactly when it is hardest to diagnose.
 */
export function checkGsapPluginUnregistered(html: string): TasteFinding[] {
  const src = blankAttributes(code(html));
  if (!usesGsap(src)) return [];
  const registered = new Set<string>();
  const reg = /gsap\s*\.\s*registerPlugin\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = reg.exec(src)) !== null) {
    for (const name of (r[1] ?? "").split(",")) registered.add(name.trim());
  }
  const findings: TasteFinding[] = [];
  for (const plugin of PLUGINS) {
    if (registered.has(plugin)) continue;
    const use = new RegExp(`\\b${plugin}\\s*\\.\\s*[a-zA-Z]`).exec(src)
      ?? new RegExp(`scrollTrigger\\s*:[\\s\\S]{0,200}?\\b${plugin}\\b`).exec(src);
    if (use !== null) {
      findings.push({
        checkId: "gsap-plugin-unregistered", axis: AXIS, severity: "error",
        line: lineOf(src, use.index),
        message: `${plugin} is used but never passed to gsap.registerPlugin() — it works until a bundler tree-shakes it (gsap-motion-direction.md, plugin restraint)`,
      });
    }
  }
  return findings;
}

/**
 * gsap-transforms-pinned-el — "Pin the scene wrapper and animate a child. Do not
 * transform the pinned element."
 *
 * Only fires when the SAME selector is both the pin target and a tween target,
 * which is the actual failure; a pinned wrapper whose children move is correct.
 */
export function checkGsapTransformsPinnedElement(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesGsap(src)) return [];
  const pins = new Set<string>();
  const pinRe = /\bpin\s*:\s*["'`]([^"'`]+)["'`]/g;
  let p: RegExpExecArray | null;
  while ((p = pinRe.exec(src)) !== null) pins.add((p[1] ?? "").trim());
  if (pins.size === 0) return [];

  const findings: TasteFinding[] = [];
  const tween = /gsap\s*\.\s*(?:to|from|fromTo|set)\s*\(\s*["'`]([^"'`]+)["'`]\s*,([\s\S]{0,300}?)\)/g;
  let t: RegExpExecArray | null;
  while ((t = tween.exec(src)) !== null) {
    const target = (t[1] ?? "").trim();
    const vars = t[2] ?? "";
    if (!pins.has(target)) continue;
    if (!/\b(x|y|xPercent|yPercent|scale|scaleX|scaleY|rotation|rotate|skew|transform)\s*:/.test(vars)) continue;
    findings.push({
      checkId: "gsap-transforms-pinned-el", axis: AXIS, severity: "error",
      line: lineOf(src, t.index),
      message: `'${target}' is pinned and also transformed — pin the scene wrapper and animate a child instead (gsap-motion-direction.md, ScrollTrigger)`,
    });
  }
  return findings;
}

/**
 * gsap-no-reduced-motion — GSAP is driving motion with no reduced-motion branch
 * anywhere. The file's floor: "Use `gsap.matchMedia()` for responsive
 * choreography and `prefers-reduced-motion`."
 *
 * A CSS `@media (prefers-reduced-motion)` block counts: the honest outcome is
 * that a reduced-motion user gets a settled state, not that it was achieved
 * through a particular API.
 */
export function checkGsapNoReducedMotion(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesGsap(src)) return [];
  if (/prefers-reduced-motion/.test(src)) return [];
  const at = /\bgsap\s*\.\s*(?:to|from|fromTo|timeline)\b/.exec(src);
  return [{
    checkId: "gsap-no-reduced-motion", axis: AXIS, severity: "error",
    line: at === null ? 1 : lineOf(src, at.index),
    message: "GSAP animates with no prefers-reduced-motion branch — every tier owes a settled, non-animated state (gsap-motion-direction.md, accessibility floor)",
  }];
}

/**
 * gsap-permanent-will-change — "Apply `will-change` only while a known element
 * animates." A `will-change` sitting in a static CSS rule keeps a compositor
 * layer alive for the life of the page.
 *
 * `will-change: auto` is the release value, so it is never a finding.
 */
export function checkGsapPermanentWillChange(html: string): TasteFinding[] {
  const src = code(html);
  if (!usesGsap(src)) return [];
  const findings: TasteFinding[] = [];
  const styleBlocks = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let s: RegExpExecArray | null;
  while ((s = styleBlocks.exec(src)) !== null) {
    const css = s[1] ?? "";
    const hit = /will-change\s*:\s*(?!auto)([a-z-]+)/.exec(css);
    if (hit !== null) {
      findings.push({
        checkId: "gsap-permanent-will-change", axis: AXIS, severity: "error",
        line: lineOf(src, s.index + (s[0] ?? "").indexOf(hit[0])),
        message: "`will-change` is parked in a static rule — set it as the animation starts and release it after, or the compositor layer never goes away (gsap-motion-direction.md, performance)",
      });
    }
  }
  return findings;
}

/** Every GSAP check, in checkId order. */
export function gsapChecks(html: string): TasteFinding[] {
  return [
    ...checkGsapDevMarkers(html),
    ...checkGsapNoReducedMotion(html),
    ...checkGsapPermanentWillChange(html),
    ...checkGsapPluginUnregistered(html),
    ...checkGsapScrubAndToggle(html),
    ...checkGsapTransformsPinnedElement(html),
  ];
}
