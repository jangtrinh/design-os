/**
 * Mobile machine floor (spec 003 P3) — three responsive-web mobile-reliability
 * checks a static parser can decide with high precision:
 *
 *   tap-spacing-cramped   (warning) — an interactive flex/grid container whose
 *     gap resolves under 8px, so adjacent tappables sit too close (mis-tap).
 *   input-font-below-16   (warning) — a text-entry <input>/<textarea>/<select>
 *     with a font-size under 16px → iOS Safari zooms the page on focus.
 *   edge-bar-no-safe-area (warning) — a fixed/sticky bar anchored to the BOTTOM
 *     viewport edge with no env(safe-area-inset-*) → it collides with the home
 *     indicator on modern phones. (Top-0 headers are intentionally not flagged —
 *     see BOTTOM_ANCHOR; the top inset only bites in undetectable standalone/PWA.)
 *
 * Registered as warnings in layout-lint.ts (the document still renders). Pure
 * string/regex — no DOM, no deps. Precision-first: each fires only on POSITIVE
 * markup evidence; ambiguous cases are left un-flagged. M1 (touch-target size)
 * ships separately as tap-target-undersized (taste-checks-tap-target.ts) — one
 * home per rule; this module does not duplicate it.
 */
import type { LayoutFinding } from "./layout-lint.js";
import { cssRegions, cssRules, lineOf } from "./taste-checks-shared.js";

// ─── shared ─────────────────────────────────────────────────────────────────────

/** The lower-cased class list value of an opening tag's attribute string. */
function classAttr(attrs: string): string {
  const m = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
  return (m?.[1] ?? "").toLowerCase();
}

