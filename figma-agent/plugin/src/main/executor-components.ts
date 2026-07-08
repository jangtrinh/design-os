// Commit 4a — Interaction TRIGGER → Figma variant component set + ON_HOVER
// reaction (Smart-Animate). A state-carrying subtree is built twice (Default +
// Hover), each wrapped in a COMPONENT (frames throw in combineAsVariants),
// combined as variants, then a CHANGE_TO Smart-Animate reaction is set on the
// Default variant. Fed by behavior.json `states`.
//
// The PURE builders (buildHoverReaction, applyStateDeltasToHoverNode,
// computeStackBounds) are unit-tested WITHOUT a live canvas.
//
// LIVE-E2E PENDING (needs plugin reopened in Figma Desktop):
//   - 2-variant COMPONENT_SET is created; children reposition off (0,0)
//   - Vibma guard: destination is a COMPONENT inside a COMPONENT_SET (else
//     Figma fails silently) — verify the reaction actually fires in prototype
//   - hover auto-reverts (else fall back to MOUSE_ENTER/LEAVE pair)
import type { FigmaColor, FigmaExportNode } from '../../../shared/figma-payload-types';
import { parseCssColor } from '../ui/converter/color-utils';
import { createFigmaNode } from './executor-frame';
import { pushImportWarning } from './executor-styles';

/** One computed-style delta captured on hover/focus (behavior.json states). */
export interface StateDelta { property: string; from: string; to: string }

export const VARIANT_DEFAULT = 'State=Default';
export const VARIANT_HOVER = 'State=Hover';

// ── Pure builders ────────────────────────────────────────────────────────

/** Build the ON_HOVER → CHANGE_TO Smart-Animate reaction targeting `hoverId`. */
export function buildHoverReaction(
  hoverId: string, durationSec = 0.3, easingType: Easing['type'] = 'EASE_OUT',
): Reaction {
  return {
    trigger: { type: 'ON_HOVER' },
    actions: [{
      type: 'NODE',
      destinationId: hoverId,
      navigation: 'CHANGE_TO',
      transition: { type: 'SMART_ANIMATE', easing: { type: easingType }, duration: durationSec },
      resetScrollPosition: true,
    }],
  };
}

/**
 * Produce a HOVER-variant payload node from a Default node + captured state
 * deltas. Maps the common CSS state props (color, background, border, opacity)
 * onto a deep clone. transform/box-shadow deltas are handled by Motion (4b),
 * not by variant diffs.
 */
export function applyStateDeltasToHoverNode(base: FigmaExportNode, deltas: StateDelta[]): FigmaExportNode {
  const hover: FigmaExportNode = JSON.parse(JSON.stringify(base)); // payload is plain JSON
  for (const d of deltas) {
    const c: FigmaColor | null = parseCssColor(d.to);
    switch (d.property) {
      case 'color':
        if (c && hover.type === 'TEXT') hover.textColor = c;
        else if (c) hover.textColor = c;
        break;
      case 'backgroundColor':
      case 'backgroundImage':
        if (c) hover.fills = [{ type: 'SOLID', color: c }];
        break;
      case 'borderColor':
      case 'borderBottomColor':
        if (c) { hover.strokes = [{ type: 'SOLID', color: c }]; hover.strokeWeight = hover.strokeWeight || 1; }
        break;
      case 'opacity': {
        const o = parseFloat(d.to);
        if (!Number.isNaN(o)) hover.opacity = o;
        break;
      }
      default:
        break; // transform / boxShadow / filter → Motion (4b)
    }
  }
  return hover;
}

/** Bounds for the variant frame: children stack at (0,0), so pad past the far corner. */
export function computeStackBounds(boxes: { x: number; y: number; w: number; h: number }[]): { w: number; h: number } {
  let maxX = 0;
  let maxY = 0;
  for (const b of boxes) { maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
  return { w: Math.max(1, maxX) + 40, h: Math.max(1, maxY) + 40 };
}

// ── Impure orchestrator ────────────────────────────────────────────────────

/**
 * Build a 2-variant (Default/Hover) component set with an ON_HOVER Smart-Animate
 * reaction. Returns the ComponentSetNode, or null when the subtree can't build.
 * LIVE-E2E PENDING (see file header).
 */
export async function createStateVariantComponent(
  defaultNode: FigmaExportNode,
  hoverDeltas: StateDelta[],
  colorStyles: Map<string, PaintStyle>,
  tokenVars?: Map<string, Variable>,
): Promise<ComponentSetNode | null> {
  const defaultScene = await createFigmaNode(defaultNode, colorStyles, tokenVars);
  const hoverScene = await createFigmaNode(applyStateDeltasToHoverNode(defaultNode, hoverDeltas), colorStyles, tokenVars);
  if (!defaultScene || !hoverScene) return null;

  const wrap = (scene: SceneNode, name: string): ComponentNode => {
    const comp = figma.createComponent();
    comp.name = name;
    const w = 'width' in scene ? (scene as { width: number }).width : (defaultNode.width || 100);
    const h = 'height' in scene ? (scene as { height: number }).height : (defaultNode.height || 100);
    const bounds = computeStackBounds([{ x: 0, y: 0, w, h }]);
    comp.resizeWithoutConstraints(bounds.w, bounds.h); // mandatory: children stack at 0,0
    comp.appendChild(scene);
    try { scene.x = 0; scene.y = 0; } catch { /* not positionable */ }
    return comp;
  };

  const defaultComp = wrap(defaultScene, VARIANT_DEFAULT);
  const hoverComp = wrap(hoverScene, VARIANT_HOVER);

  let set: ComponentSetNode;
  try {
    set = figma.combineAsVariants([defaultComp, hoverComp], figma.currentPage);
  } catch (err) {
    pushImportWarning(`combineAsVariants failed (need COMPONENTs): ${String(err)}`);
    return null;
  }

  // Vibma guard: destination MUST be a COMPONENT inside the COMPONENT_SET.
  if (hoverComp.parent !== set || hoverComp.type !== 'COMPONENT') {
    pushImportWarning('hover variant is not a COMPONENT inside the set — reaction skipped');
    return set;
  }
  try {
    await defaultComp.setReactionsAsync([buildHoverReaction(hoverComp.id)]);
  } catch (err) {
    pushImportWarning(`setReactionsAsync failed: ${String(err)}`);
  }
  return set;
}
