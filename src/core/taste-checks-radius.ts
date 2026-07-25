/**
 * radius-sprawl (Consistency axis, WARNING at > 4 distinct — warning-only) — the
 * machine floor under the rubric's Consistency axis ("every value resolves to an
 * existing token"). Mirrors `font-scale-sprawl`'s sprawl-count shape exactly: this
 * is a drift signal, NOT a hard ceiling (a true ceiling needs family/token
 * context this static check does not have).
 *
 * A designed surface picks a small radius scale (e.g. sm/md/lg + one pill value)
 * and reuses it. A sprawl of many distinct hand-picked corner radii reads as
 * unauthored — every card, chip, and input rounding itself independently.
 *
 * What is counted: distinct NON-ZERO border-radius magnitudes, gathered from
 * `<style>` rules + inline `style="…"` (`border-radius: …`, reusing
 * `taste-checks-shared`'s CSS-region extraction) and Tailwind `rounded-*` scale
 * steps (named steps `sm/md/lg/xl/2xl/3xl` map to their default px value; bare
 * `rounded`/`rounded-t`/… map to the 4px default; `rounded-[…]` arbitrary values
 * are read literally). Values are canonicalized to px (rem/em/pt normalized, like
 * `font-scale-sprawl`) so the same magnitude expressed two ways dedupes to one.
 *
 * Pill exemption: `50%`, `9999px`, and `rounded-full` all denote "fully round" —
 * they collapse into a single "pill" bucket that counts once no matter how many
 * elements use it, since a pill is one design decision, not a per-element pick.
 *
 * Threshold: > 4 distinct → warning (a drift nudge — never an error, never blocks CI).
 * One whole-document finding; no line number (corpus-only, like font-scale-sprawl).
 *
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions } from "./taste-checks-shared.js";

const CHECK_ID = "radius-sprawl";
const WARN_OVER = 4;
const PILL = "pill";

/** Tailwind's default radius scale (v3), in px; "full" is handled separately as PILL. */
const TAILWIND_RADIUS_PX: Record<string, number> = {
  none: 0, sm: 2, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24,
};
const DEFAULT_RADIUS_PX = 4; // bare `rounded` / `rounded-t` / … with no named step

/** Normalize a numeric length + unit to px (2-dp), matching font-scale-sprawl's convention. */
function toPx(value: string, unit: string): number | null {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const u = unit.toLowerCase();
  const px =
    u === "px" ? n :
    u === "rem" || u === "em" ? n * 16 :
    u === "pt" ? n * (96 / 72) :
    null;
  return px === null ? null : Math.round(px * 100) / 100;
}

/** Canonicalize one raw radius token (from CSS or an arbitrary Tailwind value) into a dedup key. Null = unparsable/zero (both skipped). */
function canonicalize(raw: string): { key: string; isPill: boolean } | null {
  const v = raw.trim().toLowerCase();
  if (v === "50%" || v === "9999px") return { key: PILL, isPill: true };

  const lenM = /^(\d+(?:\.\d+)?)(px|rem|em|pt)$/.exec(v);
  if (lenM) {
    const px = toPx(lenM[1] ?? "0", lenM[2] ?? "px");
    if (px === null || px === 0) return null;
    return { key: `${px}px`, isPill: false };
  }

  const pctM = /^(\d+(?:\.\d+)?)%$/.exec(v);
  if (pctM) {
    const n = parseFloat(pctM[1] ?? "0");
    if (n === 0) return null;
    return { key: `${n}%`, isPill: false };
  }

  return null; // not a recognizable length (e.g. `inherit`, `var(--…)`) — ignore
}

/** Collect distinct non-zero radius keys (see module doc) from the whole document. */
function distinctRadii(html: string): Set<string> {
  const keys = new Set<string>();

  // Source 1 — CSS `border-radius:` declarations in <style> blocks + inline style attrs.
  // border-radius can carry up to 4 space-separated corner values; each is its own datum.
  const css = cssRegions(html);
  const declRe = /border-radius\s*:\s*([^;}"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(css)) !== null) {
    const tokens = (m[1] ?? "").trim().split(/\s+/).filter((t) => t.length > 0);
    for (const t of tokens) {
      const c = canonicalize(t);
      if (c) keys.add(c.key);
    }
  }

  // Source 2 — Tailwind named scale steps: rounded, rounded-{t,r,b,l,tl,tr,br,bl}-{none,sm,md,lg,xl,2xl,3xl,full}.
  const namedRe = /\brounded(?:-(?:t|r|b|l|tl|tr|br|bl))?(?:-(none|sm|md|lg|xl|2xl|3xl|full))?(?=[\s"'>]|$)/gi;
  while ((m = namedRe.exec(html)) !== null) {
    const step = (m[1] ?? "").toLowerCase();
    if (step === "full") { keys.add(PILL); continue; }
    if (step === "none") continue; // 0 — not counted
    const px = step === "" ? DEFAULT_RADIUS_PX : TAILWIND_RADIUS_PX[step];
    if (px !== undefined && px > 0) keys.add(`${px}px`);
  }

  // Source 3 — Tailwind arbitrary values: rounded-[12px] / rounded-tl-[0.75rem] / rounded-[50%].
  const arbRe = /\brounded(?:-(?:t|r|b|l|tl|tr|br|bl))?-\[([^\]]+)\]/gi;
  while ((m = arbRe.exec(html)) !== null) {
    const c = canonicalize(m[1] ?? "");
    if (c) keys.add(c.key);
  }

  return keys;
}

/** Sort keys for a stable, readable message: numeric px ascending, percents after, "pill" last. */
function sortedLabels(keys: Set<string>): string[] {
  const arr = [...keys];
  const rank = (k: string): number => {
    if (k === PILL) return 2;
    if (k.endsWith("%")) return 1;
    return 0;
  };
  arr.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return parseFloat(a) - parseFloat(b);
  });
  return arr;
}

/**
 * radius-sprawl: count the distinct non-zero border-radius magnitudes in the
 * document (pill values collapsed to one). More than 4 distinct trips a warning
 * (a drift nudge, never an error). A document holding to a small radius scale
 * trips nothing.
 */
export function checkRadiusSprawl(html: string): TasteFinding[] {
  const keys = distinctRadii(html);
  const count = keys.size;
  if (count <= WARN_OVER) return [];
  return [{
    checkId: CHECK_ID,
    axis: "Consistency",
    severity: "warning",
    message: `${count} distinct non-zero border-radius values (${sortedLabels(keys).join(", ")}) — rubric Consistency: "every value resolves to an existing token" — collapse onto a small radius scale (e.g. sm/md/lg + one pill value)`,
  }];
}
