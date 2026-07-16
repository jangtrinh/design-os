// Reverse-walker: auto-layout + self-sizing readers — the symmetric inverse of
// executor-frame.applyAutoLayout and applyChildSizingHints.
// Extracted from scan-node.ts (Art IX).

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import type { ScannedNode } from './scan-node-types';
import { safe } from './scan-node-utils';

/** Auto-layout + sizing block — the symmetric core of applyAutoLayout/child-sizing. */
export function readLayout(n: Record<string, unknown>, out: ScannedNode): void {
  const mode = n.layoutMode as string | undefined;
  if (mode && mode !== 'NONE') {
    out.layoutMode = mode as FigmaExportNode['layoutMode'];
    if (typeof n.itemSpacing === 'number') out.itemSpacing = n.itemSpacing;
    for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
      if (typeof n[k] === 'number') out[k] = n[k] as number;
    }
    if (n.primaryAxisSizingMode) out.primaryAxisSizingMode = n.primaryAxisSizingMode as 'AUTO' | 'FIXED';
    if (n.counterAxisSizingMode) out.counterAxisSizingMode = n.counterAxisSizingMode as 'AUTO' | 'FIXED';
    if (n.primaryAxisAlignItems) out.primaryAxisAlignItems = n.primaryAxisAlignItems as FigmaExportNode['primaryAxisAlignItems'];
    if (n.counterAxisAlignItems) out.counterAxisAlignItems = n.counterAxisAlignItems as FigmaExportNode['counterAxisAlignItems'];
    if (n.layoutWrap === 'WRAP') out.layoutWrap = 'WRAP';
    if (typeof n.counterAxisSpacing === 'number') out.counterAxisSpacing = n.counterAxisSpacing;
    if (n.counterAxisAlignContent === 'SPACE_BETWEEN') out.counterAxisAlignContent = 'SPACE_BETWEEN';
    if (mode === 'GRID') {
      for (const k of ['gridColumnCount', 'gridRowCount', 'gridRowGap', 'gridColumnGap'] as const) {
        if (typeof n[k] === 'number') out[k] = n[k] as number;
      }
    }
  }
}

/** Self-sizing — set by the PARENT's child-sizing loop; readable on ANY child (incl. TEXT). */
export function readSelfSizing(n: Record<string, unknown>, out: ScannedNode): void {
  const h = safe(() => n.layoutSizingHorizontal as string);
  const v = safe(() => n.layoutSizingVertical as string);
  if (h === 'FILL' || h === 'FIXED' || h === 'HUG') out.layoutSizingHorizontal = h;
  if (v === 'FILL' || v === 'FIXED' || v === 'HUG') out.layoutSizingVertical = v;
  if (typeof n.layoutGrow === 'number' && n.layoutGrow > 0) out.layoutGrow = n.layoutGrow;
}
