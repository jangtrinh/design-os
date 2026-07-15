/**
 * ai-cliche-gradient (Depth/Surface axis, ERROR) — the loudest machine-default
 * "AI glow" tell: a large background linear/radial/conic gradient whose color
 * stops sit in the indigo→magenta hue band (~270–330° OKLCH). Finance/enterprise
 * surfaces read it as cheap, untrustworthy default taste.
 *
 * Detection reuses the project's OKLCH color math (color-convert.ts) — each hex/
 * rgb stop is converted to an OKLCH hue and tested against the band. Named
 * Tailwind gradient utilities (`from-indigo-500 … to-purple-600`) are classified
 * by name since no hex is present. Only LARGE surfaces are flagged (hero, section,
 * body, full-bleed / inset overlays) — small accents (buttons, chips, avatars) are
 * left alone. When the document itself declares a brand/accent token in the same
 * band, the gradient is treated as intentional and the whole check is skipped.
 *
 * Limitation: brand exemption reads only in-document custom properties — an
 * external design-soul / DS file that declares a violet brand is not visible to a
 * single-file static check, so a genuinely on-brand violet may still flag; recolor
 * or declare the hue in-doc to exempt.
 *
 * Pure string/regex + color math — no DOM, no network.
 */
import type { TasteFinding } from "./taste-lint.js";
import { hexToOKLCH } from "./color-convert.js";
import { cssRules, cssRegions, lineOf } from "./taste-checks-shared.js";

const CHECK_ID = "ai-cliche-gradient";
const BAND_LO = 270;
const BAND_HI = 330;
const CHROMA_FLOOR = 0.06; // below this a color is effectively grey — its hue is meaningless
const DOMINANCE = 0.6; // in-band / chromatic ratio needed to call the gradient a violet tell

/** Named Tailwind palette hues that fall inside the AI-glow band. */
const NAMED_IN_BAND = new Set(["indigo", "violet", "purple", "fuchsia"]);
/** Named Tailwind palette hues that are chromatic but outside the band (so they dilute dominance). */
const NAMED_OUT_BAND = new Set(["blue", "sky", "cyan", "teal", "green", "emerald", "lime", "yellow", "amber", "orange", "red", "rose", "pink"]);

const LARGE_SURFACE = /hero|banner|jumbotron|masthead|splash|cover|backdrop|full-?bleed|section|\bbody\b|\bhtml\b|:root|\bmain\b|min-h-screen|h-screen|\[100vh|inset-0|w-full|\bpage\b|background/i;
const SMALL_ELEMENT = /btn|button|badge|chip|pill|\btag\b|\bicon\b|avatar|\bdot\b|thumb|swatch|underline|divider|\bborder\b|\blink\b|logo|\bcard\b|rounded-full/i;

/** Convert one gradient color stop (hex, #rgba, or rgb/rgba()) to an OKLCH hue+chroma; null if not a color. */
function stopHue(raw: string): { h: number; c: number } | null {
  const s = raw.trim().toLowerCase();
  let hex: string | null = null;
  const hexM = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hexM) {
    const d = hexM[1] ?? "";
    if (d.length === 3 || d.length === 6) hex = `#${d}`;
    else if (d.length === 4) hex = `#${d.slice(0, 3)}`; // #rgba → drop alpha nibble
    else if (d.length === 8) hex = `#${d.slice(0, 6)}`; // #rrggbbaa → drop alpha
  } else {
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    if (rgb) {
      const to2 = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
      hex = `#${to2(rgb[1] ?? "0")}${to2(rgb[2] ?? "0")}${to2(rgb[3] ?? "0")}`;
    }
  }
  if (hex === null) return null;
  try {
    const o = hexToOKLCH(hex);
    return { h: o.h, c: o.c };
  } catch {
    return null; // ColorError on a malformed token — ignore it
  }
}