/** Count distinct interactive controls in an inner-HTML slice (each element once). */
function countInteractiveControls(inner: string): number {
  let n = 0;
  for (const m of inner.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const tag = (m[1] ?? "").toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea") n++;
    else if (/\brole\s*=\s*["']?button\b/i.test(m[2] ?? "")) n++;
  }
  return n;
}

// ─── tap-spacing-cramped ──────────────────────────────────────────────────────────

/** A flex or grid container (matches `flex`, `flex-col`, `grid`, `grid-cols-*`, inline). */
const FLEX_OR_GRID = /\b(?:inline-)?(?:flex|grid)\b/i;
/** A gap utility / inline gap resolving under 8px: gap-0, gap-0.5 (2px), gap-1 (4px), gap-[0-7px], gap:0|1-7px. */
const SMALL_GAP =
  /\bgap(?:-[xy])?-(?:0(?:\.5)?|1)\b|\bgap(?:-[xy])?-\[[0-7](?:\.\d+)?px\]|(?:^|[;"'\s])gap\s*:\s*(?:0|[1-7](?:\.\d+)?px)\b/i;

/**
 * tap-spacing-cramped: an interactive flex/grid container laying out two or more
 * tappable controls with a gap under the 8px touch-spacing floor. Only fires when
 * BOTH a flex/grid class and an explicit small-gap token are present AND the
 * container holds ≥2 interactive controls — a container with no declared gap is
 * never flagged (it may space via padding/margin). Inner HTML is captured to the
 * first matching close tag (under-captures on nesting → misses, never over-flags).
 */
export function checkTapSpacingCramped(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const lower = html.toLowerCase();
  const re = /<(div|nav|ul|ol|header|footer|section|form|menu)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[2] ?? "";
    if (!FLEX_OR_GRID.test(classAttr(attrs))) continue;
    if (!SMALL_GAP.test(attrs)) continue;
    const tag = (m[1] ?? "").toLowerCase();
    const closeIdx = lower.indexOf(`</${tag}>`, re.lastIndex);
    const inner = closeIdx === -1 ? html.slice(re.lastIndex) : html.slice(re.lastIndex, closeIdx);
    if (countInteractiveControls(inner) < 2) continue;
    findings.push({
      checkId: "tap-spacing-cramped", severity: "warning",
      message: `interactive <${tag}> lays out ≥2 controls with a gap under the 8px touch-spacing floor — adjacent tappables this close invite mis-taps; raise to gap-2 (8px) or more`,
      line: lineOf(html, m.index),
    });
  }
  return findings;
}

// ─── input-font-below-16 ────────────────────────────────────────────────────────

/** Input types that take no text focus, so iOS never zooms them. */
const NON_TEXT_INPUT = /\btype\s*=\s*["']?(?:checkbox|radio|hidden|range|color|submit|button|reset|file|image)\b/i;
/** A sub-16px font: text-xs (12) / text-sm (14) always, or an explicit px value. */
const SUB16_FONT = /\btext-(?:xs|sm)\b|\btext-\[(\d+(?:\.\d+)?)px\]|font-size\s*:\s*(\d+(?:\.\d+)?)px/i;

/**
 * input-font-below-16: a text-entry `<input>` / `<textarea>` / `<select>` whose
 * font-size is under 16px. iOS Safari auto-zooms the viewport when a focused
 * control's text is below 16px, then does not zoom back out — a jarring mobile
 * defect. `text-xs`/`text-sm` always flag; an arbitrary/inline px size flags only
 * when the number is < 16. Non-text input types (checkbox, submit, …) are skipped.
 */
export function checkInputFontBelow16(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  for (const m of html.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
    const tag = (m[1] ?? "").toLowerCase();
    const attrs = m[2] ?? "";
    if (tag === "input" && NON_TEXT_INPUT.test(attrs)) continue;
    const sm = SUB16_FONT.exec(attrs);
    if (sm === null) continue;
    const px = sm[1] ?? sm[2];
    if (px !== undefined && parseFloat(px) >= 16) continue;
    findings.push({
      checkId: "input-font-below-16", severity: "warning",
      message: `<${tag}> uses a font-size below 16px — iOS Safari zooms the page (and stays zoomed) when a control under 16px gains focus; set text-base (16px) or larger on form controls`,
      line: lineOf(html, m.index),
    });
  }
  return findings;
}

// ─── edge-bar-no-safe-area ──────────────────────────────────────────────────────

const POSITIONED = /\b(?:fixed|sticky)\b|position\s*:\s*(?:fixed|sticky)/i;
/**
 * Anchored to the BOTTOM viewport edge: bottom-0 utility, or inline bottom:0.
 * Precision decision (dogfood): the top edge is deliberately excluded — a sticky
 * top-0 header is near-universal and, in normal browser chrome, sits below the
 * status-bar/notch area (the top inset only bites in standalone/PWA, undetectable
 * statically). The bottom home-indicator collision is the real, high-signal bug,
 * so only the bottom edge (and bottom-bar names) flags.
 */
const BOTTOM_ANCHOR = /\bbottom-0\b|(?:^|[;"'\s])bottom\s*:\s*0\b/i;
/** A bar whose name marks it as bottom chrome. */
const BAR_HINT = /\b(?:tab-?bar|bottom-?nav|bottom-?bar|cta-?bar)\b/i;
/** The element itself pads for the safe area (inline env(), or a pb-/pt-safe utility). */
const ELEMENT_SAFE = /env\(\s*safe-area-inset|\bp[btxy]?-safe\b|\bp[btxy]?-\[env\(/i;

/** Classes whose CSS rule pads for the safe area (env(safe-area-inset)/safe-area). */
function safeAreaClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const { selector, body } of cssRules(css)) {
    if (!/env\(\s*safe-area-inset|safe-area/i.test(body)) continue;
    for (const c of selector.matchAll(/\.([\w-]+)/g)) out.add((c[1] ?? "").toLowerCase());
  }
  return out;
}

/**
 * edge-bar-no-safe-area: a `fixed`/`sticky` element anchored to the bottom viewport
 * edge (bottom-0), or a named bottom bar (tab-bar/bottom-nav/cta-bar), that never
 * applies `env(safe-area-inset-*)`. On home-indicator phones such a bar overlaps the
 * system inset. Exempt when the element pads for the safe area itself or via a CSS
 * rule on one of its classes (precision-first — the author handled it).
 */
export function checkEdgeBarNoSafeArea(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const safeClasses = safeAreaClasses(cssRegions(html));
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const tag = (m[1] ?? "").toLowerCase();
    const attrs = m[2] ?? "";
    if (!POSITIONED.test(attrs)) continue;
    const cls = classAttr(attrs);
    if (!BOTTOM_ANCHOR.test(attrs) && !BAR_HINT.test(cls)) continue;
    if (ELEMENT_SAFE.test(attrs)) continue;
    if (cls.split(/\s+/).some((c) => safeClasses.has(c))) continue;
    findings.push({
      checkId: "edge-bar-no-safe-area", severity: "warning",
      message: `<${tag}> is a fixed/sticky bar at the bottom viewport edge with no env(safe-area-inset-*) — it overlaps the home indicator on modern phones; add padding-bottom: env(safe-area-inset-bottom)`,
      line: lineOf(html, m.index),
    });
  }
  return findings;
}
