// Phase 03 — the two fail-open holes a safety flag must never have: an "unset" flag that
// silently serializes as a value (wire), and a result shape `withFileContext` mangles instead
// of leaving alone (CLI output). `getLastFileContext` is mocked because it is broker-client.ts
// module state, normally only set by a live reply — everything under test here is pure logic
// around that boundary.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { makeRequestFrame } from '../shared/protocol.ts';

vi.mock('../cli/src/transport/broker-client.ts', () => ({
  getLastFileContext: vi.fn(),
}));

import { getLastFileContext } from '../cli/src/transport/broker-client.ts';
import { withFileContext } from '../cli/src/util/json-out.ts';

describe('makeRequestFrame — expectedFile omission (byte-identical to a pre-flag frame)', () => {
  it('a whitespace-only expectedFile is omitted entirely', () => {
    const withSpace = makeRequestFrame('id1', 'STATUS', {}, undefined, '  ');
    const withoutFlag = makeRequestFrame('id1', 'STATUS', {}, undefined, undefined);
    expect(withSpace).toEqual(withoutFlag);
    expect('expectedFile' in withSpace).toBe(false);
  });

  it('a real expectedFile is included', () => {
    const frame = makeRequestFrame('id1', 'STATUS', {}, undefined, 'VSF - PCP');
    expect(frame.expectedFile).toBe('VSF - PCP');
  });
});

describe('withFileContext', () => {
  // Both fallback branches below deliberately write one stderr line — spy it away so the
  // suite's own output stays clean; the write itself is not what these tests assert.
  beforeAll(() => { vi.spyOn(process.stderr, 'write').mockImplementation(() => true); });

  it('no lastFileContext → result returned unchanged', () => {
    vi.mocked(getLastFileContext).mockReturnValue(undefined);
    expect(withFileContext({ a: 1 })).toEqual({ a: 1 });
  });

  it('a plain object gains the fileContext key', () => {
    vi.mocked(getLastFileContext).mockReturnValue({ fileName: 'F', fileKey: null });
    expect(withFileContext({ a: 1 })).toEqual({ a: 1, fileContext: { fileName: 'F', fileKey: null } });
  });

  it('an array/string/number result is returned UNCHANGED — no key to attach the proof to', () => {
    vi.mocked(getLastFileContext).mockReturnValue({ fileName: 'F', fileKey: null });
    expect(withFileContext([1, 2])).toEqual([1, 2]);
    expect(withFileContext('hello')).toBe('hello');
    expect(withFileContext(42)).toBe(42);
  });

  it('a result that already owns fileContext is returned UNCHANGED — belongs to the command', () => {
    vi.mocked(getLastFileContext).mockReturnValue({ fileName: 'F', fileKey: null });
    const original = { result: 1, fileContext: { fileName: 'OTHER' } };
    expect(withFileContext(original)).toBe(original);
  });
});
