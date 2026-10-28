/**
 * mode-invisible-surface (Depth/Surface axis) — a boundary that passes text-contrast
 * checks but is invisible in craft terms: a low-alpha WHITE border or fill sitting
 * on a light surface (white-on-white), or the dark inverse — a low-alpha BLACK
 * border/fill on a dark surface (black-on-black).
 *
 * This is the classic copy-a-dark-recipe-onto-light bug: `border-white/10` is the
 * correct hairline on a dark surface, but pasted onto a white page it separates
 * nothing. A11y linters miss it (no text, no contrast pair); only craft catches it.
 *
 * A translucent tint has no colour of its own: it is a delta over whatever sits
 * behind it. So each tint is judged on the composite over ITS real backdrop, read
 * from the parsed document (cascade, inherited `var()`, Tailwind classes), never on
 * the document's overall colour mode. A white pill on a dark card inside a light
 * page is visible; the same pill on the page is not.
 *
 * Where a tint paints decides what it is measured against (see
 * taste-checks-invisible-surface-candidates.ts): fills and borders against the
 * element's surroundings and own surface, outer rings / outlines / box-shadows
 * against the PARENT, since they are drawn outside the element. Those outer ones
 * are warnings; fills, borders and inset shadows are errors.
 *
 * Precision over recall. A backdrop layer the text cannot name is an opaque layer of
 * any colour: both ends of the resulting luma interval are tested and the tint is
 * judged only when they agree. Only same-polarity tints are judged (white on a light
 * backdrop, black on a dark one); a white tint on black is the correct hairline.
 * Text tints (`text-white/10`) are never flagged.
 *
 * The one check in the taste-lint family that reads a parsed document rather than
 * regex over text: a backdrop is a tree relationship (ancestor chain, selector
 * match, inheritance), and the hand-rolled version of that was the source of the
 * defects this replaced.
 */
import type { Element } from "domhandler";
import type { TasteFinding } from "./taste-lint.js";
import { elements, lineIndexFor, parseHtml } from "./extractors/html/html-dom.js";
import { buildCascade } from "./extractors/html/css-cascade.js";
import {
  classesOf, createSurfaceContext, ensureDocumentSpine,
} from "./taste-checks-invisible-surface-backdrop.js";
import { readRuleExtras } from "./taste-checks-invisible-surface-rule-extras.js";
import type { Backdrop } from "./taste-checks-invisible-surface-paint.js";
import { styleCandidates, utilityCandidates } from "./taste-checks-invisible-surface-candidates.js";
import type { Candidate } from "./taste-checks-invisible-surface-candidates.js";

const CHECK_ID = "mode-invisible-surface";
const DARK_LUMA = 0.25; // a backdrop below this is a dark surface (white tints belong there, black ones vanish)
const MIN_STEP = 0.03; // a tint must move its backdrop's luma by this much (~8/255) to read as an edge

