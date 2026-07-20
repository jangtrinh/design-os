import { describe, expect, it } from 'vitest';
import { resolveSafeTarget, TargetResolutionError } from '../shared/safe-target';

describe('safe target resolution', () => {
  it('prefers explicit then selection then recent', () => {
    expect(resolveSafeTarget({ explicit: '1', selection: ['2'], recent: ['3'] }))
      .toEqual({ nodeId: '1', source: 'explicit' });
    expect(resolveSafeTarget({ selection: ['2'], recent: ['3'] }))
      .toEqual({ nodeId: '2', source: 'selection' });
    expect(resolveSafeTarget({ recent: ['3'] }))
      .toEqual({ nodeId: '3', source: 'recent' });
  });

  it('requires explicit ids for destructive operations', () => {
    expect(() => resolveSafeTarget({ selection: ['2'], destructive: true }))
      .toThrow(TargetResolutionError);
  });
});
