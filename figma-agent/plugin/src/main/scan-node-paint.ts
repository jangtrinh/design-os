// Reverse-walker: Figma Paint / Effect → the payload's fill & effect shapes.
// The symmetric inverse of executor-frame's fill mapping and
// executor-styles.mapExportEffects. Extracted from scan-node.ts (Art IX).

import type { FigmaExportEffect, FigmaExportFill } from '../../../shared/figma-payload-types';

/** One Figma Paint → FigmaExportFill (SOLID alpha lives in paint.opacity → color.a). */
export function paintToFill(p: Paint): FigmaExportFill | null {
  if (p.type === 'SOLID') {
    const a = typeof p.opacity === 'number' ? p.opacity : 1;
    return { type: 'SOLID', color: { r: p.color.r, g: p.color.g, b: p.color.b, a } };
  }
  if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR') {
    const g = p as GradientPaint;
    return {
      type: p.type,
      gradientStops: g.gradientStops.map((s) => ({
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        position: s.position,
      })),
      gradientTransform: g.gradientTransform as unknown as [number, number, number][],
    };
  }
  return null; // IMAGE / VIDEO paints not modelled by this spike
}

/** Figma Effect → FigmaExportEffect (inverse of executor-styles.mapExportEffects). */
export function effectToExport(e: Effect): FigmaExportEffect | null {
  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
    return { type: e.type, radius: e.radius };
  }
  const s = e as DropShadowEffect;
  const c = s.color;
  return {
    type: e.type as FigmaExportEffect['type'],
    offset: { x: s.offset.x, y: s.offset.y },
    radius: s.radius,
    spread: s.spread ?? 0,
    color: { r: c.r, g: c.g, b: c.b, a: c.a },
  };
}

/** A node's fills/strokes array → payload fills; undefined when nothing modelled. */
export const asFills = (v: unknown): FigmaExportFill[] | undefined => {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out = (v as Paint[]).map(paintToFill).filter((f): f is FigmaExportFill => f !== null);
  return out.length ? out : undefined;
};
