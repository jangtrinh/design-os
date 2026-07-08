// Track 5 Commit 1 pure-logic unit tests:
//   - background-size → scaleMode mapping (COPY #2)
//   - parseBoxShadow spread parsing + multi-shadow arrays (COPY #8)
// No live Figma canvas required. See background-fill.ts / parse-css.ts.
//
// LIVE-E2E PENDING (Commit 1, needs plugin reopened in Figma Desktop):
//   - a div with background-image:data: renders as an IMAGE fill (not blank)
//   - background-size:contain → FIT scaleMode visibly letterboxes
//   - a WebP <img> decodes via the createImageAsync fallback
//   - a spread box-shadow clips correctly with clipsContent set
import { describe, it, expect } from 'vitest';
import { backgroundSizeToScaleMode } from '../plugin/src/main/background-fill.ts';
import { parseBoxShadow } from '../plugin/src/ui/converter/parse-css.ts';

describe('backgroundSizeToScaleMode', () => {
  it('maps cover / auto / unset → FILL', () => {
    expect(backgroundSizeToScaleMode('cover')).toBe('FILL');
    expect(backgroundSizeToScaleMode('auto')).toBe('FILL');
    expect(backgroundSizeToScaleMode('')).toBe('FILL');
    expect(backgroundSizeToScaleMode(undefined)).toBe('FILL');
  });

  it('maps contain → FIT', () => {
    expect(backgroundSizeToScaleMode('contain')).toBe('FIT');
    expect(backgroundSizeToScaleMode('  CONTAIN  ')).toBe('FIT');
  });

  it('maps a repeat token → TILE', () => {
    expect(backgroundSizeToScaleMode('repeat')).toBe('TILE');
  });

  it('maps explicit px / % → FILL (v1 approximation)', () => {
    expect(backgroundSizeToScaleMode('120px 80px')).toBe('FILL');
    expect(backgroundSizeToScaleMode('50% 100%')).toBe('FILL');
  });
});

describe('parseBoxShadow spread + array (COPY #8)', () => {
  it('parses positive spread from a 4-length drop shadow', () => {
    const e = parseBoxShadow('0px 0px 0px 4px rgba(124,58,237,1)');
    expect(e).not.toBeNull();
    expect(e!.type).toBe('DROP_SHADOW');
    expect(e!.spread).toBe(4);
  });

  it('defaults spread to 0 when omitted (3-length)', () => {
    const e = parseBoxShadow('0px 4px 12px rgba(0,0,0,0.15)');
    expect(e!.spread).toBe(0);
  });

  it('marks inset shadows as INNER_SHADOW', () => {
    const e = parseBoxShadow('inset 0px 2px 6px 2px rgba(0,0,0,0.3)');
    expect(e!.type).toBe('INNER_SHADOW');
    expect(e!.spread).toBe(2);
  });

  it('a comma-joined multi-shadow splits into N parsed effects with spreads', () => {
    // Mirrors build-frame.ts: split on commas outside rgba(), parse each part.
    const css = '0px 1px 2px rgba(0,0,0,0.1), 0px 8px 24px 4px rgba(0,0,0,0.2)';
    const parts = css.split(/,(?![^(]*\))/);
    const effects = parts.map((p) => parseBoxShadow(p.trim())).filter(Boolean);
    expect(effects).toHaveLength(2);
    expect(effects.map((e) => e!.spread)).toEqual([0, 4]);
    expect(effects.some((e) => (e!.spread || 0) > 0)).toBe(true);
  });
});
