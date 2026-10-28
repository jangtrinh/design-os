/**
 * Image layers of a `background`, as paint: gradients (stops give the luma bounds, a
 * fade to transparent makes the coverage vary) and `url()` images (read as their
 * colour fallback). Anything the text cannot name is UNKNOWN_PAINT.
 */
import { splitTopLevel } from "./extractors/html/css-values.js";
import { NO_PAINT, UNKNOWN_PAINT, paintOfColor, parsePaintColor } from "./taste-checks-invisible-surface-paint.js";
import type { Paint } from "./taste-checks-invisible-surface-paint.js";

const IMAGE_LAYER = /(?:^|[\s,(])(?:-webkit-)?(?:url|image-set)\(/i;
const GRADIENT_LAYER = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
const GRADIENT_PREFIX = /^(?:to\s|-?[\d.]+(?:deg|rad|turn|grad)\b|circle|ellipse|closest|farthest|at\s|from\s|in\s|[\d.]+%)/i;

/**
 * One gradient layer. Stops that carry colour set the luma bounds; stops with alpha
 * set the coverage, which varies across the box when any stop fades out. A stop whose
 * colour text cannot be read makes the whole layer unreadable (null).
 */
function gradientPaint(layer: string): Paint | null {
  const open = layer.indexOf("(");
  const close = layer.lastIndexOf(")");
  if (open < 0 || close < open) return null;
  const stops: Paint[] = [];
  let fades = false;
  for (const part of splitTopLevel(layer.slice(open + 1, close), ",")) {
    const colour = splitTopLevel(part, " ").map(parsePaintColor).find((c) => c !== undefined);
    if (colour === undefined) { if (GRADIENT_PREFIX.test(part.trim())) continue; return null; }
    const p = paintOfColor(colour);
    if (p.alpha < 0.995) fades = true;
    if (p.alpha > 0) stops.push(p);
  }
  if (stops.length === 0) return NO_PAINT;
  return {
    lo: Math.min(...stops.map((s) => s.lo)), hi: Math.max(...stops.map((s) => s.hi)),
    alpha: Math.max(...stops.map((s) => s.alpha)), chromatic: stops.some((s) => s.chromatic), varying: fades || undefined,
  };
}

/** `top` laid over an opaque `under`: the bounds widen to everything the coverage can produce. */
function overOpaque(top: Paint, under: Paint): Paint {
  const mixLo = top.alpha * top.lo + (1 - top.alpha) * under.lo;
  const mixHi = top.alpha * top.hi + (1 - top.alpha) * under.hi;
  const varying = top.varying === true;
  return {
    lo: varying ? Math.min(under.lo, mixLo) : mixLo, hi: varying ? Math.max(under.hi, mixHi) : mixHi,
    alpha: 1, chromatic: under.chromatic || top.chromatic,
  };
}

/**
 * Image layers (first listed = topmost) over a base colour. A `url()` image is read as
 * its colour fallback: authors set a background-color matching the image's tone, so a
 * textured surface keeps its base's polarity; with no opaque base it is unreadable.
 * Gradients are laid over what is beneath them, bottom layer first.
 */
export function withImages(images: readonly string[], base: Paint | undefined): Paint {
  let out = base;
  for (const layer of [...images].reverse()) {
    if (!GRADIENT_LAYER.test(layer)) {
      if (out === undefined || out.alpha < 0.995) return UNKNOWN_PAINT;
      continue;
    }
    const g = gradientPaint(layer);
    if (g === null) return UNKNOWN_PAINT;
    if (g.alpha <= 0) continue;
    if (out === undefined || out.alpha <= 0) out = g;
    else if (out.alpha >= 0.995 && out.varying !== true) out = g.alpha >= 0.995 && g.varying !== true ? g : overOpaque(g, out);
    else return UNKNOWN_PAINT; // a translucent colour under a gradient: the scan does not model the stack
  }
  return out ?? NO_PAINT;
}

export const isImageLayer = (layer: string): boolean => IMAGE_LAYER.test(layer) || GRADIENT_LAYER.test(layer);
