/**
 * Typography-axis checks for the deterministic taste linter — the machine floor
 * under knowledge/taste-rubric.md Axis 2 ("Scale guidance"). Two
 * "generated-UI" tells the existing Typography check (tiny-body-text) does not
 * cover: italic display/heading type, and all-caps text set below a 1.0
 * line-height (cap-tops collide on wrap).
 *
 * Split into its own module to keep taste-checks.ts under the 200-line guideline.
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions, cssRules, lineOf } from "./taste-checks-shared.js";

// ─── Typography: display type is roman, not italic (rubric Axis 2) ──────────────

/** An h1..h6 element in a selector (not `h1foo` / `h1-bar`). */
const HEADING_ELEMENT = /(?:^|[\s,>+~])h[1-6](?![\w-])/i;
/**
 * A class token `title|heading|display|headline` bounded by a class/word edge on
 * the left (`.`, `-`, or `_`) and a non-word char on the right. Matches
 * `.hero__title`, `.card-title`, `.display-lg`; rejects `.subtitled-x` (the token
 * is mid-word). NOTE: the phase spec sketched a looser regex that matches its own
 * `.subtitled-x` negative case — this boundary form honors the stated examples,
 * which are the contract.
 */
const HEADING_CLASS = /[._-](?:title|heading|display|headline)(?![\w])/i;

function isHeadingSelector(selector: string): boolean {
  return HEADING_ELEMENT.test(selector) || HEADING_CLASS.test(selector);
}

const ITALIC_HEADING_MSG =
  `italic display/heading type (rubric Typography: "display type is roman — italic headings are a top generated-UI tell") — carry emphasis with weight, accent color, or a drawn underline`;

/**
 * italic-display-heading: display/heading type set in italic. Two prongs:
 *   A. a CSS rule whose selector is a heading (h1..h6 element or a
 *      title/heading/display/headline class) AND whose body sets
 *      `font-style: italic` — one finding per rule (no line; cssRules is offset-free);
 *   B. an `<em>` or `<i>` nested inside an `<h1>..<h6>` in the HTML — one finding
 *      per occurrence, with a line number.
 * Body italics (`<p><em>`), a non-heading `.card { font-style: italic }`, and an
 * italic `<blockquote>` do not flag.
 */
export function checkItalicDisplayHeading(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];

  // Prong A — heading selector + font-style: italic (CSS regions only).
  for (const { selector, body } of cssRules(cssRegions(html))) {
    if (!isHeadingSelector(selector)) continue;
    if (!/font-style\s*:\s*italic/i.test(body)) continue;
    findings.push({ checkId: "italic-display-heading", axis: "Typography", severity: "error", message: ITALIC_HEADING_MSG });
  }

  // Prong B — <em>/<i> inside a heading element (HTML). Tempered dot so the scan
  // never crosses a closing heading tag.
  const emInHeading = /<h[1-6][^>]*>(?:(?!<\/h[1-6]).)*?<(?:em|i)\b/gis;
  let m: RegExpExecArray | null;
  while ((m = emInHeading.exec(html)) !== null) {
    findings.push({ checkId: "italic-display-heading", axis: "Typography", severity: "error", message: ITALIC_HEADING_MSG, line: lineOf(html, m.index) });
  }

  return findings;
}

// ─── Typography: all-caps display keeps line-height ≥ 1.0 (rubric Axis 2) ────────

/**
 * uppercase-tight-line-height: a single CSS rule that both applies
 * `text-transform: uppercase` and sets a `line-height` below 1.0 — unitless < 1
 * (e.g. 0.94), < 1em, or < 100%. `line-height: 1` (exactly 1.0) passes: the floor
 * is a strict `< 1`. A `px` line-height is not a ratio and is never flagged.
 * (The panel ships uppercase labels at `line-height: 1` — correctly not flagged.)
 */
export function checkUppercaseTightLineHeight(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  for (const { body } of cssRules(cssRegions(html))) {
    if (!/text-transform\s*:\s*uppercase/i.test(body)) continue;
    const lh = /line-height\s*:\s*(\d*\.?\d+)\s*(em|%)?/i.exec(body);
    if (lh === null) continue;
    const num = parseFloat(lh[1] ?? "0");
    const unit = (lh[2] ?? "").toLowerCase();
    const below = unit === "%" ? num < 100 : num < 1; // unitless / em floor is 1.0; percent floor is 100%
    if (!below) continue;
    const valStr = `${lh[1]}${unit}`;
    findings.push({
      checkId: "uppercase-tight-line-height", axis: "Typography", severity: "error",
      message: `all-caps text with line-height ${valStr} below 1.0 (rubric Typography: "all-caps display keeps line-height ≥ 1.0 — cap-tops collide on wrap below it") — raise line-height to 1.0–1.1 or drop the uppercase transform`,
    });
  }
  return findings;
}

// ─── Typography: changing/columnar numbers use tabular figures (rubric Axis 2) ───

/** A table cell whose text is number-shaped: digits plus number furniture only. */
const NUMERIC_CELL = /^[\s\d.,:%$€£+()\-−–—/]*\d[\s\d.,:%$€£+()\-−–—/]*$/;

/**
 * data-numbers-not-tabular: a document laying out ≥3 number-shaped table cells
 * with no `tabular-nums` anywhere (the `font-variant-numeric` value and the
 * Tailwind utility share the token) and no monospace family in the CSS (a mono
 * face is already fixed-width). Proportional digits misalign down a column and
 * jitter when a value ticks (rubric Typography: "numeric data columns and
 * changing values use tabular figures"). Warning-only, one whole-document
 * finding — the true face may be decided by external CSS this check cannot see.
 *
 * Date/time/phone cells counting as number-shaped is a decision, not a leak:
 * a column of dates misaligns under proportional digits exactly like a column
 * of prices, so tabular figures apply to any digit column. Measured 2026-08-19
 * on 1,071 real files across four products: 21 fired — 18 lcov coverage reports
 * (tool output, true by the rule) and 3 designed compliance-centre prototypes
 * whose version/date columns genuinely lack tabular figures.
 */
export function checkDataNumbersNotTabular(html: string): TasteFinding[] {
  if (/\btabular-nums\b/i.test(html)) return [];
  if (/font-family[^;}]*mono/i.test(cssRegions(html))) return [];
  let numericCells = 0;
  for (const m of html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
    const t = (m[1] ?? "").replace(/<[^>]*>/g, "").trim();
    if (t !== "" && NUMERIC_CELL.test(t)) numericCells++;
  }
  if (numericCells < 3) return [];
  return [{
    checkId: "data-numbers-not-tabular", axis: "Typography", severity: "warning",
    message: `${numericCells} number-shaped table cells with no tabular-nums (rubric Typography: "numeric data columns and changing values use tabular figures") — set font-variant-numeric: tabular-nums (or the tabular-nums utility) on data columns`,
    expected: "font-variant-numeric: tabular-nums on numeric data columns (or a monospace face)",
    actual: `${numericCells} number-shaped cells without tabular figures`,
    fixHint: "run `ui autofix --write` (table-tabular-nums injects the declaration)",
    repairScope: "global",
  }];
}
