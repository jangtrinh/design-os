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
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { lineOf } from "./taste-checks-shared.js";

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

/**
 * Flag an interactive control whose touch target is provably under 44px.
 *  A. fixed height < 44px (a hard ceiling — padding cannot grow it);
 *  B. min-height floor < 44px with no vertical padding to reach 44px;
 *  C. icon-only control with ≤ 8px vertical padding and no height token at all.
 */
export function checkTapTargetUndersized(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const seen = new Set<number>(); // dedup by source offset

  // Scan 1 — opening interactive tags: prongs A & B (explicit size tokens).
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1] ?? "";
    const attrs = m[2] ?? "";
    if (!isInteractive(tag, attrs)) continue;
    const fixed = fixedHeightPx(attrs);
    const floor = minHeightPx(attrs);
    const pad = verticalPadPx(attrs);
    let msg: string | null = null;
    if (fixed !== null && fixed < MIN_TAP) {
      msg = `interactive control has a fixed height of ${fixed}px, below the ${MIN_TAP}px touch-target minimum (rubric Spacing: touch targets ≥ ~44px) — raise it to h-11 / min-h-[44px]`;
    } else if (floor !== null && floor < MIN_TAP && pad === 0) {
      msg = `interactive control sets min-height ${floor}px (< ${MIN_TAP}px) with no vertical padding to reach the ${MIN_TAP}px touch-target floor — raise the min-height or add padding`;
    }
    if (msg !== null) {
      seen.add(m.index);
      findings.push({ checkId: CHECK_ID, axis: "Spacing", severity: "warning", message: msg, line: lineOf(html, m.index) });
    }
  }

  // Scan 2 — icon-only <button>/<a role=button>: prong C (no height token, tiny padding).
  const elRe = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  while ((m = elRe.exec(html)) !== null) {
    if (seen.has(m.index)) continue;
    const tag = m[1] ?? "";
    const attrs = m[2] ?? "";
    const inner = m[3] ?? "";
    if (tag.toLowerCase() === "a" && !/\brole\s*=\s*["']?button\b/i.test(attrs)) continue;
    if (fixedHeightPx(attrs) !== null || minHeightPx(attrs) !== null) continue; // sized → scan 1's job
    if (!isIconOnly(inner)) continue;
    if (verticalPadPx(attrs) > 8) continue; // adequate padding around the icon
    const pad = verticalPadPx(attrs);
    findings.push({
      checkId: CHECK_ID, axis: "Spacing", severity: "warning",
      message: `icon-only control has no explicit height and only ${pad}px vertical padding — likely below the ${MIN_TAP}px touch-target floor; add min-h-[44px] or more padding`,
      line: lineOf(html, m.index),
    });
  }

  return findings;
}
