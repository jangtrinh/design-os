// Reverse-walker: TEXT-only readers — the inverse of executor-text.createTextNode.
// Extracted from scan-node.ts (Art IX).

import type { FigmaColor, FigmaExportNode } from '../../../shared/figma-payload-types';
import type { ScannedNode } from './scan-node-types';
import { asFills } from './scan-node-paint';
import { safe } from './scan-node-utils';

// Inverse of executor-fonts.getFontStyleVariants: a Figma style name → numeric
// weight. Only recovers the weight the build path could have emitted; unknown
// styles leave fontWeight unset (documented reversibility limit).
export function styleToWeight(style: string): number | undefined {
  const s = style.toLowerCase().replace(/\s|italic/g, '');
  const map: Record<string, number> = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
    regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
    bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
  };
  return map[s];
}

/** Text-only fields — inverse of executor-text.createTextNode. */
export function readText(n: Record<string, unknown>, out: ScannedNode): void {
  if (typeof n.characters === 'string') out.characters = n.characters;
  const font = safe(() => n.fontName as FontName);
  if (font && typeof font === 'object' && 'family' in font) {
    out.fontFamily = font.family;
    if (font.style.toLowerCase().includes('italic')) out.fontStyle = 'italic';
    const w = styleToWeight(font.style);
    if (w !== undefined) out.fontWeight = w;
  }
  if (typeof n.fontSize === 'number') out.fontSize = n.fontSize;
  const lh = safe(() => n.lineHeight as LineHeight);
  if (lh && typeof lh === 'object' && lh.unit === 'PIXELS') out.lineHeight = lh.value;
  const ls = safe(() => n.letterSpacing as LetterSpacing);
  if (ls && typeof ls === 'object' && ls.unit === 'PIXELS') out.letterSpacing = ls.value;
  if (n.textAlignHorizontal) out.textAlignHorizontal = n.textAlignHorizontal as FigmaExportNode['textAlignHorizontal'];
  if (n.textAutoResize) out.textAutoResize = n.textAutoResize as FigmaExportNode['textAutoResize'];
  if (n.textDecoration && n.textDecoration !== 'NONE') out.textDecoration = n.textDecoration as FigmaExportNode['textDecoration'];
  if (n.textCase && n.textCase !== 'ORIGINAL') out.textCase = n.textCase as FigmaExportNode['textCase'];
  // TEXT colour lives in fills[0]; surface it as textColor (build-path convention).
  const fills = asFills(n.fills);
  if (fills && fills[0]?.type === 'SOLID' && fills[0].color) out.textColor = fills[0].color as FigmaColor;
}
