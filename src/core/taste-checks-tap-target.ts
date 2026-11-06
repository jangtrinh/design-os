/**
 * tap-target-undersized (Spacing axis, WARNING) — the deterministic floor under
 * the rubric's touch-target rule ("touch targets under ~44px on a touch surface"
 * / "cramped touch targets" — taste-rubric.md Axis 3, Spacing).
 *
 * Interactive controls (`<button> <a> <input>`, `[role=button]`, `[onclick]`)
 * need a ≥44×44px hit area (WCAG 2.5.5 / Apple HIG / Material). This is a static
 * heuristic: it only flags when the markup carries POSITIVE evidence of an
 * undersized box — a fixed height below 44px, a min-height floor below 44px with
 * no padding to reach it, or an icon-only control with too little padding and no
 * height at all. A plain text link or a control whose size lives in an external
 * stylesheet is never flagged (precision over recall — a warning that fires on a
 * fine control is worse than a missed marginal one).
 *
 * Reads the computed cascade through computed-style-probe.ts (the DOM the fact
 * extractor uses); class-string evidence is only the fallback for an element no
 * stylesheet rule sizes.
 */
import type { TasteFinding } from "./taste-lint.js";
import * as du from "domutils";
import type { Element } from "domhandler";
import { baseClasses, computedStyleProbe } from "./computed-style-probe.js";
import type { ComputedStyleProbe } from "./computed-style-probe.js";

const MIN_TAP = 44; // px — the touch-target floor
const CHECK_ID = "tap-target-undersized";

/** An opening tag is interactive when it is a native control or carries a click/button role. */
function isInteractive(tag: string, attrs: string): boolean {
  const t = tag.toLowerCase();
  if (t === "button" || t === "a" || t === "input") return true;
  return /\brole\s*=\s*["']?button\b/i.test(attrs) || /\bonclick\s*=/i.test(attrs);
}

/** Largest px value among matches of `re` (group 1), scaling Tailwind scale units (×4). Null if none. */
function pxFrom(attrs: string, re: RegExp, scale: boolean): number | null {
  let best: number | null = null;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(attrs)) !== null) {
    const n = parseFloat(m[1] ?? "0");
    if (!Number.isFinite(n)) continue;
    const px = scale ? n * 4 : n;
    if (best === null || px < best) best = px; // smallest declared height governs the ceiling
  }
  return best;
}

