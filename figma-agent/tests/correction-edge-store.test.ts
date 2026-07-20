import { describe, expect, it } from 'vitest';
import { isDesignerCorrectionCandidate } from '../plugin/src/main/correction-edge-store';

describe('designer correction classification', () => {
  it('accepts focused property changes', () => {
    expect(isDesignerCorrectionCandidate('PROPERTY_CHANGE', ['fills'])).toBe(true);
    expect(isDesignerCorrectionCandidate('PROPERTY_CHANGE', ['itemSpacing', 'paddingTop'])).toBe(true);
  });

  it('rejects creation, deletion, and structural creation batches', () => {
    expect(isDesignerCorrectionCandidate('CREATE', [])).toBe(false);
    expect(isDesignerCorrectionCandidate('DELETE', [])).toBe(false);
    expect(isDesignerCorrectionCandidate('PROPERTY_CHANGE', ['fills', 'parent', 'relativeTransform']))
      .toBe(false);
  });
});