/** Necessary condition for any finding: the document writes SOME translucent colour or tint utility. */
const MAY_HAVE_TINT = /(?:white|black)\/|(?:rgb|hsl)a?\(|oklch\(|#[0-9a-f]{4}(?:[0-9a-f]{4})?(?![0-9a-f])/i;

/** Composite the tint over one backdrop luma and measure: same polarity as the backdrop, and the step it makes is below an edge. */
function invisibleOver(tint: "white" | "black", alpha: number, backdrop: number): boolean {
  if (tint === "white" ? backdrop < DARK_LUMA : backdrop >= DARK_LUMA) return false; // opposite polarity — the correct hairline
  const composite = alpha * (tint === "white" ? 1 : 0) + (1 - alpha) * backdrop;
  return Math.abs(composite - backdrop) < MIN_STEP;
}

export type Verdict = "invisible" | "visible" | "undecided";

/** Decide only where both ends of the backdrop interval agree. */
export function verdictOver(tint: "white" | "black", alpha: number, backdrop: Backdrop): Verdict {
  const lo = invisibleOver(tint, alpha, backdrop.lo);
  const hi = invisibleOver(tint, alpha, backdrop.hi);
  return lo && hi ? "invisible" : !lo && !hi ? "visible" : "undecided";
}

export interface InvisibleSurfaceReport {
  findings: TasteFinding[];
  /** Tints judged: invisible (flagged), visible (composited and fine), undecided (backdrop interval straddles the threshold: skipped). */
  stats: { invisible: number; visible: number; undecided: number };
}

const TAIL = "it passes text-contrast but, composited over that background, the boundary is invisible";

function describeSurface(c: Candidate, backdrop: Backdrop): string {
  const polarity = c.tint === "white" ? "light" : "dark";
  return backdrop.chromatic ? `${polarity} coloured surface` : `${polarity}-mode background`;
}

function messageFor(c: Candidate, backdrop: Backdrop): string {
  const pct = Math.round(c.alpha * 100);
  const on = describeSurface(c, backdrop);
  const outer = c.placement === "outer" ? " (painted outside the element, over its parent)" : "";
  if (c.utility) {
    return `${c.label} is a ~${pct}% ${c.tint} surface on a ${on}${outer} — ${TAIL}; use a visible ${c.tint === "white" ? "border/shadow tinted toward the background" : "light hairline"} instead`;
  }
  return `a ~${pct}% ${c.tint} surface tint (${c.label}) on a ${on}${outer} — ${TAIL}; raise the alpha or tint toward the background instead`;
}

/** Judge every translucent white/black tint in a document and keep the numbers behind the verdicts. */
export function inspectInvisibleSurface(html: string): InvisibleSurfaceReport {
  const report: InvisibleSurfaceReport = { findings: [], stats: { invisible: 0, visible: 0, undecided: 0 } };
  if (!MAY_HAVE_TINT.test(html)) return report;

  const parsed = parseHtml(html);
  ensureDocumentSpine(parsed.doc);
  const { byElement } = buildCascade(parsed.doc, parsed.sheets, html);
  const lineAt = lineIndexFor(html);
  const extras = readRuleExtras(parsed.doc, parsed.sheets, lineAt);
  const ctx = createSurfaceContext(parsed.doc, byElement, new Map([...extras.applied].map(([el, list]) => [el, list.map((a) => a.name)])));
  const darkRoot = ctx.canvas.hi === 0;
  const seen = new Set<string>();

  /** The line a utility is written on: its position inside the element's start tag, else the tag's line. */
  const lineOfToken = (el: Element) => (token: string): number | undefined => {
    const applied = extras.applied.get(el)?.find((a) => a.name === token);
    if (applied !== undefined && !classesOf(el).includes(token)) return applied.line;
    if (el.startIndex === null) return undefined;
    const tagEnd = el.children[0]?.startIndex ?? el.endIndex ?? el.startIndex;
    const at = html.slice(el.startIndex, tagEnd + 1).indexOf(token);
    return lineAt(el.startIndex + Math.max(0, at));
  };

  const overlaysOf = new Map<Element, Candidate[]>();
  for (const { el, style } of extras.overlays) {
    const found = styleCandidates(el, style, ctx.resolve).map((c): Candidate => ({ ...c, placement: "overlay" }));
    overlaysOf.set(el, [...(overlaysOf.get(el) ?? []), ...found]);
  }

  for (const el of elements(parsed.doc)) {
    const classes = [...classesOf(el), ...(extras.applied.get(el) ?? []).map((a) => a.name)];
    const candidates = [
      ...utilityCandidates(classes, darkRoot, lineOfToken(el)),
      ...styleCandidates(el, byElement.get(el), ctx.resolve),
      ...(overlaysOf.get(el) ?? []),
    ];
    for (const c of candidates) {
      const backdrop = ctx.backdropOf(el, c.placement === "edge" || c.placement === "overlay");
      const verdict = verdictOver(c.tint, c.alpha, backdrop);
      if (verdict !== "invisible") { report.stats[verdict]++; continue; }
      if (!c.utility) {
        if (seen.has(c.key)) continue; // one declaration reached through several elements
        seen.add(c.key);
      }
      report.stats.invisible++;
      report.findings.push({
        checkId: CHECK_ID, axis: "Depth/Surface", severity: c.placement === "outer" ? "warning" : "error",
        message: messageFor(c, backdrop),
        ...(c.line === undefined ? {} : { line: c.line }),
      });
    }
  }
  return report;
}

export function checkModeInvisibleSurface(html: string): TasteFinding[] {
  return inspectInvisibleSurface(html).findings;
}
