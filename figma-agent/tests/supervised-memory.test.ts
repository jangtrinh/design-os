import { describe, expect, it } from 'vitest';
import {
  buildCorrectionEvent,
  mergeCorrectionStores,
  retainCorrectionEvents,
} from '../shared/supervised-memory';

const event = (eventId: string, timestamp: string, unresolved = false) => buildCorrectionEvent({
  eventId,
  fileKey: 'file-1',
  nodeId: '1:2',
  source: 'designer',
  kind: 'designer-correction',
  timestamp,
  unresolved,
  traits: { spacing: { from: 8, to: 12 } },
});

describe('supervised correction memory', () => {
  it('merges unique events deterministically', () => {
    const a = event('a', '2026-07-01T00:00:00.000Z');
    const b = event('b', '2026-07-02T00:00:00.000Z');
    expect(mergeCorrectionStores([b], [a]).active.map((item) => item.eventId)).toEqual(['a', 'b']);
  });

  it('quarantines same-id different-content and keeps project active', () => {
    const project = event('a', '2026-07-01T00:00:00.000Z');
    const edge = buildCorrectionEvent({ ...project, timestamp: '2026-07-03T00:00:00.000Z' });
    const result = mergeCorrectionStores([project], [edge]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.active[0]?.timestamp).toBe(project.timestamp);
  });

  it('applies explicit tombstones', () => {
    const original = event('a', '2026-07-01T00:00:00.000Z');
    const tombstone = buildCorrectionEvent({
      eventId: 'delete-a',
      fileKey: 'file-1',
      nodeId: '1:2',
      source: 'system',
      kind: 'tombstone',
      timestamp: '2026-07-02T00:00:00.000Z',
      causalParent: 'a',
      traits: {},
    });
    const result = mergeCorrectionStores([original, tombstone], []);
    expect(result.active).toEqual([]);
    expect(result.tombstonedIds).toEqual(['a']);
  });

  it('retains unresolved events beyond age and count limits (while the cap has room)', () => {
    const oldUnresolved = event('protected', '2020-01-01T00:00:00.000Z', true);
    const recent = [
      event('a', '2026-07-18T00:00:00.000Z'),
      event('b', '2026-07-19T00:00:00.000Z'),
    ];
    const result = retainCorrectionEvents([oldUnresolved, ...recent], new Date('2026-07-20T00:00:00.000Z'), 2);
    expect(result.kept.map((item) => item.eventId)).toEqual(['protected', 'b']);
    expect(result.evictedUnresolved).toEqual([]);
  });

  // Registry-integrity phase 04 (5.4), §3 — the TRUE hard cap: unresolved entries can no
  // longer escape it once resolved events are exhausted.
  describe('a TRUE hard cap — unresolved entries can no longer escape it', () => {
    it('unresolved alone exceeding the limit evicts the OLDEST unresolved, not silently keeps all', () => {
      const unresolved = [
        event('u1', '2026-01-01T00:00:00.000Z', true),
        event('u2', '2026-01-02T00:00:00.000Z', true),
        event('u3', '2026-01-03T00:00:00.000Z', true),
      ];
      const result = retainCorrectionEvents(unresolved, new Date('2026-01-10T00:00:00.000Z'), 2);
      expect(result.kept.map((e) => e.eventId)).toEqual(['u2', 'u3']); // oldest (u1) evicted
      expect(result.evictedUnresolved.map((e) => e.eventId)).toEqual(['u1']);
      expect(result.kept.length).toBeLessThanOrEqual(2); // the cap actually holds
    });

    it('eviction order: resolved-and-old first (unconditional expiry, not reported as evicted-unresolved)', () => {
      const expiredResolved = event('expired', '2020-01-01T00:00:00.000Z', false);
      const unresolved = event('u1', '2026-01-01T00:00:00.000Z', true);
      const result = retainCorrectionEvents([expiredResolved, unresolved], new Date('2026-07-20T00:00:00.000Z'), 10);
      expect(result.kept.map((e) => e.eventId)).toEqual(['u1']); // expired resolved dropped by age, not the cap
      expect(result.evictedUnresolved).toEqual([]); // never attributed to the hard-cap eviction
    });

    it('eviction order: resolved (fresh) evicted before ANY unresolved, even when resolved is newer', () => {
      const resolvedFresh = event('r1', '2026-01-05T00:00:00.000Z', false);
      const unresolvedOld = event('u1', '2026-01-01T00:00:00.000Z', true);
      const result = retainCorrectionEvents([resolvedFresh, unresolvedOld], new Date('2026-01-10T00:00:00.000Z'), 1);
      expect(result.kept.map((e) => e.eventId)).toEqual(['u1']); // resolved evicted first despite being newer
      expect(result.evictedUnresolved).toEqual([]); // the evicted one was resolved, not unresolved
    });

    it('every evicted-unresolved event is accounted for — count in == count out', () => {
      const unresolved = Array.from({ length: 10 }, (_, i) =>
        event(`u${i}`, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, true));
      const result = retainCorrectionEvents(unresolved, new Date('2026-02-01T00:00:00.000Z'), 4);
      expect(result.kept).toHaveLength(4);
      expect(result.evictedUnresolved).toHaveLength(6);
      expect(new Set([...result.kept, ...result.evictedUnresolved].map((e) => e.eventId)).size).toBe(10); // no duplicates, none lost
    });

    it('a limit of 0 evicts everything, including all unresolved', () => {
      const unresolved = event('u1', '2026-01-01T00:00:00.000Z', true);
      const result = retainCorrectionEvents([unresolved], new Date('2026-01-02T00:00:00.000Z'), 0);
      expect(result.kept).toEqual([]);
      expect(result.evictedUnresolved.map((e) => e.eventId)).toEqual(['u1']);
    });
  });
});