/** Verdict for one gradient's combined stop set: is it dominantly in the AI-glow band? */
function isViolet(chromatic: number, inBand: number): boolean {
  return chromatic >= 1 && inBand >= 1 && inBand / chromatic >= DOMINANCE;
}

/** Extract every `linear|radial|conic-gradient(...)` payload from a text region (handles one nested paren level, e.g. rgba()). */
function gradientPayloads(text: string): string[] {
  const out: string[] = [];
  const re = /(?:linear|radial|conic)-gradient\(((?:[^()]|\([^()]*\))*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1] ?? "");
  return out;
}

/** Count chromatic and in-band stops across the hex/rgb colors inside a gradient payload. */
function tallyPayload(payload: string): { chromatic: number; inBand: number } {
  let chromatic = 0, inBand = 0;
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = colorRe.exec(payload)) !== null) {
    const hue = stopHue(m[0]);
    if (hue === null || hue.c < CHROMA_FLOOR) continue;
    chromatic++;
    if (hue.h >= BAND_LO && hue.h <= BAND_HI) inBand++;
  }
  return { chromatic, inBand };
}

/** Count named Tailwind gradient stops (from-/via-/to-<color>-<shade>) split into in-band vs out-of-band. */
function tallyNamed(attrs: string): { chromatic: number; inBand: number } {
  if (!/\bbg-gradient-to-[a-z]+/i.test(attrs)) return { chromatic: 0, inBand: 0 };
  let chromatic = 0, inBand = 0;
  const re = /\b(?:from|via|to)-([a-z]+)-\d{2,3}\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    const name = (m[1] ?? "").toLowerCase();
    if (NAMED_IN_BAND.has(name)) { chromatic++; inBand++; }
    else if (NAMED_OUT_BAND.has(name)) chromatic++;
  }
  return { chromatic, inBand };
}

/** Does the document declare a brand/accent/soul token whose hue is in the AI-glow band? */
function brandDeclaresBand(html: string): boolean {
  const re = /--[\w-]*(?:primary|brand|accent|soul)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const hue = stopHue(m[1] ?? "");
    if (hue && hue.c >= CHROMA_FLOOR && hue.h >= BAND_LO && hue.h <= BAND_HI) return true;
  }
  return false;
}

const MSG =
  `large-surface gradient sits in the indigo–magenta "AI glow" hue band (~270–330°) (rubric Depth/Surface: gradient-on-material is a design choice, not a default) — the loudest machine-default tell; recolor to the brand hue or drop the gradient`;

export function checkAiClicheGradient(html: string): TasteFinding[] {
  if (brandDeclaresBand(html)) return []; // violet is the declared brand — intentional, exempt

  const findings: TasteFinding[] = [];

  // Source 1 — <style> rules: gradient in the body, large-surface read from the selector.
  for (const { selector, body } of cssRules(cssRegions(html))) {
    if (!LARGE_SURFACE.test(selector) || SMALL_ELEMENT.test(selector)) continue;
    let chromatic = 0, inBand = 0;
    for (const p of gradientPayloads(body)) { const t = tallyPayload(p); chromatic += t.chromatic; inBand += t.inBand; }
    if (isViolet(chromatic, inBand)) {
      findings.push({ checkId: CHECK_ID, axis: "Depth/Surface", severity: "error", message: MSG });
    }
  }

  // Source 2 — element opening tags: inline-style gradients + Tailwind gradient utilities.
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[2] ?? "";
    if (!LARGE_SURFACE.test(attrs) || SMALL_ELEMENT.test(attrs)) continue;
    let chromatic = 0, inBand = 0;
    for (const p of gradientPayloads(attrs)) { const t = tallyPayload(p); chromatic += t.chromatic; inBand += t.inBand; }
    const named = tallyNamed(attrs);
    chromatic += named.chromatic; inBand += named.inBand;
    if (isViolet(chromatic, inBand)) {
      findings.push({ checkId: CHECK_ID, axis: "Depth/Surface", severity: "error", message: MSG, line: lineOf(html, m.index) });
    }
  }

  return findings;
}
