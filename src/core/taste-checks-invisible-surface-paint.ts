/**
 * Paint model for mode-invisible-surface: what a layer lays down, as a luma
 * INTERVAL, and how a stack of layers composites.
 *
 * A layer whose colour text cannot name (an unresolved `var()`, `bg-card`, a photo)
 * is not guessed and not dropped: it is an opaque layer somewhere between black
 * and white. Compositing runs on both ends of the interval, so a verdict is made
 * only where both ends agree. A translucent dark dock over an unreadable stage is
 * dark whatever the stage is; a bare unreadable body is undecidable and skipped.
 *
 * Luma is the weighting this check has always used: 0.2126 R + 0.7152 G + 0.0722 B
 * of the sRGB-encoded channels. Alpha blending is linear, so luma blends directly.
 */
import { parseColor } from "./extractors/html/css-values.js";
import type { ParsedColor } from "./extractors/html/css-values.js";
import { linearToSRGB, oklabToLinearRGB, oklchToOklab } from "./color-convert.js";

/** A layer: luma in [lo, hi] (a point when the colour is known), covered by `alpha`. */
export interface Paint {
  lo: number;
  hi: number;
  alpha: number;
  /** Visibly coloured (not a grey): decides how a finding describes the surface. */
  chromatic: boolean;
  /**
   * Coverage is anywhere from 0 to `alpha` across the box, as a gradient fading to
   * transparent is. Both extremes are carried through compositing.
   */
  varying?: boolean;
}

/** An opaque layer of any colour: the honest representation of "text cannot say". */
export const UNKNOWN_PAINT: Paint = { lo: 0, hi: 1, alpha: 1, chromatic: false };

/** A layer that paints nothing. */
export const NO_PAINT: Paint = { lo: 0, hi: 0, alpha: 0, chromatic: false };

const CHROMA_SPREAD = 0.1; // max-min channel spread (of 255) above which a colour reads as coloured

export function lumaOfHex(hex: string): number {
  const ch = (i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  return (0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4)) / 255;
}

const isChromaticHex = (hex: string): boolean => {
  const c = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return (Math.max(...c) - Math.min(...c)) / 255 > CHROMA_SPREAD;
};

/**
 * The numbers of a colour function's arguments, units kept on percentages. Read as
 * numbers, not split on spaces: the cascade's minified output writes `25%/.5` and
 * `97%.01` with no space between them.
 */
const numbersIn = (args: string): string[] => args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?%?/gi) ?? [];

/** `hsl(h s% l% / a)` / `hsla(h, s%, l%, a)` → the `rgb(r g b / a)` text `parseColor` reads. */
function hslAsRgbText(token: string): string | undefined {
  const m = /^hsla?\(\s*([^)]+)\)$/i.exec(token.trim());
  if (m === null) return undefined;
  const p = numbersIn(m[1] as string);
  const h = Number.parseFloat(p[0] ?? "");
  const s = Number.parseFloat(p[1] ?? "") / 100;
  const l = Number.parseFloat(p[2] ?? "") / 100;
  if (![h, s, l].every(Number.isFinite)) return undefined;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + (((h % 360) + 360) % 360) / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `rgb(${f(0)} ${f(8)} ${f(4)}${p[3] === undefined ? "" : ` / ${p[3]}`})`;
}

/**
 * `oklch(L C H / a)` → `rgb(r g b / a)`, through color-convert's OKLab conversion.
 * Out-of-gamut channels are CLIPPED, not gamut-mapped like `oklchToHex`: a luma
 * check wants each channel as the canvas paints it, and clipping keeps the reading
 * this check has always used (tests pin both).
 */
function oklchAsRgbText(token: string): string | undefined {
  const m = /^oklch\(\s*([^)]+)\)$/i.exec(token.trim());
  if (m === null) return undefined;
  const p = numbersIn(m[1] as string);
  const num = (raw: string | undefined, percentOf: number): number =>
    raw === undefined ? Number.NaN : raw.endsWith("%") ? (Number.parseFloat(raw) / 100) * percentOf : Number.parseFloat(raw);
  const L = num(p[0], 1);
  const C = num(p[1], 0.4);
  const H = Number.parseFloat(p[2] ?? "0");
  if (![L, C, H].every(Number.isFinite)) return undefined;
  const encode = (v: number): number => Math.round(255 * linearToSRGB(Math.min(1, Math.max(0, v))));
  const [r, g, b] = oklabToLinearRGB(...oklchToOklab(L, C, H)).map(encode) as [number, number, number];
  const alpha = p[3];
  return `rgb(${r} ${g} ${b}${alpha === undefined ? "" : ` / ${alpha}`})`;
}

/**
 * One CSS colour token -> a colour. `parseColor` is the shared reader (hex of 3/4/6/8
 * digits, rgb()/rgba() in comma, space and slash syntax, percentages, a few names);
 * `hsl()` and `oklch()` are not in it, so they are converted here to the `rgb()` text
 * it reads.
 */
export function parsePaintColor(token: string): ParsedColor | undefined {
  const direct = parseColor(token);
  if (direct !== undefined) return direct;
  const asRgb = hslAsRgbText(token) ?? oklchAsRgbText(token);
  return asRgb === undefined ? undefined : parseColor(asRgb);
}

export function paintOfColor(c: ParsedColor): Paint {
  const luma = lumaOfHex(c.hex);
  return { lo: luma, hi: luma, alpha: c.alpha ?? 1, chromatic: isChromaticHex(c.hex) };
}

/** Same layer, different coverage. */
export const withAlpha = (p: Paint, alpha: number): Paint => ({ ...p, alpha });

const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.004;
export const samePaint = (a: Paint, b: Paint): boolean =>
  same(a.lo, b.lo) && same(a.hi, b.hi) && same(a.alpha, b.alpha);

/** The luma interval a stack lands on, and whether a coloured layer shaped it. */
export interface Backdrop {
  lo: number;
  hi: number;
  chromatic: boolean;
}

/**
 * Composite `layers` (innermost first) over `base`. Stops at the first opaque layer:
 * nothing under it shows. Both interval ends are carried through every blend.
 */
export function compositeStack(layers: readonly Paint[], base: Backdrop): Backdrop {
  const used: Paint[] = [];
  let floor = base;
  for (const layer of layers) {
    if (layer.alpha <= 0) continue;
    if (layer.alpha >= 0.995 && layer.varying !== true) { floor = { lo: layer.lo, hi: layer.hi, chromatic: layer.chromatic }; break; }
    used.push(layer);
  }
  let { lo, hi } = floor;
  let chromatic = floor.chromatic;
  for (let i = used.length - 1; i >= 0; i--) {
    const p = used[i] as Paint;
    const blendedLo = p.alpha * p.lo + (1 - p.alpha) * lo;
    const blendedHi = p.alpha * p.hi + (1 - p.alpha) * hi;
    lo = p.varying === true ? Math.min(lo, blendedLo) : blendedLo;
    hi = p.varying === true ? Math.max(hi, blendedHi) : blendedHi;
    chromatic ||= p.chromatic;
  }
  return { lo, hi, chromatic };
}
