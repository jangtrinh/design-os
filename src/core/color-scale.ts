/**
 * 11-stop OKLCH palette generation with dynamic anchoring, Gaussian chroma
 * tapering, and WCAG 2.2 contrast classification.
 *
 * Algorithm matches EaseUI color-scales.ts exactly so golden-value tests
 * can be verified byte-for-byte against its known output.
 */
import {
  hexToOKLCH,
  oklchToHex,
} from "./color-convert.js";

// ─── Scale constants ──────────────────────────────────────────────────────────

export const STOPS: readonly number[] = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
];

/**
 * Perceptually uniform target lightness per stop.
 * Typed as a complete Record so index access is safe without `!`.
 */
const TARGET_LIGHTNESS: Record<number, number> = {
  50: 0.97, 100: 0.93, 200: 0.84, 300: 0.74, 400: 0.64,
  500: 0.55, 600: 0.45, 700: 0.35, 800: 0.25, 900: 0.16, 950: 0.10,
};

/**
 * Safe accessor for TARGET_LIGHTNESS.
 * Throws if an unrecognised stop is requested (stops are a fixed closed set).
 */
function targetL(stop: number): number {
  const v = TARGET_LIGHTNESS[stop];
  if (v === undefined) {
    throw new Error(`unknown palette stop: ${stop}`);
  }
  return v;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContrastLevel = "AAA" | "AA" | "AA-large" | "fail";

export interface ColorScale {
  baseName: string;
  baseHex: string;
  anchorStop: number;
  shades: Record<string, string>;  // "50"–"950" → hex
  contrast: Record<string, number>; // "50"–"950" → WCAG ratio vs white
}

// ─── WCAG contrast ────────────────────────────────────────────────────────────

/** sRGB component → linear (gamma decode). Duplicated here to keep color-scale.ts self-contained. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Expand a hex string to normalised sRGB [0–1]. Assumes valid hex (callers pre-validate). */
function hexToSRGBUnchecked(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
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

/** WCAG 2.2 relative luminance from a hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToSRGBUnchecked(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/** WCAG 2.2 contrast ratio between two hex colors. */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Classify a contrast ratio into a WCAG 2.2 conformance band. */
export function classifyContrast(ratio: number): ContrastLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

// ─── Palette generation ───────────────────────────────────────────────────────

/**
 * Generate an 11-stop perceptually uniform color scale from a single hex input.
 *
 * Steps:
 * 1. Dynamic anchoring — find which stop the base lightness maps closest to.
 * 2. Per-stop lightness — blend target lightness with a proportional offset
 *    from the base color's natural deviation.
 * 3. Gaussian chroma tapering — chroma falls off symmetrically around the anchor
 *    (sigma = 350 in stop-space, matching the 0–950 range).
 * 4. Gamut clamp — binary-search max chroma that stays in sRGB.
 * 5. Contrast — WCAG ratio vs white, rounded to 2 dp.
 */
export function generatePalette(baseHex: string): ColorScale {
  const base = hexToOKLCH(baseHex);

  // 1. Dynamic anchoring
  let anchorStop = 500;
  let minDiff = Infinity;
  for (const stop of STOPS) {
    const diff = Math.abs(base.l - targetL(stop));
    if (diff < minDiff) {
      minDiff = diff;
      anchorStop = stop;
    }
  }

  const sigma = 350;
  const shades: Record<string, string> = {};
  const contrast: Record<string, number> = {};

  for (const stop of STOPS) {
    // 2. Lightness
    let newL: number;
    if (stop === anchorStop) {
      newL = base.l;
    } else {
      const distance = Math.abs(stop - anchorStop) / 900;
      const offset = base.l - targetL(anchorStop);
      newL = targetL(stop) + offset * (1 - distance);
      newL = Math.max(0.05, Math.min(0.99, newL));
    }

    // 3. Gaussian chroma
    const chromaFactor = Math.exp(
      -((stop - anchorStop) ** 2) / (2 * sigma ** 2),
    );
    const newC = base.c * chromaFactor;
    const newH = base.h;

    // 4. Convert + gamut clamp (oklchToHex calls gamutClamp internally)
    const hex = oklchToHex(newL, newC, newH);
    shades[String(stop)] = hex;

    // 5. Contrast vs white
    contrast[String(stop)] = Math.round(contrastRatio(hex, "#FFFFFF") * 100) / 100;
  }

  return {
    baseName: "color",
    baseHex: baseHex.toUpperCase(),
    anchorStop,
    shades,
    contrast,
  };
}
