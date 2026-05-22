/**
 * OKLCH color space conversions and sRGB gamut clamping.
 *
 * Implements the full sRGB ↔ Oklab ↔ OKLCH pipeline using Björn Ottosson's
 * matrices. Pure arithmetic — zero dependencies, no I/O, no randomness.
 *
 * Gamut clamping uses a 32-iteration binary search on chroma, preserving
 * lightness and hue (the perceptually important axes).
 */

export interface OKLCH {
  l: number; // 0–1 perceived lightness
  c: number; // 0–0.4 chroma / saturation
  h: number; // 0–360 hue angle
}

/** Typed error for invalid color input. */
export class ColorError extends Error {
  readonly code = "BAD_HEX";
  constructor(message: string) {
    super(message);
    this.name = "ColorError";
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Validate and expand hex string → [r, g, b] in 0–1 sRGB. Throws ColorError on bad input. */
function hexToSRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) {
    throw new ColorError(`invalid hex color: '${hex}'`);
  }
  const full =
    h.length === 3
      ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
      : h;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** [r, g, b] sRGB 0–1 → uppercase hex string. */
function srgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const toHex = (v: number) => {
    const h = Math.round(clamp(v) * 255).toString(16);
    return h.length === 1 ? "0" + h : h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** sRGB → linear RGB (gamma decode). */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear RGB → sRGB (gamma encode). */
function linearToSRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Linear RGB → Oklab (Björn Ottosson's matrices). */
function linearRGBToOklab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const l_ = Math.cbrt(
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
  );
  const m_ = Math.cbrt(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
  );
  const s_ = Math.cbrt(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  );
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/** Oklab → linear RGB (inverse matrices). */
function oklabToLinearRGB(
  L: number,
  a: number,
  b: number,
): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Oklab → OKLCH (rectangular → polar). */
function oklabToOKLCH(L: number, a: number, b: number): OKLCH {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/** OKLCH → Oklab (polar → rectangular). */
function oklchToOklab(l: number, c: number, h: number): [number, number, number] {
  const hRad = h * (Math.PI / 180);
  return [l, c * Math.cos(hRad), c * Math.sin(hRad)];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Check whether an OKLCH triple is inside the sRGB gamut (epsilon = 0.001). */
export function isInSRGBGamut(l: number, c: number, h: number): boolean {
  const [L, a, b] = oklchToOklab(l, c, h);
  const [r, g, bVal] = oklabToLinearRGB(L, a, b);
  const eps = 0.001;
  return (
    r >= -eps && r <= 1 + eps &&
    g >= -eps && g <= 1 + eps &&
    bVal >= -eps && bVal <= 1 + eps
  );
}

/**
 * Binary-search for the maximum chroma that keeps the color inside sRGB.
 * Preserves lightness and hue. 32 iterations → sub-micron precision.
 */
export function gamutClamp(l: number, c: number, h: number): OKLCH {
  if (c <= 0 || isInSRGBGamut(l, c, h)) return { l, c, h };
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (isInSRGBGamut(l, mid, h)) lo = mid;
    else hi = mid;
  }
  return { l, c: lo, h };
}

/**
 * Convert a hex color string to OKLCH.
 * Accepts `#rgb` and `#rrggbb` (case-insensitive).
 * Throws `ColorError` for any other input.
 */
export function hexToOKLCH(hex: string): OKLCH {
  const [r, g, b] = hexToSRGB(hex);
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const [L, a, bVal] = linearRGBToOklab(lr, lg, lb);
  return oklabToOKLCH(L, a, bVal);
}

/**
 * Convert OKLCH to an uppercase hex string, applying sRGB gamut clamping.
 */
export function oklchToHex(l: number, c: number, h: number): string {
  const clamped = gamutClamp(l, c, h);
  const [L, a, b] = oklchToOklab(clamped.l, clamped.c, clamped.h);
  const [lr, lg, lb] = oklabToLinearRGB(L, a, b);
  return srgbToHex(linearToSRGB(lr), linearToSRGB(lg), linearToSRGB(lb));
}
