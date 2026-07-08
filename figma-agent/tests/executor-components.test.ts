// Track 5 Commit 4a pure-builder unit tests: states → variant/reaction payload.
// No live canvas. The node-building orchestrator (createStateVariantComponent)
// is LIVE-E2E PENDING (see executor-components.ts header).
import { describe, it, expect } from 'vitest';
import {
  buildHoverReaction, applyStateDeltasToHoverNode, computeStackBounds,
  type StateDelta,
} from '../plugin/src/main/executor-components.ts';
import type { FigmaExportNode } from '../shared/figma-payload-types.ts';

describe('buildHoverReaction', () => {
  it('builds ON_HOVER → CHANGE_TO SMART_ANIMATE targeting the hover variant', () => {
    const r = buildHoverReaction('123:456');
    expect(r.trigger).toEqual({ type: 'ON_HOVER' });
    expect(r.actions).toHaveLength(1);
    const a = r.actions![0]!;
    expect(a).toMatchObject({
      type: 'NODE',
      destinationId: '123:456',
      navigation: 'CHANGE_TO',
      resetScrollPosition: true,
    });
    expect(a.type === 'NODE' && a.transition).toMatchObject({
      type: 'SMART_ANIMATE', duration: 0.3, easing: { type: 'EASE_OUT' },
    });
  });

  it('honours a custom duration + easing', () => {
    const r = buildHoverReaction('1:2', 0.5, 'EASE_IN_AND_OUT');
    const a = r.actions![0]!;
    expect(a.type === 'NODE' && a.transition).toMatchObject({ duration: 0.5, easing: { type: 'EASE_IN_AND_OUT' } });
  });
});

describe('applyStateDeltasToHoverNode', () => {
  const base: FigmaExportNode = { type: 'FRAME', name: 'Button', fills: [{ type: 'SOLID', color: { r: 0.06, g: 0.06, b: 0.06, a: 1 } }] };

  it('maps backgroundColor → fills and does not mutate the base', () => {
    const deltas: StateDelta[] = [{ property: 'backgroundColor', from: 'rgb(17, 17, 17)', to: 'rgb(124, 58, 237)' }];
    const hover = applyStateDeltasToHoverNode(base, deltas);
    expect(hover.fills![0]!.type).toBe('SOLID');
    expect(hover.fills![0]!.color!.r).toBeCloseTo(124 / 255, 2);
    // base untouched (deep clone)
    expect(base.fills![0]!.color!.r).toBeCloseTo(0.06, 2);
  });

  it('maps color on a TEXT node → textColor, opacity, and border → strokes', () => {
    const text: FigmaExportNode = { type: 'TEXT', name: 'Link', characters: 'Home' };
    const hover = applyStateDeltasToHoverNode(text, [
      { property: 'color', from: 'rgb(14, 165, 233)', to: 'rgb(124, 58, 237)' },
      { property: 'opacity', from: '1', to: '0.8' },
    ]);
    expect(hover.textColor!.b).toBeCloseTo(237 / 255, 2);
    expect(hover.opacity).toBeCloseTo(0.8, 5);

    const bordered = applyStateDeltasToHoverNode(base, [
      { property: 'borderColor', from: 'rgb(0,0,0)', to: 'rgb(255, 0, 0)' },
    ]);
    expect(bordered.strokes![0]!.color!.r).toBeCloseTo(1, 5);
    expect(bordered.strokeWeight).toBe(1);
  });

  it('leaves transform/box-shadow deltas to Motion (no fills/stroke change)', () => {
    const hover = applyStateDeltasToHoverNode(base, [
      { property: 'transform', from: 'none', to: 'scale(1.05)' },
      { property: 'boxShadow', from: 'none', to: '0 8px 24px rgba(0,0,0,.4)' },
    ]);
    expect(hover.fills).toEqual(base.fills);
    expect(hover.strokes).toBeUndefined();
  });
});

describe('computeStackBounds', () => {
  it('pads past the far corner (children stack at 0,0)', () => {
    expect(computeStackBounds([{ x: 0, y: 0, w: 120, h: 44 }])).toEqual({ w: 160, h: 84 });
    expect(computeStackBounds([{ x: 10, y: 20, w: 100, h: 30 }, { x: 0, y: 0, w: 200, h: 10 }]))
      .toEqual({ w: 240, h: 90 });
  });
});
