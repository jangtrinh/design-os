// spec 004 P1 — the pure change contract: coalesce to one record per component,
// map Figma change types, derive scope hints, and stamp frames. No fs, no figma.
import { describe, it, expect } from 'vitest';
import {
  CHANGE_LOG_SCHEMA_VERSION,
  buildChangeFrame, coalesceChanges, deriveScopeHint, mapChangeType,
  type ComponentChange,
} from '../shared/figma-changes.ts';

const change = (over: Partial<ComponentChange>): ComponentChange => ({
  op: 'updated', nodeId: 'n1', nodeName: 'Button', nodeType: 'COMPONENT',
  changedProps: [], origin: 'LOCAL', ...over,
});

describe('mapChangeType — Figma type → component op', () => {
  it('maps the three node change types', () => {
    expect(mapChangeType('CREATE')).toBe('created');
    expect(mapChangeType('DELETE')).toBe('deleted');
    expect(mapChangeType('PROPERTY_CHANGE')).toBe('updated');
  });
  it('ignores STYLE_* and unknown types (components only in P1)', () => {
    for (const t of ['STYLE_CREATE', 'STYLE_DELETE', 'STYLE_PROPERTY_CHANGE', 'WAT']) {
      expect(mapChangeType(t)).toBeNull();
    }
  });
});

describe('deriveScopeHint — origin → scope hint', () => {
  it('REMOTE ⇒ global, LOCAL ⇒ local', () => {
    expect(deriveScopeHint('REMOTE')).toBe('global');
    expect(deriveScopeHint('LOCAL')).toBe('local');
  });
});

describe('coalesceChanges — one record per component', () => {
  it('collapses many raw changes on one id, unioning + sorting props', () => {
    const out = coalesceChanges([
      change({ nodeId: 'a', changedProps: ['fills'] }),
      change({ nodeId: 'a', changedProps: ['cornerRadius', 'fills'] }),
      change({ nodeId: 'a', changedProps: ['name'] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nodeId).toBe('a');
    expect(out[0].changedProps).toEqual(['cornerRadius', 'fills', 'name']); // deduped + sorted
  });

  it('op precedence: deleted > created > updated', () => {
    const del = coalesceChanges([
      change({ nodeId: 'a', op: 'updated' }),
      change({ nodeId: 'a', op: 'deleted' }),
      change({ nodeId: 'a', op: 'created' }),
    ]);
    expect(del[0].op).toBe('deleted');
    const created = coalesceChanges([
      change({ nodeId: 'a', op: 'updated' }),
      change({ nodeId: 'a', op: 'created' }),
    ]);
    expect(created[0].op).toBe('created');
  });

  it('promotes origin to REMOTE if any contributing change is remote', () => {
    const out = coalesceChanges([
      change({ nodeId: 'a', origin: 'LOCAL' }),
      change({ nodeId: 'a', origin: 'REMOTE' }),
    ]);
    expect(out[0].origin).toBe('REMOTE');
  });

  it('keeps the first non-null name (a delete contributes null)', () => {
    const out = coalesceChanges([
      change({ nodeId: 'a', op: 'deleted', nodeName: null }),
      change({ nodeId: 'a', op: 'updated', nodeName: 'Card' }),
    ]);
    expect(out[0].nodeName).toBe('Card');
  });

  it('emits deterministic order sorted by nodeId across components', () => {
    const out = coalesceChanges([
      change({ nodeId: 'z' }), change({ nodeId: 'a' }), change({ nodeId: 'm' }),
    ]);
    expect(out.map((c) => c.nodeId)).toEqual(['a', 'm', 'z']);
  });

  it('is idempotent on already-coalesced input', () => {
    const once = coalesceChanges([
      change({ nodeId: 'a', changedProps: ['fills'] }),
      change({ nodeId: 'b', changedProps: ['width'] }),
    ]);
    expect(coalesceChanges(once)).toEqual(once);
  });

  it('returns [] for an empty batch', () => {
    expect(coalesceChanges([])).toEqual([]);
  });
});

describe('buildChangeFrame — stamped, well-formed frame', () => {
  it('stamps v/ts/scopeHint + per-batch page/fileKey', () => {
    const frame = buildChangeFrame(
      change({ op: 'updated', nodeId: 'a', nodeName: 'Button', changedProps: ['fills'], origin: 'REMOTE' }),
      { page: 'Components', fileKey: 'FILEKEY123' },
      1_700_000_000_000,
    );
    expect(frame).toEqual({
      v: CHANGE_LOG_SCHEMA_VERSION,
      ts: 1_700_000_000_000,
      op: 'updated',
      nodeId: 'a',
      nodeName: 'Button',
      nodeType: 'COMPONENT',
      changedProps: ['fills'],
      origin: 'REMOTE',
      scopeHint: 'global',
      page: 'Components',
      fileKey: 'FILEKEY123',
    });
  });

  it('coerces loose/absent wire fields to safe defaults', () => {
    const loose = { op: 'deleted', nodeId: 'x' } as unknown as ComponentChange;
    const frame = buildChangeFrame(loose, { page: 'P', fileKey: null }, 1);
    expect(frame.nodeName).toBeNull();
    expect(frame.nodeType).toBe('');
    expect(frame.changedProps).toEqual([]);
    expect(frame.origin).toBe('LOCAL');
    expect(frame.scopeHint).toBe('local');
    expect(frame.fileKey).toBeNull();
  });
});