/** Smallest fixed height (h-*, size-*, inline height) in px; null when none is declared. */
function fixedHeightPx(attrs: string): number | null {
  // Lookbehind `(?<!-)` keeps the `h-` inside `min-h-`/`max-h-` from reading as a fixed height.
  const cands = [
    pxFrom(attrs, /(?<!-)\bh-\[(\d+(?:\.\d+)?)px\]/g, false),
    pxFrom(attrs, /(?<!-)\bh-(\d+(?:\.\d+)?)(?=[\s"'>]|$)/g, true),
    pxFrom(attrs, /\bsize-\[(\d+(?:\.\d+)?)px\]/g, false),
    pxFrom(attrs, /\bsize-(\d+(?:\.\d+)?)(?=[\s"'>]|$)/g, true),
    pxFrom(attrs, /(?:^|[;"'\s])height\s*:\s*(\d+(?:\.\d+)?)px/gi, false),
  ].filter((v): v is number => v !== null);
  return cands.length > 0 ? Math.min(...cands) : null;
}

/** Smallest min-height floor (min-h-*, inline min-height) in px; null when none. */
function minHeightPx(attrs: string): number | null {
  const cands = [
    pxFrom(attrs, /\bmin-h-\[(\d+(?:\.\d+)?)px\]/g, false),
    pxFrom(attrs, /\bmin-h-(\d+(?:\.\d+)?)(?=[\s"'>]|$)/g, true),
    pxFrom(attrs, /min-height\s*:\s*(\d+(?:\.\d+)?)px/gi, false),
  ].filter((v): v is number => v !== null);
  return cands.length > 0 ? Math.min(...cands) : null;
}

/** Largest single-side vertical padding (py-*, p-*, pt-*, pb-*, inline) in px; 0 when none. */
function verticalPadPx(attrs: string): number {
  const cands = [
    pxFrom(attrs, /\b(?:py|p|pt|pb)-\[(\d+(?:\.\d+)?)px\]/g, false),
    pxFrom(attrs, /\b(?:py|p|pt|pb)-(\d+(?:\.\d+)?)(?=[\s"'>]|$)/g, true),
    pxFrom(attrs, /padding(?:-(?:top|bottom))?\s*:\s*(\d+(?:\.\d+)?)px/gi, false),
  ].filter((v): v is number => v !== null);
  // pxFrom returns the SMALLEST; for padding we want the LARGEST evidence of compensation.
  return cands.length > 0 ? Math.max(...cands) : 0;
}

/** True when the element's inner HTML is an icon with no visible text label. */
function isIconOnly(inner: string): boolean {
  const hasIcon = /data-lucide|<svg\b|class="[^"]*\bicon\b|<i\b[^>]*\b(?:fa-|bi-|ti-|material-icons)/i.test(inner);
  if (!hasIcon) return false;
  const text = inner.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, "").trim();
  return text.length === 0;
}

/** Not tappable at all: hidden, aria-hidden, click-through, or visually hidden for screen readers. */
function notTappable(el: Element, probe: ComputedStyleProbe): boolean {
  const a = el.attribs;
  if (el.tagName === "input" && (a["type"] ?? "").toLowerCase() === "hidden") return true;
  if (a["hidden"] !== undefined || a["aria-hidden"] === "true") return true;
  if (probe.value(el, "display") === "none" || probe.value(el, "pointer-events") === "none") return true;
  // Visually hidden (`sr-only`: an absolute 1×1px box) — a skip link for keyboards, never a touch target.
  const w = probe.px(el, "width"), h = probe.px(el, "height");
  return probe.value(el, "position") === "absolute" && w !== undefined && h !== undefined && w <= 1 && h <= 1;
}

/** Inline style text, so the class-only fallback keeps reading `style="height:32px"` when no stylesheet rule set it. */
function classEvidence(el: Element): string {
  return `${baseClasses(el).join(" ")} ${el.attribs["style"] ?? ""}`;
}

/**
 * Flag an interactive control whose touch target is provably under 44px.
 *  A. fixed height < 44px (a hard ceiling — padding cannot grow it);
 *  B. min-height floor < 44px with no vertical padding to reach 44px;
 *  C. icon-only control with ≤ 8px vertical padding and no height token at all.
 *
 * Each size is the element's OWN: the computed value from the cascade first
 * (stylesheet + inline, default state), and only when no rule sets it, its BASE
 * classes. A variant class is never the element's size — `[&_svg]:size-4` sizes a
 * child svg and `sm:h-8` a wider viewport; reading them off the raw tag fired on
 * every 44px kit button of a real compiled page.
 */
export function checkTapTargetUndersized(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const probe = computedStyleProbe(html);
  if (probe === undefined) return findings;

  for (const el of probe.elements) {
    const tag = el.tagName;
    const attrs = ` ${Object.entries(el.attribs).map(([k, v]) => `${k}="${v}"`).join(" ")}`;
    if (!isInteractive(tag, attrs) || notTappable(el, probe)) continue;
    const ev = classEvidence(el);
    const fixed = probe.px(el, "height") ?? fixedHeightPx(ev);
    const floor = probe.px(el, "min-height") ?? minHeightPx(ev);
    const padTop = probe.px(el, "padding-top");
    const padBottom = probe.px(el, "padding-bottom");
    const pad = padTop !== undefined || padBottom !== undefined
      ? Math.max(padTop ?? 0, padBottom ?? 0)
      : verticalPadPx(ev);
    let msg: string | null = null;
    if (fixed !== null && fixed < MIN_TAP) {
      msg = `interactive control has a fixed height of ${fixed}px, below the ${MIN_TAP}px touch-target minimum (rubric Spacing: touch targets ≥ ~44px) — raise it to h-11 / min-h-[44px]`;
    } else if (floor !== null && floor < MIN_TAP && pad === 0) {
      msg = `interactive control sets min-height ${floor}px (< ${MIN_TAP}px) with no vertical padding to reach the ${MIN_TAP}px touch-target floor — raise the min-height or add padding`;
    } else if (fixed === null && floor === null && pad <= 8 && isPressable(tag, attrs) && isIconOnly(du.getInnerHTML(el))) {
      msg = `icon-only control has no explicit height and only ${pad}px vertical padding — likely below the ${MIN_TAP}px touch-target floor; add min-h-[44px] or more padding`;
    }
    if (msg !== null) {
      findings.push({ checkId: CHECK_ID, axis: "Spacing", severity: "warning", message: msg, line: probe.line(el), nodeRef: probe.ref(el) });
    }
  }
  return findings;
}

/** Prong C's subjects: a <button>, or an <a> acting as one. */
function isPressable(tag: string, attrs: string): boolean {
  return tag === "button" || (tag === "a" && /\brole\s*=\s*["']?button\b/i.test(attrs));
}
